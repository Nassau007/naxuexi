// src/app/api/generate-translations/route.ts
// Weekly cron — pre-generates translation sentences using Claude API
// Triggered by cron-job.org: GET /api/generate-translations?secret=CRON_SECRET

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DIRECTIONS = ['EN_TO_ZH', 'FR_TO_ZH', 'ZH_TO_EN'] as const;
const BATCH_SIZE = 100;

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch learned + learning words
  const words = await prisma.word.findMany({
    where: { status: { in: ['LEARNED', 'LEARNING'] } },
    select: { hanzi: true, pinyin: true, meaning: true },
  });

  if (words.length < 5) {
    return NextResponse.json({ error: 'Not enough learned words to generate sentences' }, { status: 400 });
  }

  const wordList = words.map(w => `${w.hanzi} (${w.pinyin} — ${w.meaning})`).join('\n');
  const perDirection = Math.floor(BATCH_SIZE / DIRECTIONS.length);

  const prompt = `You are a Chinese language teacher generating translation exercises.

Here are the student's known words:
${wordList}

Generate exactly ${BATCH_SIZE} translation sentences (${perDirection} per direction):
- ${perDirection} sentences: English → Chinese (direction: EN_TO_ZH)
- ${perDirection} sentences: French → Chinese (direction: FR_TO_ZH)  
- ${perDirection} sentences: Chinese → English (direction: ZH_TO_EN)

Rules:
- ONLY use vocabulary from the word list above
- Keep sentences short (4-8 words)
- Vary difficulty from simple to more complex
- Make sentences natural and practical
- For ZH_TO_EN: prompt is Chinese, reference is English
- For EN_TO_ZH and FR_TO_ZH: prompt is the source language, reference is Chinese (hanzi + pinyin)

Respond ONLY with a valid JSON array, no markdown, no explanation:
[
  {
    "direction": "EN_TO_ZH",
    "prompt": "I have a friend",
    "reference": "我有朋友 (wǒ yǒu péngyou)",
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
      model: 'claude-haiku-4-5-20251001', // cheapest model, perfect for structured generation
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

  // Bulk insert
  let inserted = 0;
  for (const s of sentences) {
    if (!s.direction || !s.prompt || !s.reference) continue;
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
    wordsUsed: words.length,
  });
}
