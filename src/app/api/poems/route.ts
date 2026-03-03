// src/app/api/poems/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET all poems
export async function GET() {
  const poems = await prisma.poem.findMany({
    include: { progress: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(poems);
}

// POST create a new poem
export async function POST(req: Request) {
  const { title, author, text } = await req.json();

  if (!title || !author || !text) {
    return NextResponse.json({ error: 'title, author and text are required' }, { status: 400 });
  }

  // Split into lines, remove empty lines
  const lines = text
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);

  if (lines.length < 1) {
    return NextResponse.json({ error: 'Poem has no lines' }, { status: 400 });
  }

  const poem = await prisma.poem.create({
    data: {
      title,
      author,
      lines: JSON.stringify(lines),
      progress: {
        create: {
          chunkIndex: 0,
          chunkSize: 5,
          active: true,
        },
      },
    },
    include: { progress: true },
  });

  return NextResponse.json(poem);
}
