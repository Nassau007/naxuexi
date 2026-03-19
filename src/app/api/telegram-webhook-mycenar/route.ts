// src/app/api/telegram-webhook-mycenar/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// --- Fuzzy matching helpers ---

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
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
  return (2 * precision * recall) / (precision + recall);
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

// --- Session state ---
const quizSession = new Map<number, boolean>();

// --- Send message via MycenarBot ---
async function sendMycenarMessage(text: string, options: Record<string, unknown> = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN_FR;
  const chatId = process.env.TELEGRAM_CHAT_ID_FR;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...options }),
  });
}

// --- Handler ---

export async function POST(req: Request) {
  const body = await req.json();
  const message = body?.message;
  const text = message?.text?.trim();
  const chatId: number = message?.chat?.id;

  if (!text || !chatId) return NextResponse.json({ ok: true });

  // --- /poem command ---
  if (text === '/poem') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendMycenarMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const end = Math.min((progress.chunkIndex + 1) * progress.chunkSize, lines.length);

    quizSession.set(chatId, true);

    await sendMycenarMessage(
      `🧠 <b>Quiz — ${progress.poem.title}</b>\n` +
      `Lignes 1–${end} (${end} vers)\n\n` +
      `Tape le texte de mémoire, un vers par ligne, puis envoie 👇`,
      { parse_mode: 'HTML' }
    );

    return NextResponse.json({ ok: true });
  }

  // --- /next command ---
  if (text === '/next') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendMycenarMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const totalChunks = Math.ceil(lines.length / progress.chunkSize);
    const nextIndex = progress.chunkIndex + 1;

    if (nextIndex >= totalChunks) {
      await sendMycenarMessage(
        `🎉 Bravo ! Tu as mémorisé <b>${progress.poem.title}</b> en entier !`,
        { parse_mode: 'HTML' }
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

      const end = Math.min((nextIndex + 1) * progress.chunkSize, lines.length);

      await sendMycenarMessage(
        `✅ Chunk suivant débloqué !\nDemain tu recevras les lignes 1–${end} de <b>${progress.poem.title}</b>.`,
        { parse_mode: 'HTML' }
      );
    }

    return NextResponse.json({ ok: true });
  }

  // --- /activepoem command ---
  if (text === '/activepoem') {
    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendMycenarMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const fullPoem = lines.join('\n');

    await sendMycenarMessage(
      `📜 ${progress.poem.title} — ${progress.poem.author}\n\n${fullPoem}`
    );

    return NextResponse.json({ ok: true });
  }

  // --- Quiz answer ---
  if (quizSession.get(chatId)) {
    quizSession.delete(chatId);

    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendMycenarMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const end = Math.min((progress.chunkIndex + 1) * progress.chunkSize, lines.length);
    const refLines = lines.slice(0, end);

    const userLines = text.split('\n').map((l: string) => l.trim());
    const { lineResults, globalScore } = compareLines(userLines, refLines);

    const passedCount = lineResults.filter(r => r.ok).length;
    const total = lineResults.length;

    let report = passedCount === total
      ? `✅ <b>Bien joué !</b> (${Math.round(globalScore * 100)}%)\n\n`
      : `❌ <b>Pas encore…</b> (${Math.round(globalScore * 100)}%)\n\n`;

    for (const r of lineResults) {
      if (r.ok) {
        report += `✓ ${r.ref}\n`;
      } else {
        report += `✗ Toi : <i>${r.user || '(manquant)'}</i>\n`;
        report += `  Ref : ${r.ref}\n`;
      }
    }

    if (passedCount === total) {
      report += `\nEnvoie /next pour débloquer les 5 vers suivants 🎯`;
    } else {
      report += `\n${passedCount}/${total} vers corrects. Réessaie avec /quiz !`;
    }

    await sendMycenarMessage(report, { parse_mode: 'HTML' });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
