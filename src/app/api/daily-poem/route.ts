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

  // Cumulative: always start from line 0, up to end of current chunk
  const end = Math.min((chunkIndex + 1) * chunkSize, lines.length);
  const newChunkStart = chunkIndex * chunkSize; // the newly added lines
  const cumulativeLines = lines.slice(0, end);
  const newLines = lines.slice(newChunkStart, end);

  // Build message
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

  // Mark new lines vs previously learned lines
  const cumulativeText = cumulativeLines
    .map((line, i) => (i >= newChunkStart ? `▶ ${line}` : `  ${line}`))
    .join('\n');

  const message =
    `📖 Récap du jour — ${today} à ${time}\n` +
    `Lignes 1–${end} (${newLines.length} nouvelles, ${newChunkStart} déjà apprises)\n\n` +
    `${cumulativeText}\n\n` +
    `📜 ${progress.poem.title} — ${progress.poem.author}\n\n` +
    `Envoie /quiz pour tester ta mémoire 🎯`;

await sendTelegramMessage(message);

  return NextResponse.json({
    ok: true,
    poem: progress.poem.title,
    chunk: `lines 1–${end}`,
  });
}
