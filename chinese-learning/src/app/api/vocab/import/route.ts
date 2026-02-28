import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/vocab/import — Import words from CSV text
// Expected CSV format: hanzi,pinyin,meaning,category,hskLevel
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';

  let csvText: string;

  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    csvText = await request.text();
  } else {
    const body = await request.json();
    csvText = body.csv;
  }

  if (!csvText) {
    return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
  }

  const lines = csvText.trim().split('\n');
  const results = [];
  const errors = [];

  // Detect if first line is a header
  const firstLine = lines[0].toLowerCase();
  const startIndex = firstLine.includes('hanzi') || firstLine.includes('pinyin') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle quoted fields
    const fields = parseCSVLine(line);
    const [hanzi, pinyin, meaning, category, hskLevel] = fields;

    if (!hanzi || !pinyin || !meaning) {
      errors.push({ line: i + 1, raw: line, error: 'Missing required fields' });
      continue;
    }

    try {
      const created = await prisma.word.create({
        data: {
          hanzi: hanzi.trim(),
          pinyin: pinyin.trim(),
          meaning: meaning.trim(),
          category: category?.trim() || null,
          hskLevel: hskLevel ? parseInt(hskLevel) : null,
        },
      });
      results.push(created);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('Unique constraint')) {
        errors.push({ line: i + 1, word: hanzi, error: 'Already exists' });
      } else {
        errors.push({ line: i + 1, word: hanzi, error: message });
      }
    }
  }

  return NextResponse.json({
    imported: results.length,
    errors: errors.length,
    total: lines.length - startIndex,
    ...(errors.length > 0 && { errorDetails: errors }),
  }, { status: results.length > 0 ? 201 : 400 });
}

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
