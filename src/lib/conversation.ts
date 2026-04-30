// src/lib/conversation.ts
import { prisma } from './prisma';
import type { ConversationTopic } from './conversation-topics';

const MODEL = 'claude-haiku-4-5-20251001';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content_zh: string;
  content_pinyin?: string;
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
}

export interface BotResponse {
  reply_chinese: string;
  reply_pinyin: string;
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


export async function callConversationBot(
  topic: ConversationTopic,
  vocabList: { hanzi: string; pinyin: string; meaning: string }[],
  history: ConversationTurn[],
  userMessage: string | null
): Promise<BotResponse> {
  const vocabBlock = vocabList
    .map(w => `${w.hanzi} (${w.pinyin}) - ${w.meaning}`)
    .join('\n');

  const systemPrompt = `${topic.systemPrompt}

The user is a Chinese learner. Their known vocabulary is:
${vocabBlock}

RULES:
1. Stay in character for the role-play scenario.
2. Use vocabulary from the list above as much as possible.
3. You may introduce 1-2 new words per session if absolutely needed for the scenario. Track these in "new_words_introduced". Do not repeat words already introduced earlier in the conversation.
4. If the user makes a grammatical or word-choice mistake, note it in "correction". Be specific and brief. Explanation must be in English.
5. Do not correct minor issues that don't impede communication. Only flag meaningful errors.
6. Keep your replies short (1-2 sentences) — this is conversational practice.
7. Always provide pinyin with tone marks for your Chinese reply.
8. The user may write in hanzi, pinyin (with or without tone marks), or mix both. Interpret pinyin charitably — match it against the vocabulary list above to disambiguate when possible. If they make a tone error in pinyin, or pick the wrong character/word, flag it in "correction" (e.g. mistake: "wo yāo yi ge kafei", correction: "wǒ yào yī bēi kāfēi", explanation: "Tone on yào (要 = want), and 杯 bēi is the measure word for drinks").

You MUST respond with ONLY a valid JSON object in this exact shape:
{
  "reply_chinese": "your Chinese reply",
  "reply_pinyin": "pinyin of your reply",
  "correction": null OR { "mistake": "what user said wrong", "correction": "the correct version", "explanation": "brief why, in English" },
  "new_words_introduced": [] OR [{ "hanzi": "...", "pinyin": "...", "meaning": "..." }]
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
      max_tokens: 500,
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
  let msg = `${reply.reply_chinese}\n<i>${reply.reply_pinyin}</i>`;

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
  newWords: NewWord[]
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
    msg += `\n<b>New words introduced:</b>\n`;
    newWords.forEach(w => {
      msg += `• <b>${w.hanzi}</b> (${w.pinyin}) — ${w.meaning}\n`;
    });
  }

  msg += `\n<i>Full transcript saved.</i>`;
  return msg;
}
