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

// PATCH — set poem as active (only one active at a time)
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id);

  // Deactivate all
  await prisma.poemProgress.updateMany({ data: { active: false } });

  // Activate the selected one
  await prisma.poemProgress.update({
    where: { poemId: id },
    data: { active: true },
  });

  return NextResponse.json({ ok: true });
}
