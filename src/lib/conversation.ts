// src/lib/conversation.ts
import { prisma } from './prisma';
import type { ConversationTopic } from './conversation-topics';

const MODEL = 'claude-haiku-4-5-20251001';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content_zh: string;
  content_pinyin?: string;
  content_en?: string;
  timestamp: string;
}

export interface Correction {
  turn: number;
  mistake: string;
  correction: string;
  explanation: string;
}

export interface NewWord {
  hanzi: string;
  pinyin: string;
  meaning: string;
  category?: string;
}

export interface BotResponse {
  reply_chinese: string;
  reply_pinyin: string;
  reply_english: string;
  user_translation_en: string | null;
  correction: { mistake: string; correction: string; explanation: string } | null;
  new_words_introduced: NewWord[];
}

export async function getUserVocab(): Promise<{ hanzi: string; pinyin: string; meaning: string }[]> {
  const words = await prisma.word.findMany({
    where: {
      OR: [
        { status: 'LEARNING' },
        { status: 'LEARNED' },
        { masteries: { some: { status: { in: ['LEARNING', 'LEARNED'] } } } },
      ],
    },
    select: { hanzi: true, pinyin: true, meaning: true },
  });
  return words;
}

/**
 * Returns the distinct list of category names currently in use in the Word table.
 * Used at session start so Claude can categorize new words consistently.
 */
export async function getDistinctCategories(): Promise<string[]> {
  const rows = await prisma.word.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });
  return rows
    .map(r => r.category)
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .sort();
}

/**
 * Process new words proposed by Claude. Returns:
 *  - added: list of words written to PendingVocab
 *  - duplicates: list of hanzi that were skipped because they already exist in Word table
 *  - alreadyPending: list of hanzi skipped silently because already in PendingVocab
 */
export async function processNewWords(
  newWords: NewWord[],
  sessionId: string,
  topicLabel: string
): Promise<{ added: NewWord[]; duplicates: NewWord[]; alreadyPending: NewWord[] }> {
  const added: NewWord[] = [];
  const duplicates: NewWord[] = [];
  const alreadyPending: NewWord[] = [];

  for (const w of newWords) {
    if (!w.hanzi) continue;

    // Check Word table
    const existingWord = await prisma.word.findUnique({
      where: { hanzi: w.hanzi },
      select: { id: true },
    });
    if (existingWord) {
      duplicates.push(w);
      continue;
    }

    // Check PendingVocab table
    const existingPending = await prisma.pendingVocab.findFirst({
      where: { hanzi: w.hanzi },
      select: { id: true },
    });
    if (existingPending) {
      alreadyPending.push(w);
      continue;
    }

    // Insert
    await prisma.pendingVocab.create({
      data: {
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        meaning: w.meaning,
        category: w.category || null,
        sourceSession: sessionId,
        sourceTopic: topicLabel,
      },
    });
    added.push(w);
  }

  return { added, duplicates, alreadyPending };
}

