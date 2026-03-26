import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

// POST /api/seed — Populate database from bundled CSV
export async function POST() {
  // Try multiple possible paths (dev vs production)
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'seed-vocabulary.csv'),
    path.join(process.cwd(), '..', 'public', 'seed-vocabulary.csv'),
    '/app/public/seed-vocabulary.csv',
  ];

  let csvText = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      csvText = fs.readFileSync(p, 'utf-8');
      break;
    }
  }

  if (!csvText) {
    return NextResponse.json({ error: 'seed-vocabulary.csv not found' }, { status: 404 });
  }

  const lines = csvText.trim().split('\n');
  let imported = 0;
  let skipped = 0;

  // Skip header: Pinyin,Characters,English,Category,Mastery,Source
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i].trim());
    const [pinyin, hanzi, meaning, category] = fields;

    if (!hanzi || !pinyin || !meaning) continue;

    try {
      await prisma.word.upsert({
        where: { hanzi: hanzi.trim() },
        update: {},
        create: {
          hanzi: hanzi.trim(),
          pinyin: pinyin.trim(),
          meaning: meaning.trim(),
          category: category?.trim() || null,
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  // Also ensure default settings exist
  await prisma.setting.upsert({
    where: { key: 'dailyHanziCount' },
    update: {},
    create: { key: 'dailyHanziCount', value: '15' },
  });

  await prisma.setting.upsert({
    where: { key: 'dailyHanziTime' },
    update: {},
    create: { key: 'dailyHanziTime', value: '08:00' },
  });

  const total = await prisma.word.count();

  return NextResponse.json({
    imported,
    skipped,
    totalInDb: total,
  });
}
