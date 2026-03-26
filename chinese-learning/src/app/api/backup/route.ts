// src/app/api/backup/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendBackupEmail } from '@/lib/resend';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ?type=daily (default) or ?type=weekly
  const type = new URL(req.url).searchParams.get('type') === 'weekly' ? 'weekly' : 'daily';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // e.g. 2026-03-06
  const label = type === 'weekly' ? 'Weekly Full' : 'Daily Light';

  // ─── Always included: poems + progress ───────────────────────────────────
  const poems = await prisma.poem.findMany({
    include: { progress: true },
  });

  const backup: Record<string, unknown> = {
    exportedAt: now.toISOString(),
    type,
    poems: poems.map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author,
      lines: JSON.parse(p.lines),
      createdAt: p.createdAt,
      progress: p.progress
        ? {
            chunkIndex: p.progress.chunkIndex,
            chunkSize: p.progress.chunkSize,
            active: p.progress.active,
            updatedAt: p.progress.updatedAt,
          }
        : null,
    })),
  };

  // ─── Weekly only: vocab + review history ─────────────────────────────────
  if (type === 'weekly') {
    const words = await prisma.word.findMany({
      include: { reviewLogs: true },
    });

    backup.vocab = words.map((w) => ({
      id: w.id,
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      meaning: w.meaning,
      category: w.category,
      hskLevel: w.hskLevel,
      status: w.status,
      easeFactor: w.easeFactor,
      interval: w.interval,
      nextReview: w.nextReview,
      reviewCount: w.reviewCount,
      correctCount: w.correctCount,
      reviewLogs: w.reviewLogs.map((r) => ({
        module: r.module,
        result: r.result,
        timestamp: r.timestamp,
      })),
    }));
  }

  const json = JSON.stringify(backup, null, 2);
  const filename = `naxuexi-backup-${type}-${dateStr}.json`;

  // ─── Summary for email body ───────────────────────────────────────────────
  const poemSummary = poems
    .map((p) => {
      const prog = p.progress;
      const lines = JSON.parse(p.lines) as string[];
      const status = prog
        ? prog.active
          ? `chunk ${prog.chunkIndex + 1}/${Math.ceil(lines.length / prog.chunkSize)} (active)`
          : 'completed'
        : 'no progress';
      return `<li><b>${p.title}</b> — ${p.author} · ${lines.length} lines · ${status}</li>`;
    })
    .join('');

  const vocabSummary =
    type === 'weekly'
      ? (() => {
          const counts = { NEW: 0, LEARNING: 0, LEARNED: 0 };
          // We already fetched words above; re-use backup.vocab
          const vocab = backup.vocab as { status: string }[];
          for (const w of vocab) {
            if (w.status in counts) counts[w.status as keyof typeof counts]++;
          }
          return `
            <h3>Vocabulary</h3>
            <p>${vocab.length} words total — ${counts.LEARNED} learned · ${counts.LEARNING} learning · ${counts.NEW} new</p>
          `;
        })()
      : '';

  const html = `
    <h2>NaXueXi ${label} Backup — ${dateStr}</h2>
    <p>Your backup is attached as <code>${filename}</code>.</p>

    <h3>Poems (${poems.length})</h3>
    <ul>${poemSummary}</ul>

    ${vocabSummary}

    <hr/>
    <p style="color:#888;font-size:12px;">Generated automatically by NaXueXi · naxuexi.com</p>
  `;

  await sendBackupEmail({
    subject: `NaXueXi ${label} Backup — ${dateStr}`,
    html,
    attachmentName: filename,
    attachmentContent: json,
  });

  return NextResponse.json({
    ok: true,
    type,
    poems: poems.length,
    ...(type === 'weekly' ? { vocab: (backup.vocab as unknown[]).length } : {}),
    filename,
  });
}
