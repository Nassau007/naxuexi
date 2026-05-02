// src/app/api/converse/pending/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET — list all pending vocab, newest first
export async function GET() {
  const pending = await prisma.pendingVocab.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ pending });
}

// POST — approve a pending word: move it to Word table, then delete from PendingVocab
// Body: { id: string, hanzi: string, pinyin: string, meaning: string }
//   (hanzi/pinyin/meaning allow user-edited values from the review UI)
export async function POST(req: Request) {
  const body = await req.json();
  const { id, hanzi, pinyin, meaning } = body;

  if (!id || !hanzi || !pinyin || !meaning) {
    return NextResponse.json(
      { error: 'Missing required fields: id, hanzi, pinyin, meaning' },
      { status: 400 }
    );
  }

  const pending = await prisma.pendingVocab.findUnique({ where: { id } });
  if (!pending) {
    return NextResponse.json({ error: 'Pending vocab not found' }, { status: 404 });
  }

  // Check Word table again at approval time — covers race condition where
  // user added the same word elsewhere between session and approval
  const existing = await prisma.word.findUnique({ where: { hanzi } });
  if (existing) {
    // Just delete the pending entry — word already exists
    await prisma.pendingVocab.delete({ where: { id } });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'already_in_vocab',
    });
  }

  // Create the word with LEARNING status
  await prisma.word.create({
    data: {
      hanzi,
      pinyin,
      meaning,
      category: 'CONVERSATION',
      status: 'LEARNING',
    },
  });

  await prisma.pendingVocab.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

// DELETE — discard a pending word
// Query param: ?id=<pendingId>
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id query param' }, { status: 400 });
  }

  try {
    await prisma.pendingVocab.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
