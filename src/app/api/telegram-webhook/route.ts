// src/app/api/telegram-webhook/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';



// key = chatId, value = { queue: sentenceIds[], currentIndex: number }
const translateSession = new Map<number, { queue: number[]; currentIndex: number }>();

// key = chatId, value = current pinyin word + running score
const pinyinSession = new Map<number, { pinyin: string; hanzi: string; correct: number; total: number }>();

// --- Helper: pick a random word and send it ---
async function sendNextPinyinWord(chatId: number, correct: number, total: number) {
  const count = await prisma.word.count();
  const skip = Math.floor(Math.random() * count);
  const words = await prisma.word.findMany({ take: 1, skip });
  const word = words[0];

  pinyinSession.set(chatId, {
    pinyin: word.pinyin,
    hanzi: word.hanzi,
    correct,
    total,
  });

  await sendTelegramMessage(
    `🎯 <b>${word.meaning}</b>`,
    { parse_mode: 'HTML' }
  );
}

const DIRECTION_LABELS: Record<string, string> = {
  HANZI_TO_EN: '汉字 → 🇬🇧',
  HANZI_TO_FR: '汉字 → 🇫🇷',
  PY_TO_EN:    '拼音 → 🇬🇧',
  PY_TO_FR:    '拼音 → 🇫🇷',
  EN_TO_PY:    '🇬🇧 → 拼音',
  FR_TO_PY:    '🇫🇷 → 拼音',
};

const SESSION_SIZE = 6;

// --- Handler ---

