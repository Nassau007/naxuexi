import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/vocab — List all words with optional filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');

  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }
  if (category) {
    where.category = category;
  }
  if (search) {
    where.OR = [
      { hanzi: { contains: search } },
      { pinyin: { contains: search } },
      { meaning: { contains: search } },
    ];
  }

  const [words, total] = await Promise.all([
    prisma.word.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.word.count({ where }),
  ]);

  // Stats
  const stats = await prisma.word.groupBy({
    by: ['status'],
    _count: true,
  });

  const dueForReview = await prisma.word.count({
    where: {
      nextReview: { lte: new Date() },
      status: { not: "NEW" },
    },
  });

  return NextResponse.json({
    words,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    stats: {
      total,
      new: stats.find(s => s.status === 'NEW')?._count || 0,
      learning: stats.find(s => s.status === 'LEARNING')?._count || 0,
      learned: stats.find(s => s.status === 'LEARNED')?._count || 0,
      dueForReview,
    },
  });
}

// POST /api/vocab — Add one or multiple words
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Support single word or bulk import
  const words = Array.isArray(body.words) ? body.words : [body];

  const results = [];
  const errors = [];

  for (const word of words) {
    if (!word.hanzi || !word.pinyin || !word.meaning) {
      errors.push({ word: word.hanzi || '?', error: 'Missing required fields (hanzi, pinyin, meaning)' });
      continue;
    }

    try {
      const created = await prisma.word.create({
        data: {
          hanzi: word.hanzi.trim(),
          pinyin: word.pinyin.trim(),
          meaning: word.meaning.trim(),
          category: word.category?.trim() || null,
          hskLevel: word.hskLevel || null,
          components: word.components?.trim() || null,
          mnemonic: word.mnemonic?.trim() || null,
        },
      });
      results.push(created);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('Unique constraint')) {
        errors.push({ word: word.hanzi, error: 'Already exists' });
      } else {
        errors.push({ word: word.hanzi, error: message });
      }
    }
  }

  return NextResponse.json({
    created: results.length,
    errors: errors.length,
    results,
    ...(errors.length > 0 && { errorDetails: errors }),
  }, { status: errors.length === words.length ? 400 : 201 });
}
