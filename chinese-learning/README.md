# HanziFlow — Chinese Learning Hub

Personal Chinese learning platform with spaced repetition, daily hanzi practice, pronunciation training, and AI-powered sentence exercises.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your keys (Telegram bot token, Anthropic API key)

# Initialize database
npx prisma db push
npm run db:seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: SQLite via Prisma
- **Styling**: Tailwind CSS
- **Bot**: Telegram (grammy)
- **AI**: Claude API (sentence generation)

## Features

| Feature | Status |
|---------|--------|
| Vocabulary management (CRUD + CSV import) | ✅ Ready |
| Dashboard with stats | ✅ Ready |
| Spaced repetition (SM-2) | ✅ Algorithm ready |
| Flashcard review | 🔜 Next |
| Pronunciation (read/listen) | 🔜 Planned |
| Translation exercises | 🔜 Planned |
| Telegram daily hanzi bot | 🔜 Planned |

## API Routes

- `GET /api/vocab` — List words (filters: status, category, search)
- `POST /api/vocab` — Add word(s)
- `GET /api/vocab/:id` — Get word details + review history
- `PATCH /api/vocab/:id` — Update word
- `DELETE /api/vocab/:id` — Delete word
- `POST /api/vocab/import` — Import from CSV
