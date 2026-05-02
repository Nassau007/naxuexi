// src/app/api/converse/pending/count/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const count = await prisma.pendingVocab.count();
  return NextResponse.json({ count });
}
