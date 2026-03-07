// src/app/api/telegram-webhook/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// --- Fuzzy matching helpers ---

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '')     // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSimilarity(a: string, b: string): number {
  const wordsA = normalize(a).split(' ').filter(Boolean);
  const wordsB = normalize(b).split(' ').filter(Boolean);
  if (wordsA.length === 0 && wordsB.length === 0) return 1;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  let matched = 0;
  const usedB = new Set<number>();

  for (const wa of wordsA) {
    for (let i = 0; i < wordsB.length; i++) {
      if (!usedB.has(i) && wordsB[i] === wa) {
        matched++;
        usedB.add(i);
        break;
      }
    }
  }

  const precision = matched / wordsA.length;
  const recall = matched / wordsB.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall); // F1 score
}

function compareLines(userLines: string[], refLines: string[]): {
  lineResults: { ok: boolean; score: number; user: string; ref: string }[];
  globalScore: number;
} {
  const maxLen = Math.max(userLines.length, refLines.length);
  const lineResults = [];

  for (let i = 0; i < maxLen; i++) {
    const user = userLines[i] || '';
    const ref = refLines[i] || '';
    const score = wordSimilarity(user, ref);
    lineResults.push({ ok: score >= 0.85, score, user, ref });
  }

  const globalScore = lineResults.reduce((s, r) => s + r.score, 0) / lineResults.length;
  return { lineResults, globalScore };
}

// --- In-memory quiz session state ---
// key = telegram chat_id, value = true when awaiting quiz answer
// Railway restarts clear it — that's fine, quiz just resets
const quizSession = new Map<number, boolean>();

// --- In-memory translate session state ---
// key = chat_id, value = current sentence id being answered
const translateSession = new Map<number, number>();

const DIRECTION_LABELS: Record<string, string> = {
  HANZI_TO_EN: '汉字 → 🇬🇧 Hanzi to English',
  HANZI_TO_FR: '汉字 → 🇫🇷 Hanzi to French',
  PY_TO_EN:   '拼音 → 🇬🇧 Pinyin to English',
  PY_TO_FR:   '拼音 → 🇫🇷 Pinyin to French',
  EN_TO_PY:   '🇬🇧 → 拼音 English to Pinyin',
  FR_TO_PY:   '🇫🇷 → 拼音 French to Pinyin',
};

// --- Main handler ---

