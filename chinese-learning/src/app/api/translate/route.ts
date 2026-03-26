// src/app/api/translate/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [attempts, sentences, stockRemaining] = await Promise.all([
    prisma.translationAttempt.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sentence: {
          select: { direction: true, prompt: true, reference: true },
        },
      },
    }),
    prisma.translationSentence.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, direction: true, prompt: true, reference: true, used: true, createdAt: true },
    }),
    prisma.translationSentence.count({ where: { used: false } }),
  ]);

  const total = attempts.length;
  const passed = attempts.filter(a => a.passed).length;
  const avgScore = total > 0 ? attempts.reduce((s, a) => s + a.score, 0) / total : 0;

  return NextResponse.json({
    attempts,
    sentences,
    stats: { total, passed, avgScore, stockRemaining },
  });
}
