// src/app/api/daily-poem/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Find active poem
  const progress = await prisma.poemProgress.findFirst({
    where: { active: true },
    include: { poem: true },
  });

  if (!progress) {
    return NextResponse.json({ error: 'No active poem' }, { status: 404 });
  }

  const lines: string[] = JSON.parse(progress.poem.lines);
  const { chunkIndex, chunkSize } = progress;

  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, lines.length);
  const chunk = lines.slice(start, end);

  // Build message
const chunkText = chunk.join('\n');
const fullPoem = lines.join('\n');

const now = new Date();
const today = now.toLocaleDateString('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const time = now.toLocaleTimeString('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

const message =
  `📖 Chunk du jour — ${today} à ${time} (lignes ${start + 1}–${end})\n\n` +
  `${chunkText}\n\n` +
  `━━━━━━━━━━━━━━━━━━━━\n` +
  `📜 ${progress.poem.title} — ${progress.poem.author}\n\n` +
  `${fullPoem}\n\n` +
  `Envoie /quiz pour tester ta mémoire 🎯`;

await sendTelegramMessage(message);

  return NextResponse.json({
    ok: true,
    poem: progress.poem.title,
    chunk: `lines ${start + 1}–${end}`,
  });
}
