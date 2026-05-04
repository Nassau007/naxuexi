// src/app/api/categories/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const HIDDEN_CATEGORIES = new Set(['CONVERSATION']);

export async function GET() {
  const rows = await prisma.word.findMany({
    where: { category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });
  const categories = rows
    .map(r => r.category)
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
    .filter(c => !HIDDEN_CATEGORIES.has(c))
    .sort();
  return NextResponse.json({ categories });
}
