import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateSM2, resultToQuality } from '@/lib/spaced-repetition';

// GET /api/flashcards — Get cards due for review
// Query params: limit (default 20), mode (comma-separated directions or "mixed")
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const mode = searchParams.get('mode') || 'mixed';

  // Get words due for review (next review date <= now)
  const dueWords = await prisma.word.findMany({
    where: {
      nextReview: { lte: new Date() },
    },
    orderBy: [
      { status: 'asc' },
      { nextReview: 'asc' },
    ],
    take: limit,
  });

  // If not enough due words, pad with NEW words
  if (dueWords.length < limit) {
    const newWords = await prisma.word.findMany({
      where: {
        status: 'NEW',
        id: { notIn: dueWords.map(w => w.id) },
      },
      take: limit - dueWords.length,
      orderBy: { createdAt: 'asc' },
    });
    dueWords.push(...newWords);
  }

  // Determine which directions to use
  const allDirections = [
    'hanzi_to_meaning',
    'meaning_to_hanzi',
    'hanzi_to_pinyin',
    'meaning_to_pinyin',
    'pinyin_to_meaning',
  ];

  const directions = mode === 'mixed'
    ? allDirections
    : mode.split(',').filter(d => allDirections.includes(d));

  if (directions.length === 0) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  const cards = dueWords.map(word => {
    const direction = directions[Math.floor(Math.random() * directions.length)];
    return buildCard(word, direction);
  });

  // Shuffle cards
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const totalDue = await prisma.word.count({
    where: { nextReview: { lte: new Date() } },
  });

  return NextResponse.json({
    cards,
    totalDue,
    sessionSize: cards.length,
  });
}

// POST /api/flashcards — Submit a review result
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { wordId, result, module } = body;

  if (!wordId || !result) {
    return NextResponse.json({ error: 'wordId and result required' }, { status: 400 });
  }

  const word = await prisma.word.findUnique({ where: { id: wordId } });
  if (!word) {
    return NextResponse.json({ error: 'Word not found' }, { status: 404 });
  }

  // Calculate new SM-2 values
  const quality = resultToQuality(result);
  const sm2 = calculateSM2({
    quality,
    easeFactor: word.easeFactor,
    interval: word.interval,
    reviewCount: word.reviewCount,
  });

  // Update word
  const updated = await prisma.word.update({
    where: { id: wordId },
    data: {
      easeFactor: sm2.easeFactor,
      interval: sm2.interval,
      nextReview: sm2.nextReview,
      status: sm2.status,
      reviewCount: { increment: 1 },
      ...(result === 'CORRECT' && { correctCount: { increment: 1 } }),
    },
  });

  // Log the review
  await prisma.reviewLog.create({
    data: {
      wordId,
      module: module || 'FLASHCARD',
      result,
    },
  });

  return NextResponse.json({
    word: updated,
    nextReview: sm2.nextReview,
    newStatus: sm2.status,
    interval: sm2.interval,
  });
}

function buildCard(word: Record<string, unknown>, direction: string) {
  const hanzi = word.hanzi as string;
  const pinyin = word.pinyin as string;
  const meaning = word.meaning as string;

  switch (direction) {
    case 'hanzi_to_meaning':
      return {
        wordId: word.id,
        direction,
        prompt: hanzi,
        promptLabel: 'What does this mean?',
        answer: meaning,
        hint: pinyin,
        status: word.status,
      };
    case 'meaning_to_hanzi':
      return {
        wordId: word.id,
        direction,
        prompt: meaning,
        promptLabel: 'Write the hanzi',
        answer: hanzi,
        hint: pinyin,
        status: word.status,
      };
    case 'hanzi_to_pinyin':
      return {
        wordId: word.id,
        direction,
        prompt: hanzi,
        promptLabel: 'What is the pinyin?',
        answer: pinyin,
        hint: meaning,
        status: word.status,
      };
    case 'meaning_to_pinyin':
      return {
        wordId: word.id,
        direction,
        prompt: meaning,
        promptLabel: 'What is the pinyin?',
        answer: pinyin,
        hint: hanzi,
        status: word.status,
      };
    case 'pinyin_to_meaning':
      return {
        wordId: word.id,
        direction,
        prompt: pinyin,
        promptLabel: 'What does this mean?',
        answer: meaning,
        hint: hanzi,
        status: word.status,
      };
    default:
      return {
        wordId: word.id,
        direction: 'hanzi_to_meaning',
        prompt: hanzi,
        promptLabel: 'What does this mean?',
        answer: meaning,
        hint: pinyin,
        status: word.status,
      };
  }
}
