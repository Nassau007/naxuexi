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

export async function autoSeedIfEmpty() {
  const count = await prisma.word.count();
  if (count > 0) return;

  const possiblePaths = [
    path.join(process.cwd(), 'public', 'seed-vocabulary.csv'),
    '/app/public/seed-vocabulary.csv',
  ];

  let csvText = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      csvText = fs.readFileSync(p, 'utf-8');
      break;
    }
  }
  if (!csvText) return;

  const lines = csvText.trim().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i].trim());
    const [pinyin, hanzi, meaning, category] = fields;
    if (!hanzi || !pinyin || !meaning) continue;
    try {
      await prisma.word.create({
        data: {
          hanzi: hanzi.trim(),
          pinyin: pinyin.trim(),
          meaning: meaning.trim(),
          category: category?.trim() || null,
        },
      });
    } catch {
      // Skip duplicates
    }
  }
}
