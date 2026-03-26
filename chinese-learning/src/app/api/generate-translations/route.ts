// src/app/api/generate-translations/route.ts
// Weekly cron — pre-generates translation sentences using Claude API
// Triggered by cron-job.org: GET /api/generate-translations?secret=CRON_SECRET

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// 6 directions, ~17 sentences each = 102 ≈ 100
const DIRECTIONS = [
  { key: 'HANZI_TO_EN', perCount: 17, desc: 'prompt is Chinese hanzi, reference is English' },
  { key: 'HANZI_TO_FR', perCount: 17, desc: 'prompt is Chinese hanzi, reference is French' },
  { key: 'PY_TO_EN',    perCount: 17, desc: 'prompt is pinyin only (no hanzi), reference is English' },
  { key: 'PY_TO_FR',    perCount: 17, desc: 'prompt is pinyin only (no hanzi), reference is French' },
  { key: 'EN_TO_PY',    perCount: 16, desc: 'prompt is English, reference is pinyin only (no hanzi)' },
  { key: 'FR_TO_PY',    perCount: 16, desc: 'prompt is French, reference is pinyin only (no hanzi)' },
] as const;

const BATCH_SIZE = DIRECTIONS.reduce((s, d) => s + d.perCount, 0);

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ 
      error: 'Unauthorized',
      received: secret,
      expected_length: process.env.CRON_SECRET?.length ?? 'UNDEFINED'
    }, { status: 401 });
  }
  
  const words = await prisma.word.findMany({
    where: { status: { in: ['LEARNED', 'LEARNING'] } },
    select: { hanzi: true, pinyin: true, meaning: true },
  });

  if (words.length < 5) {
    return NextResponse.json({ error: 'Not enough learned words to generate sentences' }, { status: 400 });
  }

  const wordList = words.map(w => `${w.hanzi} (${w.pinyin} — ${w.meaning})`).join('\n');

  const directionInstructions = DIRECTIONS.map(d =>
    `- ${d.perCount} sentences direction "${d.key}": ${d.desc}`
  ).join('\n');

  const prompt = `You are a Chinese language teacher generating translation exercises for a student learning Chinese.

Here are the student's known words:
${wordList}

Generate exactly ${BATCH_SIZE} translation sentences distributed as follows:
${directionInstructions}

Rules:
- ONLY use vocabulary from the word list above
- Keep sentences short (4-8 words)
- Vary difficulty from simple to more complex
- Make sentences natural and practical
- Each sentence must be unique — do not repeat the same prompt in the same direction

Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {
    "direction": "HANZI_TO_EN",
    "prompt": "我有朋友",
    "reference": "I have a friend",
    "usedWords": ["我", "有", "朋友"]
  },
  ...
]`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error('[generate-translations] Claude API error:', err);
    return NextResponse.json({ error: 'Claude API error', details: err }, { status: 500 });
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text || '';

  let sentences: { direction: string; prompt: string; reference: string; usedWords: string[] }[];
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    sentences = JSON.parse(clean);
  } catch (e) {
    console.error('[generate-translations] Failed to parse Claude response:', raw);
    return NextResponse.json({ error: 'Failed to parse Claude response' }, { status: 500 });
  }

  // Insert with deduplication — check (prompt, direction) before inserting
  let inserted = 0;
  let skipped = 0;
  for (const s of sentences) {
    if (!s.direction || !s.prompt || !s.reference) continue;
    const existing = await prisma.translationSentence.findFirst({
      where: { prompt: s.prompt, direction: s.direction },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.translationSentence.create({
      data: {
        direction: s.direction,
        prompt: s.prompt,
        reference: s.reference,
        usedWords: JSON.stringify(s.usedWords || []),
        used: false,
      },
    });
    inserted++;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    skipped,
    wordsUsed: words.length,
  });
}
