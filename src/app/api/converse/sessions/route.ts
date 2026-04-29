// src/app/api/converse/sessions/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessions = await prisma.conversationSession.findMany({
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      topic: true,
      topicLabel: true,
      startedAt: true,
      endedAt: true,
      turnCount: true,
      corrections: true,
      newWords: true,
    },
  });

  const enriched = sessions.map(s => {
    let correctionCount = 0;
    let newWordCount = 0;
    try {
      correctionCount = (JSON.parse(s.corrections) as unknown[]).length;
    } catch {}
    try {
      newWordCount = (JSON.parse(s.newWords) as unknown[]).length;
    } catch {}
    return {
      id: s.id,
      topic: s.topic,
      topicLabel: s.topicLabel,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      turnCount: s.turnCount,
      correctionCount,
      newWordCount,
    };
  });

  return NextResponse.json({ sessions: enriched });
}