export async function callConversationBot(
  topic: ConversationTopic,
  vocabList: { hanzi: string; pinyin: string; meaning: string }[],
  history: ConversationTurn[],
  userMessage: string | null,
  categories: string[]
): Promise<BotResponse> {
  const vocabBlock = vocabList
    .map(w => `${w.hanzi} (${w.pinyin}) - ${w.meaning}`)
    .join('\n');

  const categoriesBlock = categories.length > 0
    ? categories.map(c => `- ${c}`).join('\n')
    : '- (no categories yet)';

  const systemPrompt = `${topic.systemPrompt}

The user is a Chinese learner. Their known vocabulary is:
${vocabBlock}

Existing vocabulary categories used by the user:
${categoriesBlock}

RULES:
1. Stay in character for the role-play scenario.
2. Use vocabulary from the list above as much as possible.
3. You should AVOID introducing new words. Use the vocabulary list above as much as possible, even if it means slightly less idiomatic phrasing. Only introduce a new word if there is genuinely no way to express the concept with the existing vocabulary. Hard cap: 2 new words per entire session. Track all introduced words in "new_words_introduced".
4. For each new word you introduce, suggest the most appropriate category from the existing categories list above. Reuse an existing category whenever it fits — do not invent new categories unless absolutely none of the existing ones apply. Set the category in the "category" field of each new word.
5. If the user makes a grammatical or word-choice mistake, note it in "correction". Be specific and brief. Explanation must be in English.
6. Do not correct minor issues that don't impede communication. Only flag meaningful errors.
7. Keep your replies short (1-2 sentences) — this is conversational practice.
8. Always provide pinyin with tone marks for your Chinese reply.
9. The user may write in hanzi, pinyin (with or without tone marks), or mix both. Interpret pinyin charitably — match it against the vocabulary list above to disambiguate when possible. If they make a tone error in pinyin, or pick the wrong character/word, flag it in "correction" (e.g. mistake: "wo yāo yi ge kafei", correction: "wǒ yào yī bēi kāfēi", explanation: "Tone on yào (要 = want), and 杯 bēi is the measure word for drinks").
10. ALWAYS provide an English translation of YOUR Chinese reply in "reply_english". Use natural, idiomatic English.
11. ALWAYS provide an English translation of the USER's most recent message in "user_translation_en". If the user wrote in pinyin, translate from the intended hanzi meaning. On the opening turn (when there is no user message yet), set "user_translation_en" to null.

You MUST respond with ONLY a valid JSON object in this exact shape:
{
  "reply_chinese": "your Chinese reply",
  "reply_pinyin": "pinyin of your reply",
  "reply_english": "natural English translation of your Chinese reply",
  "user_translation_en": "natural English translation of the user's most recent message" OR null,
  "correction": null OR { "mistake": "what user said wrong", "correction": "the correct version", "explanation": "brief why, in English" },
  "new_words_introduced": [] OR [{ "hanzi": "...", "pinyin": "...", "meaning": "...", "category": "category name from the list above" }]
}

No preamble, no markdown, no code fences. JSON only.`;

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const turn of history) {
    messages.push({
      role: turn.role,
      content: turn.content_zh,
    });
  }

  if (userMessage !== null) {
    messages.push({ role: 'user', content: userMessage });
  } else {
    messages.push({ role: 'user', content: '[Start the role-play. Greet me / open the scenario in character.]' });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[conversation] Claude API error:', errText);
    throw new Error('Claude API call failed');
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text || '';
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(clean) as BotResponse;
  } catch (e) {
    console.error('[conversation] Failed to parse Claude response:', clean);
    throw new Error('Bot returned invalid JSON');
  }
}
export function formatTurnForTelegram(reply: BotResponse): string {
  let msg = `${reply.reply_chinese}\n<tg-spoiler><i>${reply.reply_pinyin}</i></tg-spoiler>`;


  if (reply.correction) {
    msg += `\n\n💡 <i>Quick note: "${reply.correction.mistake}" → "${reply.correction.correction}" — ${reply.correction.explanation}</i>`;
  }

  if (reply.new_words_introduced && reply.new_words_introduced.length > 0) {
    const words = reply.new_words_introduced
      .map(w => `<b>${w.hanzi}</b> (${w.pinyin}) — ${w.meaning}`)
      .join('\n');
    msg += `\n\n📖 <i>New words:</i>\n${words}`;
  }

  return msg;
}

export function formatEndSummary(
  topicLabel: string,
  turnCount: number,
  corrections: Correction[],
  newWords: NewWord[],
  transcript: ConversationTurn[],
  duplicates: NewWord[]
): string {
  let msg = `<b>📊 Session Summary — ${topicLabel}</b>\n\n`;
  msg += `Your turns: ${turnCount}\n`;
  msg += `Corrections: ${corrections.length}\n`;
  msg += `New words: ${newWords.length}\n`;

  if (corrections.length > 0) {
    msg += `\n<b>Corrections:</b>\n`;
    corrections.forEach((c, i) => {
      msg += `${i + 1}. "${c.mistake}" → "${c.correction}"\n   <i>${c.explanation}</i>\n`;
    });
  }

  if (newWords.length > 0) {
    msg += `\n<b>📖 New words sent to review:</b>\n`;
    newWords.forEach(w => {
      msg += `• <b>${w.hanzi}</b> (${w.pinyin}) — ${w.meaning}\n`;
    });
    msg += `<i>Approve them at naxuexi.com/converse</i>\n`;
  }

  if (duplicates.length > 0) {
    msg += `\n<b>⚠️ Duplicates (already in your vocabulary):</b>\n`;
    duplicates.forEach(w => {
      msg += `• ${w.hanzi} (${w.pinyin})\n`;
    });
    msg += `<i>Claude flagged these as new but you already know them.</i>\n`;
  }

  const translatableTurns = transcript.filter(t => t.content_en);
  if (translatableTurns.length > 0) {
    msg += `\n<b>🇬🇧 English translation:</b>\n`;
    translatableTurns.forEach(t => {
      const speaker = t.role === 'user' ? 'You' : 'Bot';
      msg += `<b>${speaker}:</b> ${t.content_en}\n`;
    });
  }

  msg += `\n<i>Full transcript saved.</i>`;
  return msg;
}
