import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteParams = { params: { id: string } };

// GET /api/vocab/[id]
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const word = await prisma.word.findUnique({
    where: { id: parseInt(params.id) },
    include: {
      reviews: {
        orderBy: { timestamp: 'desc' },
        take: 20,
      },
    },
  });

  if (!word) {
    return NextResponse.json({ error: 'Word not found' }, { status: 404 });
  }

  return NextResponse.json(word);
}

// PATCH /api/vocab/[id] — Update a word
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const body = await request.json();
  const id = parseInt(params.id);

  const existing = await prisma.word.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Word not found' }, { status: 404 });
  }

  const updated = await prisma.word.update({
    where: { id },
    data: {
      ...(body.hanzi && { hanzi: body.hanzi.trim() }),
      ...(body.pinyin && { pinyin: body.pinyin.trim() }),
      ...(body.meaning && { meaning: body.meaning.trim() }),
      ...(body.category !== undefined && { category: body.category?.trim() || null }),
      ...(body.hskLevel !== undefined && { hskLevel: body.hskLevel }),
      ...(body.components !== undefined && { components: body.components?.trim() || null }),
      ...(body.mnemonic !== undefined && { mnemonic: body.mnemonic?.trim() || null }),
      ...(body.status && { status: body.status }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/vocab/[id]
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const id = parseInt(params.id);

  try {
    await prisma.word.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'Word not found' }, { status: 404 });
  }
}
