// src/app/api/telegram-webhook/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

// --- Fuzzy matching helpers ---

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '')     // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSimilarity(a: string, b: string): number {
  const wordsA = normalize(a).split(' ').filter(Boolean);
  const wordsB = normalize(b).split(' ').filter(Boolean);
  if (wordsA.length === 0 && wordsB.length === 0) return 1;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  let matched = 0;
  const usedB = new Set<number>();

  for (const wa of wordsA) {
    for (let i = 0; i < wordsB.length; i++) {
      if (!usedB.has(i) && wordsB[i] === wa) {
        matched++;
        usedB.add(i);
        break;
      }
    }
  }

  const precision = matched / wordsA.length;
  const recall = matched / wordsB.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall); // F1 score
}

function compareLines(userLines: string[], refLines: string[]): {
  lineResults: { ok: boolean; score: number; user: string; ref: string }[];
  globalScore: number;
} {
  const maxLen = Math.max(userLines.length, refLines.length);
  const lineResults = [];

  for (let i = 0; i < maxLen; i++) {
    const user = userLines[i] || '';
    const ref = refLines[i] || '';
    const score = wordSimilarity(user, ref);
    lineResults.push({ ok: score >= 0.85, score, user, ref });
  }

  const globalScore = lineResults.reduce((s, r) => s + r.score, 0) / lineResults.length;
  return { lineResults, globalScore };
}

// --- In-memory quiz session state ---
// key = telegram chat_id, value = true when awaiting quiz answer
// Railway restarts clear it — that's fine, quiz just resets
const quizSession = new Map<number, boolean>();

// --- Main handler ---

export async function POST(req: Request) {
  const body = await req.json();
  const message = body?.message;
  const text = message?.text?.trim();
  const chatId: number = message?.chat?.id;

  if (!text || !chatId) return NextResponse.json({ ok: true });

  // /quiz — start a quiz session
  if (text === '/quiz') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const start = progress.chunkIndex * progress.chunkSize;
    const end = Math.min(start + progress.chunkSize, lines.length);
    const chunkLines = lines.slice(start, end);

    quizSession.set(chatId, true);

    await sendTelegramMessage(
      `🧠 *Quiz — ${progress.poem.title}*\n` +
      `Lignes ${start + 1}–${end} (${chunkLines.length} vers)\n\n` +
      `Tape le chunk de mémoire, un vers par ligne, puis envoie 👇`,
      { parse_mode: 'Markdown' }
    );

    return NextResponse.json({ ok: true });
  }

  // Free text answer — check if we're in a quiz session
  if (quizSession.get(chatId) && !text.startsWith('/')) {
    quizSession.delete(chatId);

    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Session expirée, aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const start = progress.chunkIndex * progress.chunkSize;
    const end = Math.min(start + progress.chunkSize, lines.length);
    const refLines = lines.slice(start, end);
    const userLines = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const { lineResults, globalScore } = compareLines(userLines, refLines);
    const passed = globalScore >= 0.85;

    let resultMsg = passed
      ? `✅ *Bien joué !* (${Math.round(globalScore * 100)}%)\n\n`
      : `❌ *Pas encore…* (${Math.round(globalScore * 100)}%)\n\n`;

    for (const r of lineResults) {
      if (r.ok) {
        resultMsg += `✓ ${r.ref}\n`;
      } else {
        resultMsg += `✗ Toi : _${r.user || '(manquant)'}_ \n`;
        resultMsg += `  Ref : *${r.ref}*\n`;
      }
    }

    if (passed) {
      resultMsg += `\nEnvoie /next pour passer au chunk suivant 🎯`;
    } else {
      resultMsg += `\nRéessaie avec /quiz ou retente demain.`;
    }

    await sendTelegramMessage(resultMsg, { parse_mode: 'Markdown' });
    return NextResponse.json({ ok: true });
  }

  // /next — advance to next chunk
  if (text === '/next') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Aucun poème actif trouvé.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const totalChunks = Math.ceil(lines.length / progress.chunkSize);
    const nextIndex = progress.chunkIndex + 1;

    if (nextIndex >= totalChunks) {
      await sendTelegramMessage(
        `🎉 Bravo ! Tu as mémorisé *${progress.poem.title}* en entier !`,
        { parse_mode: 'Markdown' }
      );
      await prisma.poemProgress.update({
        where: { id: progress.id },
        data: { active: false },
      });
    } else {
      await prisma.poemProgress.update({
        where: { id: progress.id },
        data: { chunkIndex: nextIndex },
      });

      const start = nextIndex * progress.chunkSize;
      const end = Math.min(start + progress.chunkSize, lines.length);

      await sendTelegramMessage(
        `✅ Chunk suivant débloqué !\nDemain tu recevras les lignes *${start + 1}–${end}* de *${progress.poem.title}*.`,
        { parse_mode: 'Markdown' }
      );
    }

    return NextResponse.json({ ok: true });
  }

  // /poem — show current status
  if (text === '/poem') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const totalChunks = Math.ceil(lines.length / progress.chunkSize);
    const start = progress.chunkIndex * progress.chunkSize;
    const end = Math.min(start + progress.chunkSize, lines.length);

    await sendTelegramMessage(
      `📖 *${progress.poem.title}* — ${progress.poem.author}\n` +
      `Chunk actuel : lignes ${start + 1}–${end} (${progress.chunkIndex + 1}/${totalChunks})`,
      { parse_mode: 'Markdown' }
    );

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