export async function POST(req: Request) {
  const body = await req.json();
  const message = body?.message;
  const text = message?.text?.trim();
  const chatId: number = message?.chat?.id;

  if (!text || !chatId) return NextResponse.json({ ok: true });

  // --- /pinyin command — start continuous session ---
  if (text === '/pinyin') {
    const count = await prisma.word.count();
    if (count === 0) {
      await sendTelegramMessage('Aucun mot dans le vocabulaire.');
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(
      `🎯 <b>Pinyin Challenge</b>\n\nTranslate to pinyin with tone marks (e.g. nǐ hǎo)\nSend /pinyinfinish to end the session.\n`,
      { parse_mode: 'HTML' }
    );

    await sendNextPinyinWord(chatId, 0, 0);

    return NextResponse.json({ ok: true });
  }

  // --- /pinyinfinish command — end session and show summary ---
  if (text === '/pinyinfinish') {
    const session = pinyinSession.get(chatId);

    if (session) {
      const { correct, total } = session;
      pinyinSession.delete(chatId);

      if (total === 0) {
        await sendTelegramMessage('Session terminée. Aucune réponse donnée.');
      } else {
        const pct = Math.round((correct / total) * 100);
        await sendTelegramMessage(
          `📊 <b>Session terminée</b>\n\n` +
          `${correct}/${total} correct (${pct}%)`,
          { parse_mode: 'HTML' }
        );
      }
    } else {
      await sendTelegramMessage('Aucune session pinyin en cours.');
    }

    return NextResponse.json({ ok: true });
  }

  // --- /translate command ---
  if (text === '/translate') {
    const available = await prisma.translationSentence.findMany({
      where: { used: false },
    });

    if (available.length === 0) {
      await sendTelegramMessage(
        '📭 No translation exercises available yet. Check back soon!',
        { parse_mode: 'HTML' }
      );
      return NextResponse.json({ ok: true });
    }

    // Pick SESSION_SIZE sentences, spread across directions
    const directions = ['HANZI_TO_EN', 'HANZI_TO_FR', 'PY_TO_EN', 'PY_TO_FR', 'EN_TO_PY', 'FR_TO_PY'];
    const picked: typeof available = [];

    for (const dir of directions) {
      if (picked.length >= SESSION_SIZE) break;
      const match = available.find(s => s.direction === dir && !picked.includes(s));
      if (match) picked.push(match);
    }
    // Fill remaining slots if not enough variety
    for (const s of available) {
      if (picked.length >= SESSION_SIZE) break;
      if (!picked.includes(s)) picked.push(s);
    }

    const queue = picked.map(s => s.id);
    translateSession.set(chatId, { queue, currentIndex: 0 });

    // Send first sentence
    const first = picked[0];
    await sendTelegramMessage(
      `🈳 <b>Translation Exercise (1/${SESSION_SIZE})</b>\n\n` +
      `${DIRECTION_LABELS[first.direction]}\n\n` +
      `<b>${first.prompt}</b>\n\n` +
      `Reply with your translation 👇`,
      { parse_mode: 'HTML' }
    );

    return NextResponse.json({ ok: true });
  }

 
  // --- Pinyin answer ---
  if (pinyinSession.has(chatId) && !text.startsWith('/')) {
    const session = pinyinSession.get(chatId)!;
    const userAnswer = text.toLowerCase().trim();
    const correctAnswer = session.pinyin.toLowerCase().trim();
    const isCorrect = userAnswer === correctAnswer;

    const newCorrect = session.correct + (isCorrect ? 1 : 0);
    const newTotal = session.total + 1;

    if (isCorrect) {
      await sendTelegramMessage(
        `✅ <b>Correct !</b>  ${session.hanzi} — ${session.pinyin}`,
        { parse_mode: 'HTML' }
      );
    } else {
      await sendTelegramMessage(
        `❌ ${session.hanzi} — <b>${session.pinyin}</b>`,
        { parse_mode: 'HTML' }
      );
    }

    await sendNextPinyinWord(chatId, newCorrect, newTotal);

    return NextResponse.json({ ok: true });
  }

  // --- Translation answer ---
  if (translateSession.has(chatId) && !text.startsWith('/')) {
    const session = translateSession.get(chatId)!;
    const { queue, currentIndex } = session;
    const sentenceId = queue[currentIndex];

    const sentence = await prisma.translationSentence.findUnique({ where: { id: sentenceId } });
    if (!sentence) {
      translateSession.delete(chatId);
      await sendTelegramMessage('Session expired. Send /translate to start again.', { parse_mode: 'HTML' });
      return NextResponse.json({ ok: true });
    }

    // Evaluate with Claude
    const evalPrompt = `Tu évalues un exercice de traduction de chinois.

Direction: ${sentence.direction}
Original: ${sentence.prompt}
Réponse de référence: ${sentence.reference}
Réponse de l'étudiant: ${text}

Évalue la réponse. Sois flexible — accepte les synonymes, un ordre de mots différent si le sens est préservé.

Si la réponse est correcte :
- "passed": true
- "feedback": une réponse très courte, juste "Bonne réponse !" — SAUF s'il y a des erreurs de tons en pinyin, auquel cas signale-les brièvement (ex: "Bonne réponse ! Attention aux tons : 'mài' et non 'māi'")

Si la réponse est incorrecte :
- "passed": false  
- "feedback": adresse-toi directement à l'étudiant comme un professeur bienveillant (utilise toujours 'tu' pour t'adresser à l'étudiant. Ne parle JAMAIS de l'étudiant à la troisième personne). Explique pourquoi c'est faux en 1-2 phrases. Ajoute ensuite un moyen mnémotechnique basé sur des similarités phonétiques avec le français ou l'anglais pour retenir le ou les mots clés qui ont posé problème.

Réponds UNIQUEMENT en JSON (sans markdown) :
{
  "score": 0.85,
  "passed": true,
  "feedback": "..."
}`;

    let score = 0;
    let passed = false;
    let feedback = 'Could not evaluate.';

    try {
      const evalResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: evalPrompt }],
        }),
      });

      if (evalResponse.ok) {
        const evalData = await evalResponse.json();
        const raw = evalData.content?.[0]?.text || '';
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        score = parsed.score ?? 0;
        passed = parsed.passed ?? false;
        feedback = parsed.feedback ?? '';
      }
    } catch (e) {
      console.error('[translate] Evaluation error:', e);
    }

    // Save attempt
    await prisma.translationAttempt.create({
      data: {
        sentenceId: sentence.id,
        userAnswer: text,
        score,
        feedback,
        passed,
      },
    });

    // Mark sentence as used
    await prisma.translationSentence.update({
      where: { id: sentence.id },
      data: { used: true },
    });

    const icon = passed ? '✅' : '❌';
    const nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) {
      // Session complete
      translateSession.delete(chatId);

      await sendTelegramMessage(
        `${icon} <b>${passed ? 'Correct!' : 'Not quite.'}</b>\n` +
        `${feedback}\n\n` +
        `<b>Reference:</b> ${sentence.reference}\n\n` +
        `🎉 Session complete! Send /translate for another round.`,
        { parse_mode: 'HTML' }
      );
    } else {
      // Next sentence
      session.currentIndex = nextIndex;
      translateSession.set(chatId, session);

      const next = await prisma.translationSentence.findUnique({ where: { id: queue[nextIndex] } });

      await sendTelegramMessage(
        `${icon} <b>${passed ? 'Correct!' : 'Not quite.'}</b>\n` +
        `${feedback}\n\n` +
        `<b>Reference:</b> ${sentence.reference}\n\n` +
        `➡️ <b>Question ${nextIndex + 1}/${queue.length}</b>\n\n` +
        `${DIRECTION_LABELS[next!.direction]}\n\n` +
        `<b>${next!.prompt}</b>\n\n` +
        `Reply with your translation 👇`,
        { parse_mode: 'HTML' }
      );
    }

    return NextResponse.json({ ok: true });
  }

 

  return NextResponse.json({ ok: true });
}
