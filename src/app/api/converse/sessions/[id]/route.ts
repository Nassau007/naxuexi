// src/app/api/converse/sessions/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await prisma.conversationSession.findUnique({
    where: { id: params.id },
  });

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let transcript: unknown[] = [];
  let corrections: unknown[] = [];
  let newWords: unknown[] = [];

  try { transcript = JSON.parse(session.transcript); } catch {}
  try { corrections = JSON.parse(session.corrections); } catch {}
  try { newWords = JSON.parse(session.newWords); } catch {}

  return NextResponse.json({
    id: session.id,
    topic: session.topic,
    topicLabel: session.topicLabel,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    turnCount: session.turnCount,
    transcript,
    corrections,
    newWords,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await prisma.conversationSession.findUnique({
    where: { id: params.id },
    select: { endedAt: true },
  });

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!session.endedAt) {
    return NextResponse.json(
      { error: 'Cannot delete an active session. End it first with /endconverse.' },
      { status: 409 }
    );
  }

  await prisma.conversationSession.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
