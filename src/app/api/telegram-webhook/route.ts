// src/app/api/telegram-webhook/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { calculateSM2 } from '@/lib/spaced-repetition';
import {
  CONVERSATION_TOPICS,
  getTopicByNumber,
  getTopicBySlug,
  formatTopicList,
} from '@/lib/conversation-topics';
import {
  callConversationBot,
  getUserVocab,
  getDistinctCategories,
  formatTurnForTelegram,
  formatEndSummary,
  processNewWords,
  type ConversationTurn,
  type Correction,
  type NewWord,
} from '@/lib/conversation';

export const dynamic = 'force-dynamic';

// key = chatId, value = { queue: sentenceIds[], currentIndex: number }
const translateSession = new Map<number, { queue: number[]; currentIndex: number }>();

// key = chatId, value = current pinyin word + running score + wordId for SM-2
const pinyinSession = new Map<number, { wordId: number; pinyin: string; hanzi: string; correct: number; total: number }>();

// key = chatId, value = current hanzi word + running score + wordId for SM-2
const hanziSession = new Map<number, { wordId: number; pinyin: string; hanzi: string; correct: number; total: number }>();

// key = chatId, value = current recognize word + running score + wordId for SM-2
const recognizeSession = new Map<number, { wordId: number; pinyin: string; hanzi: string; meaning: string; correct: number; total: number }>();

// key = chatId, value = conversation state
type ConversationState =
  | { phase: 'awaiting_topic' }
  | {
      phase: 'active';
      sessionId: string;
      topicSlug: string;
      topicLabel: string;
      history: ConversationTurn[];
      corrections: Correction[];
      newWords: NewWord[];
      duplicateWarnings: NewWord[];
      vocabList: { hanzi: string; pinyin: string; meaning: string }[];
      turnCount: number;
    };
const conversationSession = new Map<number, ConversationState>();

// --- Status ranking for min() calculation ---
const STATUS_RANK: Record<string, number> = { NEW: 0, LEARNING: 1, LEARNED: 2 };
const RANK_TO_STATUS = ['NEW', 'LEARNING', 'LEARNED'];

// --- Helper: update skill-specific mastery via SM-2, recalc overall Word.status ---
async function recordReview(wordId: number, isCorrect: boolean, module: string) {
  const skill = module;
  const quality = isCorrect ? 4 : 1;

  let mastery = await prisma.wordMastery.findUnique({
    where: { wordId_skill: { wordId, skill } },
  });

  if (!mastery) {
    mastery = await prisma.wordMastery.create({
      data: { wordId, skill },
    });
  }

  const sm2 = calculateSM2({
    quality,
    easeFactor: mastery.easeFactor,
    interval: mastery.interval,
    reviewCount: mastery.reviewCount,
  });

  await prisma.wordMastery.update({
    where: { id: mastery.id },
    data: {
      easeFactor: sm2.easeFactor,
      interval: sm2.interval,
      nextReview: sm2.nextReview,
      status: sm2.status,
      reviewCount: { increment: 1 },
      ...(isCorrect && { correctCount: { increment: 1 } }),
    },
  });

  await prisma.reviewLog.create({
    data: {
      wordId,
      module,
      result: isCorrect ? 'CORRECT' : 'WRONG',
    },
  });

  const word = await prisma.word.findUnique({ where: { id: wordId } });
  if (!word) return;

  const allMasteries = await prisma.wordMastery.findMany({
    where: { wordId, reviewCount: { gt: 0 } },
  });

  const statuses: string[] = [];
  if (word.reviewCount > 0) {
    statuses.push(word.status);
  }
  for (const m of allMasteries) {
    statuses.push(m.status);
  }

  if (statuses.length === 0) return;

  const minRank = Math.min(...statuses.map(s => STATUS_RANK[s] ?? 0));
  const overallStatus = RANK_TO_STATUS[minRank];

  if (word.status !== overallStatus) {
    await prisma.word.update({
      where: { id: wordId },
      data: { status: overallStatus },
    });
  }
}