export async function POST(req: Request) {
  const body = await req.json();
  const message = body?.message;
  const text = message?.text?.trim();
  const chatId: number = message?.chat?.id;

  if (!text || !chatId) return NextResponse.json({ ok: true });

  // /quiz — start a quiz session
  if (text === '/quiz') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const end = Math.min((progress.chunkIndex + 1) * progress.chunkSize, lines.length);
    const cumulativeLines = lines.slice(0, end);

    quizSession.set(chatId, true);

    await sendTelegramMessage(
      `🧠 *Quiz — ${progress.poem.title}*\n` +
      `Lignes 1–${end} (${cumulativeLines.length} vers au total)\n\n` +
      `Tape tous les vers de mémoire, un par ligne, puis envoie 👇`,
      { parse_mode: 'Markdown' }
    );

    return NextResponse.json({ ok: true });
  }

  // Free text answer — check if we're in a quiz session
  if (quizSession.get(chatId) && !text.startsWith('/')) {
    quizSession.delete(chatId);

    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Session expirée, aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const end = Math.min((progress.chunkIndex + 1) * progress.chunkSize, lines.length);
    const refLines = lines.slice(0, end);
    const userLines = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const { lineResults, globalScore } = compareLines(userLines, refLines);
    const passed = globalScore >= 0.85;

    let resultMsg = passed
      ? `✅ *Bien joué !* (${Math.round(globalScore * 100)}%)\n\n`
      : `❌ *Pas encore…* (${Math.round(globalScore * 100)}%)\n\n`;

    for (const r of lineResults) {
      if (r.ok) {
        resultMsg += `✓ ${r.ref}\n`;
      } else {
        resultMsg += `✗ Toi : _${r.user || '(manquant)'}_ \n`;
        resultMsg += `  Ref : *${r.ref}*\n`;
      }
    }

    if (passed) {
      resultMsg += `\nEnvoie /next pour débloquer les ${progress.chunkSize} vers suivants 🎯`;
    } else {
      resultMsg += `\nRéessaie avec /quiz — tu dois réciter les ${refLines.length} vers depuis le début.`;
    }

    await sendTelegramMessage(resultMsg, { parse_mode: 'Markdown' });
    return NextResponse.json({ ok: true });
  }

  // /next — advance to next chunk
  if (text === '/next') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Aucun poème actif trouvé.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const totalChunks = Math.ceil(lines.length / progress.chunkSize);
    const nextIndex = progress.chunkIndex + 1;

    if (nextIndex >= totalChunks) {
      await sendTelegramMessage(
        `🎉 Bravo ! Tu as mémorisé *${progress.poem.title}* en entier !`,
        { parse_mode: 'Markdown' }
      );
      await prisma.poemProgress.update({
        where: { id: progress.id },
        data: { active: false },
      });
    } else {
      await prisma.poemProgress.update({
        where: { id: progress.id },
        data: { chunkIndex: nextIndex },
      });

      const start = nextIndex * progress.chunkSize;
      const end = Math.min((nextIndex + 1) * progress.chunkSize, lines.length);

      await sendTelegramMessage(
        `✅ Chunk suivant débloqué !\nDemain tu recevras les lignes *1–${end}* de *${progress.poem.title}* (${end - start} nouvelles lignes ajoutées).`,
        { parse_mode: 'Markdown' }
      );
    }

    return NextResponse.json({ ok: true });
  }

  // /poem — show current status
  if (text === '/poem') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const totalChunks = Math.ceil(lines.length / progress.chunkSize);
    const end = Math.min((progress.chunkIndex + 1) * progress.chunkSize, lines.length);

    await sendTelegramMessage(
      `📖 *${progress.poem.title}* — ${progress.poem.author}\n` +
      `Chunk actuel : lignes 1–${end} (chunk ${progress.chunkIndex + 1}/${totalChunks})`,
      { parse_mode: 'Markdown' }
    );

    return NextResponse.json({ ok: true });
  }

  // /translate — start a translation session (3 sentences)
  if (text === '/translate') {
    // Pick 3 unused sentences randomly across directions
    const available = await prisma.translationSentence.findMany({
      where: { used: false },
      orderBy: { createdAt: 'asc' },
    });

    if (available.length === 0) {
      await sendTelegramMessage(
        '📭 No translation exercises available yet.\nThe weekly batch generates every Sunday — check back soon!',
      );
      return NextResponse.json({ ok: true });
    }

    // Pick 3, trying to vary directions
    const picked: typeof available = [];
    const directions = ['HANZI_TO_EN', 'HANZI_TO_FR', 'PY_TO_EN', 'PY_TO_FR', 'EN_TO_PY', 'FR_TO_PY'];
    for (const dir of directions) {
      const match = available.find(s => s.direction === dir && !picked.includes(s));
      if (match) picked.push(match);
      if (picked.length === 3) break;
    }
    // Fill up to 3 if not enough variety
    for (const s of available) {
      if (picked.length >= 3) break;
      if (!picked.includes(s)) picked.push(s);
    }

    // Store session: queue of sentence ids
    const ids = picked.map(s => s.id);
    await prisma.setting.upsert({
      where: { key: `translateQueue_${chatId}` },
      update: { value: JSON.stringify(ids) },
      create: { key: `translateQueue_${chatId}`, value: JSON.stringify(ids) },
    });

    // Send first sentence
    const first = picked[0];
    translateSession.set(chatId, first.id);

    await sendTelegramMessage(
      `🈳 *Translation Exercise* (1/3)\n\n` +
      `${DIRECTION_LABELS[first.direction]}\n\n` +
      `*${first.prompt}*\n\n` +
      `Reply with your translation 👇`,
      { parse_mode: 'Markdown' }
    );

    return NextResponse.json({ ok: true });
  }

  // Free text — translation answer
  if (translateSession.has(chatId) && !text.startsWith('/')) {
    const sentenceId = translateSession.get(chatId)!;
    translateSession.delete(chatId);

    const sentence = await prisma.translationSentence.findUnique({ where: { id: sentenceId } });
    if (!sentence) {
      await sendTelegramMessage('Session expirée, envoie /translate pour recommencer.');
      return NextResponse.json({ ok: true });
    }

    // Evaluate with Claude
    const evalPrompt = `You are evaluating a Chinese language translation exercise.

Direction: ${sentence.direction}
Original: ${sentence.prompt}
Reference answer: ${sentence.reference}
Student answer: ${text}

Evaluate the student's answer. Be flexible — accept synonyms, different word order if meaning is preserved, minor pinyin errors.

Respond ONLY with JSON (no markdown):
{
  "score": 0.85,
  "passed": true,
  "feedback": "Brief encouraging feedback in the same language as the prompt (French if FR_TO_ZH, English otherwise). Max 2 sentences. Mention what was good or what to fix."
}`;

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

    let score = 0;
    let passed = false;
    let feedback = '';

    if (evalResponse.ok) {
      const evalData = await evalResponse.json();
      const raw = evalData.content?.[0]?.text || '';
      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        score = parsed.score ?? 0;
        passed = parsed.passed ?? false;
        feedback = parsed.feedback ?? '';
      } catch {
        feedback = 'Could not evaluate — check the reference answer below.';
      }
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

    // Get queue to determine next sentence
    const queueSetting = await prisma.setting.findUnique({
      where: { key: `translateQueue_${chatId}` },
    });
    const queue: number[] = queueSetting ? JSON.parse(queueSetting.value) : [];
    const currentIndex = queue.indexOf(sentenceId);
    const nextId = queue[currentIndex + 1];

    const resultEmoji = passed ? '✅' : '❌';
    let resultMsg =
      `${resultEmoji} *${Math.round(score * 100)}%*\n\n` +
      `${feedback}\n\n` +
      `Reference: _${sentence.reference}_`;

    if (nextId) {
      const next = await prisma.translationSentence.findUnique({ where: { id: nextId } });
      if (next) {
        translateSession.set(chatId, nextId);
        const position = currentIndex + 2; // 1-based
        resultMsg += `\n\n━━━━━━━━━━━━━━━━━━━━\n🈳 *Sentence ${position}/3*\n\n${DIRECTION_LABELS[next.direction]}\n\n*${next.prompt}*\n\nReply with your translation 👇`;
      }
    } else {
      // Session complete
      resultMsg += `\n\n━━━━━━━━━━━━━━━━━━━━\n🎯 Session complete! Send /translate for more.`;
      // Clean up queue
      await prisma.setting.deleteMany({ where: { key: `translateQueue_${chatId}` } });
    }

    await sendTelegramMessage(resultMsg, { parse_mode: 'Markdown' });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
