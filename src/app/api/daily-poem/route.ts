// src/app/api/daily-poem/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const progress = await prisma.poemProgress.findFirst({
    where: { active: true },
    include: { poem: true },
  });

  if (!progress) {
    return NextResponse.json({ error: 'No active poem' }, { status: 404 });
  }

  const lines: string[] = JSON.parse(progress.poem.lines);
  const { chunkIndex, chunkSize } = progress;

  const end = Math.min((chunkIndex + 1) * chunkSize, lines.length);
  const newChunkStart = chunkIndex * chunkSize;
  const cumulativeLines = lines.slice(0, end);
  const newLines = lines.slice(newChunkStart, end);

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

  const cumulativeText = cumulativeLines
    .map((line, i) => (i >= newChunkStart ? `▶ ${line}` : `  ${line}`))
    .join('\n');

  const message =
    `📖 Récap du jour — ${today} à ${time}\n` +
    `Lignes 1–${end} (${newLines.length} nouvelles, ${newChunkStart} déjà apprises)\n\n` +
    `${cumulativeText}\n\n` +
    `📜 ${progress.poem.title} — ${progress.poem.author}\n\n` +
    `Envoie /poem pour tester ta mémoire 🎯`;

  const token = process.env.TELEGRAM_BOT_TOKEN_FR;
  const chatId = process.env.TELEGRAM_CHAT_ID_FR;
  console.log('[daily-poem] token:', token ? 'set' : 'MISSING');
  console.log('[daily-poem] chatId:', chatId);
  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  const tgData = await tgRes.json();
  console.log('[daily-poem] telegram response:', JSON.stringify(tgData));

  return NextResponse.json({
    ok: true,
    poem: progress.poem.title,
    chunk: `lines 1–${end}`,
  });
}