async function sendNextHanziWord(chatId: number, correct: number, total: number) {
  const count = await prisma.word.count();
  const skip = Math.floor(Math.random() * count);
  const words = await prisma.word.findMany({ take: 1, skip });
  const word = words[0];

  hanziSession.set(chatId, {
    wordId: word.id,
    pinyin: word.pinyin,
    hanzi: word.hanzi,
    correct,
    total,
  });

  await sendTelegramMessage(
    `🈳 <b>${word.meaning}</b>`,
    { parse_mode: 'HTML' }
  );
}

async function sendNextPinyinWord(chatId: number, correct: number, total: number) {
  const count = await prisma.word.count();
  const skip = Math.floor(Math.random() * count);
  const words = await prisma.word.findMany({ take: 1, skip });
  const word = words[0];

  pinyinSession.set(chatId, {
    wordId: word.id,
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

async function sendNextRecognizeWord(chatId: number, correct: number, total: number) {
  const count = await prisma.word.count();
  const skip = Math.floor(Math.random() * count);
  const words = await prisma.word.findMany({ take: 1, skip });
  const word = words[0];

  recognizeSession.set(chatId, {
    wordId: word.id,
    pinyin: word.pinyin,
    hanzi: word.hanzi,
    meaning: word.meaning,
    correct,
    total,
  });

  await sendTelegramMessage(
    `🔍 <b>${word.hanzi}</b>`,
    { parse_mode: 'HTML' }
  );
}

const DIRECTION_LABELS: Record<string, string> = {
  HANZI_TO_EN: '汉字 → 🇬🇧',
  HANZI_TO_FR: '汉字 → 🇫🇷',
  PY_TO_EN: '拼音 → 🇬🇧',
  PY_TO_FR: '拼音 → 🇫🇷',
  EN_TO_PY: '🇬🇧 → 拼音',
  FR_TO_PY: '🇫🇷 → 拼音',
};

const SESSION_SIZE = 6;

// --- Helper: persist conversation state to DB ---
async function persistConversation(state: Extract<ConversationState, { phase: 'active' }>, ended: boolean) {
  await prisma.conversationSession.update({
    where: { id: state.sessionId },
    data: {
      turnCount: state.turnCount,
      transcript: JSON.stringify(state.history),
      corrections: JSON.stringify(state.corrections),
      newWords: JSON.stringify(state.newWords),
      ...(ended && { endedAt: new Date() }),
    },
  });
}

// --- Handler ---

export async function POST(req: Request) {
  const body = await req.json();
  const message = body?.message;
  const text = message?.text?.trim();
  const chatId: number = message?.chat?.id;

  if (!text || !chatId) return NextResponse.json({ ok: true });

  // --- /converse command — start topic selection ---
  if (text === '/converse') {
    // If a conversation is already active, end it first
    if (conversationSession.has(chatId)) {
      conversationSession.delete(chatId);
    }

    conversationSession.set(chatId, { phase: 'awaiting_topic' });

    await sendTelegramMessage(
      `💬 <b>Conversation Practice</b>\n\n` +
        `Pick a scenario by replying with a number (1-${CONVERSATION_TOPICS.length}):\n\n` +
        formatTopicList() +
        `\n\nSend /endconverse anytime to end the session.`,
      { parse_mode: 'HTML' }
    );
    return NextResponse.json({ ok: true });
  }

  // --- /endconverse command — end current conversation ---
  if (text === '/endconverse') {
    const state = conversationSession.get(chatId);

    if (!state) {
      await sendTelegramMessage('Aucune session de conversation en cours.');
      return NextResponse.json({ ok: true });
    }

    if (state.phase === 'awaiting_topic') {
      conversationSession.delete(chatId);
      await sendTelegramMessage('Session annulée.');
      return NextResponse.json({ ok: true });
    }

    // Active session — persist and send summary
    await persistConversation(state, true);

await sendTelegramMessage(
      formatEndSummary(
        state.topicLabel,
        state.turnCount,
        state.corrections,
        state.newWords,
        state.history,
        state.duplicateWarnings
      ),
      { parse_mode: 'HTML' }
    );

    conversationSession.delete(chatId);
    return NextResponse.json({ ok: true });
  }

  // --- Conversation topic pick (awaiting_topic phase) ---
  const convState = conversationSession.get(chatId);
  if (convState && convState.phase === 'awaiting_topic' && !text.startsWith('/')) {
    const num = parseInt(text, 10);
    const topic = getTopicByNumber(num);

    if (!topic) {
      await sendTelegramMessage(
        `Numéro invalide. Choisis un nombre entre 1 et ${CONVERSATION_TOPICS.length}, ou /endconverse pour annuler.`
      );
      return NextResponse.json({ ok: true });
    }

    // Create DB session row
    const dbSession = await prisma.conversationSession.create({
      data: {
        topic: topic.slug,
        topicLabel: topic.label,
      },
    });

// Pull vocab
    const vocabList = await getUserVocab();

// Fetch existing categories so Claude can categorize new words
    const categories = await getDistinctCategories();

    // Generate opening turn from Claude
    let opening;
    try {
      opening = await callConversationBot(topic, vocabList, [], null, categories);
    } catch (e) {
      console.error('[converse] Opening generation failed:', e);
      conversationSession.delete(chatId);
      await sendTelegramMessage('❌ Impossible de démarrer la conversation. Réessaie plus tard.');
      return NextResponse.json({ ok: true });
    }

const openingTurn: ConversationTurn = {
      role: 'assistant',
      content_zh: opening.reply_chinese,
      content_pinyin: opening.reply_pinyin,
      content_en: opening.reply_english,
      timestamp: new Date().toISOString(),
    };

    // Process any new words from opening turn through PendingVocab pipeline
    let openingAdded: NewWord[] = [];
    let openingDuplicates: NewWord[] = [];
    if (opening.new_words_introduced && opening.new_words_introduced.length > 0) {
      try {
        const result = await processNewWords(
          opening.new_words_introduced,
          dbSession.id,
          topic.label
        );
        openingAdded = result.added;
        openingDuplicates = result.duplicates;
      } catch (e) {
        console.error('[converse] opening processNewWords failed:', e);
      }
    }

    // Set active state
    const activeState: Extract<ConversationState, { phase: 'active' }> = {
      phase: 'active',
      sessionId: dbSession.id,
      topicSlug: topic.slug,
      topicLabel: topic.label,
      history: [openingTurn],
      corrections: [],
      newWords: openingAdded,
      duplicateWarnings: openingDuplicates,
      vocabList,
      turnCount: 0,
    };
    conversationSession.set(chatId, activeState);
    await persistConversation(activeState, false);

    await sendTelegramMessage(
      `🎬 <b>${topic.label}</b>\n\n` + formatTurnForTelegram(opening),
      { parse_mode: 'HTML' }
    );

    return NextResponse.json({ ok: true });
  }

  // --- Conversation active turn (active phase, non-command text) ---
  if (convState && convState.phase === 'active' && !text.startsWith('/')) {
    const topic = getTopicBySlug(convState.topicSlug);
    if (!topic) {
      conversationSession.delete(chatId);
      await sendTelegramMessage('Erreur de session. Send /converse to restart.');
      return NextResponse.json({ ok: true });
    }

    // Append user turn to history
    const userTurn: ConversationTurn = {
      role: 'user',
      content_zh: text,
      timestamp: new Date().toISOString(),
    };
    convState.history.push(userTurn);
    convState.turnCount += 1;

// Call bot
    let reply;
    try {
      const categories = await getDistinctCategories();
      reply = await callConversationBot(topic, convState.vocabList, convState.history.slice(0, -1), text, categories);
    } catch (e) {
      console.error('[converse] Reply generation failed:', e);
      // Roll back the user turn we just appended so retry works cleanly
      convState.history.pop();
      convState.turnCount -= 1;
      await sendTelegramMessage('❌ Erreur de réponse. Réessaie.');
      return NextResponse.json({ ok: true });
    }

    // Append assistant turn
    const assistantTurn: ConversationTurn = {
      role: 'assistant',
      content_zh: reply.reply_chinese,
      content_pinyin: reply.reply_pinyin,
      timestamp: new Date().toISOString(),
    };
    convState.history.push(assistantTurn);

    // Track correction
    if (reply.correction) {
      convState.corrections.push({
        turn: convState.turnCount,
        mistake: reply.correction.mistake,
        correction: reply.correction.correction,
        explanation: reply.correction.explanation,
      });
    }

// Process new words: write to PendingVocab, dedupe vs Word table + existing pending
    if (reply.new_words_introduced && reply.new_words_introduced.length > 0) {
      try {
        const result = await processNewWords(
          reply.new_words_introduced,
          convState.sessionId,
          convState.topicLabel
        );
        for (const w of result.added) {
          if (!convState.newWords.find(existing => existing.hanzi === w.hanzi)) {
            convState.newWords.push(w);
          }
        }
        for (const w of result.duplicates) {
          if (!convState.duplicateWarnings.find(existing => existing.hanzi === w.hanzi)) {
            convState.duplicateWarnings.push(w);
          }
        }
      } catch (e) {
        console.error('[converse] processNewWords failed:', e);
      }
    }
    // Persist
    await persistConversation(convState, false);

    await sendTelegramMessage(formatTurnForTelegram(reply), { parse_mode: 'HTML' });
    return NextResponse.json({ ok: true });
  }

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

  // --- /hanzis command — start continuous hanzi session ---
  if (text === '/hanzis') {
    const count = await prisma.word.count();
    if (count === 0) {
      await sendTelegramMessage('Aucun mot dans le vocabulaire.');
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(
      `🈳 <b>Hanzi Challenge</b>\n\nÉcris le(s) caractère(s) chinois correspondant(s).\nSend /hanzisfinish to end the session.\n`,
      { parse_mode: 'HTML' }
    );

    await sendNextHanziWord(chatId, 0, 0);
    return NextResponse.json({ ok: true });
  }

  // --- /hanzisfinish command — end hanzi session ---
  if (text === '/hanzisfinish') {
    const session = hanziSession.get(chatId);
    if (session) {
      const { correct, total } = session;
      hanziSession.delete(chatId);

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
      await sendTelegramMessage('Aucune session hanzi en cours.');
    }
    return NextResponse.json({ ok: true });
  }

  // --- /recognize command — start continuous recognize session ---
  if (text === '/recognize') {
    const count = await prisma.word.count();
    if (count === 0) {
      await sendTelegramMessage('Aucun mot dans le vocabulaire.');
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(
      `🔍 <b>Recognize Challenge</b>\n\nWhat does this character mean? Answer in English or French.\nSend /recognizefinish to end the session.\n`,
      { parse_mode: 'HTML' }
    );

    await sendNextRecognizeWord(chatId, 0, 0);
    return NextResponse.json({ ok: true });
  }

  // --- /recognizefinish command — end recognize session ---
  if (text === '/recognizefinish') {
    const session = recognizeSession.get(chatId);
    if (session) {
      const { correct, total } = session;
      recognizeSession.delete(chatId);

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
      await sendTelegramMessage('Aucune session recognize en cours.');
    }
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

    const directions = ['HANZI_TO_EN', 'HANZI_TO_FR', 'PY_TO_EN', 'PY_TO_FR', 'EN_TO_PY', 'FR_TO_PY'];
    const picked: typeof available = [];
    for (const dir of directions) {
      if (picked.length >= SESSION_SIZE) break;
      const match = available.find(s => s.direction === dir && !picked.includes(s));
      if (match) picked.push(match);
    }
    for (const s of available) {
      if (picked.length >= SESSION_SIZE) break;
      if (!picked.includes(s)) picked.push(s);
    }

    const queue = picked.map(s => s.id);
    translateSession.set(chatId, { queue, currentIndex: 0 });

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

    await recordReview(session.wordId, isCorrect, 'PINYIN');

    if (isCorrect) {
      await sendTelegramMessage(
        `✅ <b>Correct !</b> ${session.hanzi} — ${session.pinyin}`,
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

  // --- Hanzi answer ---
  if (hanziSession.has(chatId) && !text.startsWith('/')) {
    const session = hanziSession.get(chatId)!;
    const userAnswer = text.trim();
    const correctAnswer = session.hanzi.trim();
    const isCorrect = userAnswer === correctAnswer;

    const newCorrect = session.correct + (isCorrect ? 1 : 0);
    const newTotal = session.total + 1;

    await recordReview(session.wordId, isCorrect, 'HANZI');

    if (isCorrect) {
      await sendTelegramMessage(
        `✅ <b>Correct !</b> ${session.hanzi} (${session.pinyin})`,
        { parse_mode: 'HTML' }
      );
    } else {
      await sendTelegramMessage(
        `❌ <b>${session.hanzi}</b> (${session.pinyin})`,
        { parse_mode: 'HTML' }
      );
    }

    await sendNextHanziWord(chatId, newCorrect, newTotal);
    return NextResponse.json({ ok: true });
  }

  // --- Recognize answer ---
  if (recognizeSession.has(chatId) && !text.startsWith('/')) {
    const session = recognizeSession.get(chatId)!;
    let isCorrect = false;
    let feedback = '';

    try {
      const evalPrompt = `A Chinese learner is shown the character(s): ${session.hanzi}
They answered with: ${text}

Is their answer correct or acceptable? The answer can be in English or French. Be flexible — accept synonyms, partial meanings, or simplified explanations as long as the core meaning is right.

Respond ONLY with JSON (no markdown):
{
  "passed": true,
  "feedback": "Brief feedback in 1 sentence max"
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
          max_tokens: 150,
          messages: [{ role: 'user', content: evalPrompt }],
        }),
      });

      if (evalResponse.ok) {
        const evalData = await evalResponse.json();
        const raw = evalData.content?.[0]?.text || '';
        const clean = raw.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        isCorrect = parsed.passed ?? false;
        feedback = parsed.feedback ?? '';
      }
    } catch (e) {
      console.error('[recognize] Evaluation error:', e);
      feedback = 'Could not evaluate.';
    }

    const newCorrect = session.correct + (isCorrect ? 1 : 0);
    const newTotal = session.total + 1;

    await recordReview(session.wordId, isCorrect, 'RECOGNIZE');

    if (isCorrect) {
      await sendTelegramMessage(
        `✅ <b>Correct!</b> ${session.hanzi} (${session.pinyin})\n${feedback}`,
        { parse_mode: 'HTML' }
      );
    } else {
      await sendTelegramMessage(
        `❌ <b>${session.hanzi}</b> (${session.pinyin}) — ${session.meaning}\n${feedback}`,
        { parse_mode: 'HTML' }
      );
    }

    await sendNextRecognizeWord(chatId, newCorrect, newTotal);
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

    await prisma.translationAttempt.create({
      data: {
        sentenceId: sentence.id,
        userAnswer: text,
        score,
        feedback,
        passed,
      },
    });

    await prisma.translationSentence.update({
      where: { id: sentence.id },
      data: { used: true },
    });

    const icon = passed ? '✅' : '❌';
    const nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) {
      translateSession.delete(chatId);
      await sendTelegramMessage(
        `${icon} <b>${passed ? 'Correct!' : 'Not quite.'}</b>\n` +
          `${feedback}\n\n` +
          `<b>Reference:</b> ${sentence.reference}\n\n` +
          `🎉 Session complete! Send /translate for another round.`,
        { parse_mode: 'HTML' }
      );
    } else {
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
