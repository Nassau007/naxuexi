// src/app/api/poems/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// DELETE a poem
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id);
  await prisma.poemProgress.deleteMany({ where: { poemId: id } });
  await prisma.poem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// PATCH — toggle poem active state (only one active at a time)
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id);

  // Get current state
  const current = await prisma.poemProgress.findUnique({
    where: { poemId: id },
  });

  if (!current) {
    return NextResponse.json({ error: 'No progress found' }, { status: 404 });
  }

  if (current.active) {
    // Deactivate this poem (pause delivery)
    await prisma.poemProgress.update({
      where: { poemId: id },
      data: { active: false },
    });
  } else {
    // Deactivate all, then activate this one
    await prisma.poemProgress.updateMany({ data: { active: false } });
    await prisma.poemProgress.update({
      where: { poemId: id },
      data: { active: true },
    });
  }

  return NextResponse.json({ ok: true });
}
