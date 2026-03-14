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
  return (2 * precision * recall) / (precision + recall); // F1
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

// --- Session state (in-memory, Railway restarts clear it but that's fine) ---
const quizSession = new Map<number, boolean>();

// --- Handler ---

export async function POST(req: Request) {
  const body = await req.json();
  const message = body?.message;
  const text = message?.text?.trim();
  const chatId: number = message?.chat?.id;

  if (!text || !chatId) return NextResponse.json({ ok: true });

  // --- /quiz command ---
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
    const end = Math.min((progress.chunkIndex + 1) * progress.chunkSize, lines.length);

    quizSession.set(chatId, true);

    await sendTelegramMessage(
      `🧠 *Quiz — ${progress.poem.title}*\n` +
      `Lignes 1–${end} (${end} vers)\n\n` +
      `Tape le texte de mémoire, un vers par ligne, puis envoie 👇`,
      { parse_mode: 'Markdown' }
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
      await sendTelegramMessage('Aucun poème actif.');
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

      const end = Math.min((nextIndex + 1) * progress.chunkSize, lines.length);

      await sendTelegramMessage(
        `✅ Chunk suivant débloqué !\nDemain tu recevras les lignes 1–${end} de *${progress.poem.title}*.`,
        { parse_mode: 'Markdown' }
      );
    }

    return NextResponse.json({ ok: true });
  }

  // --- /poem command — show full poem text ---
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
    const fullPoem = lines.join('\n');

    await sendTelegramMessage(
      `📜 ${progress.poem.title} — ${progress.poem.author}\n\n${fullPoem}`
    );

    return NextResponse.json({ ok: true });
  }

  // --- Quiz answer (if quiz session active) ---
  if (quizSession.get(chatId)) {
    quizSession.delete(chatId);

    const progress = await prisma.poemProgress.findFirst({
      where: { active: true },
      include: { poem: true },
    });

    if (!progress) {
      await sendTelegramMessage('Aucun poème actif.');
      return NextResponse.json({ ok: true });
    }

    const lines: string[] = JSON.parse(progress.poem.lines);
    const end = Math.min((progress.chunkIndex + 1) * progress.chunkSize, lines.length);
    const refLines = lines.slice(0, end);

    const userLines = text.split('\n').map((l: string) => l.trim());
    const { lineResults, globalScore } = compareLines(userLines, refLines);

    let report = `📊 *Résultat — ${progress.poem.title}*\n`;
    report += `Score global : ${Math.round(globalScore * 100)}%\n\n`;

    for (let i = 0; i < lineResults.length; i++) {
      const r = lineResults[i];
      const icon = r.ok ? '✅' : '❌';
      report += `${icon} Ligne ${i + 1} (${Math.round(r.score * 100)}%)`;
      if (!r.ok && r.ref) {
        report += `\n   → ${r.ref}`;
      }
      report += '\n';
    }

    const passed = lineResults.filter(r => r.ok).length;
    const total = lineResults.length;

    if (passed === total) {
      report += `\n🎉 Parfait ! ${passed}/${total} vers corrects.\nEnvoie /next pour débloquer le chunk suivant.`;
    } else {
      report += `\n${passed}/${total} vers corrects. Réessaie les ${total} vers depuis le début avec /quiz !`;
    }

    await sendTelegramMessage(report, { parse_mode: 'Markdown' });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
