import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { autoSeedIfEmpty } from '@/lib/seed';

async function sendDailyHanzi(request: NextRequest) {
  // Verify secret if configured
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Auto-seed if database is empty (e.g. after redeploy)
  await autoSeedIfEmpty();

  const count = parseInt(process.env.DAILY_HANZI_COUNT || '15');

  // Pick words: prioritize LEARNED, then LEARNING, then NEW
  const learnedWords = await prisma.word.findMany({
    where: { status: 'LEARNED' },
  });

  const learningWords = await prisma.word.findMany({
    where: { status: 'LEARNING' },
  });

  const pool = [...learnedWords, ...learningWords];

  if (pool.length < count) {
    const newWords = await prisma.word.findMany({
      where: { status: 'NEW' },
      take: count - pool.length,
    });
    pool.push(...newWords);
  }

  // Shuffle and pick
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected = pool.slice(0, count);

  if (selected.length === 0) {
    return NextResponse.json({ error: 'No words in database' }, { status: 400 });
  }

  // Record daily practice
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dailyPractice;
  try {
    dailyPractice = await prisma.dailyPractice.upsert({
      where: { date: today },
      update: {},
      create: {
        date: today,
        sentVia: 'telegram',
        words: {
          create: selected.map(w => ({ wordId: w.id })),
        },
      },
    });
  } catch {
    dailyPractice = await prisma.dailyPractice.findUnique({ where: { date: today } });
  }

  // Build Telegram message
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  let message = `📝 <b>Daily Hanzi Practice</b>\n${dateStr}\n\n`;

  selected.forEach((w, i) => {
    const strokeUrl = `https://www.strokeorder.com/chinese/${encodeURIComponent(w.hanzi)}`;
    message += `${i + 1}. <b>${w.hanzi}</b>  ·  ${w.pinyin}  ·  ${w.meaning}\n`;
    message += `     <a href="${strokeUrl}">Stroke order ↗</a>\n\n`;
  });

  message += `📊 ${learnedWords.length} learned · ${learningWords.length} learning\n`;
  message += `🔗 <a href="https://naxuexi.com/flashcards">Review flashcards</a>`;

  // Send via Telegram
  try {
    const result = await sendTelegramMessage(message);

    if (!result.ok) {
      return NextResponse.json({
        error: 'Telegram send failed',
        details: result,
      }, { status: 500 });
    }

    return NextResponse.json({
      sent: true,
      wordCount: selected.length,
      words: selected.map(w => ({ hanzi: w.hanzi, pinyin: w.pinyin, meaning: w.meaning })),
      dailyPracticeId: dailyPractice?.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Both GET and POST trigger the daily hanzi send
// GET is needed for cron-job.org which only supports GET
export async function GET(request: NextRequest) {
  return sendDailyHanzi(request);
}

export async function POST(request: NextRequest) {
  return sendDailyHanzi(request);
}
