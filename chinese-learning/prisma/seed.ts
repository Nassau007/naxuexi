import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

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

async function seed() {
  console.log('🌱 Seeding database...');

  const csvPath = path.join(__dirname, '..', 'public', 'seed-vocabulary.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.log('No seed-vocabulary.csv found, skipping word import.');
  } else {
    const csv = fs.readFileSync(csvPath, 'utf-8');
    const lines = csv.trim().split('\n');

    // Skip header: Pinyin,Characters,English,Category,Mastery,Source
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCSVLine(lines[i].trim());
      const [pinyin, hanzi, meaning, category] = fields;

      if (!hanzi || !pinyin || !meaning) continue;

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
    }
  }

  // Default settings
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

  const count = await prisma.word.count();
  console.log(`✅ Done! ${count} words in database.`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
