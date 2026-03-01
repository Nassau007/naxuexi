import { prisma } from '@/lib/prisma';
import { autoSeedIfEmpty } from '@/lib/seed';

export const dynamic = 'force-dynamic';

async function getStats() {
  const [total, statusCounts, dueForReview, recentReviews] = await Promise.all([
    prisma.word.count(),
    prisma.word.groupBy({ by: ['status'], _count: true }),
    prisma.word.count({
      where: { nextReview: { lte: new Date() }, status: { not: "NEW" } },
    }),
    prisma.reviewLog.count({
      where: {
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    total,
    new: statusCounts.find(s => s.status === 'NEW')?._count || 0,
    learning: statusCounts.find(s => s.status === 'LEARNING')?._count || 0,
    learned: statusCounts.find(s => s.status === 'LEARNED')?._count || 0,
    dueForReview,
    reviewsToday: recentReviews,
  };
}

export default async function Dashboard() {
  await autoSeedIfEmpty();
  const stats = await getStats();

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-display font-bold text-ink-900">
          你好 <span className="text-ink-400 font-body text-lg font-normal">nǐ hǎo</span>
        </h2>
        <p className="text-ink-500 mt-1">Here&apos;s where your Chinese stands today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="stat-card">
          <span className="stat-value text-ink-900">{stats.total}</span>
          <span className="stat-label">Total words</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-jade-600">{stats.learned}</span>
          <span className="stat-label">Learned</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-amber-600">{stats.learning}</span>
          <span className="stat-label">Learning</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-vermillion-600">{stats.dueForReview}</span>
          <span className="stat-label">Due for review</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <a href="/flashcards" className="card-hover p-5 group">
          <div className="flex items-center gap-3 mb-2">
            <span className="hanzi-display text-2xl text-vermillion-500">卡</span>
            <h3 className="font-semibold text-ink-800">Flashcards</h3>
          </div>
          <p className="text-sm text-ink-500">
            {stats.dueForReview > 0
              ? `${stats.dueForReview} cards due for review`
              : 'All caught up!'}
          </p>
        </a>

        <a href="/pronunciation" className="card-hover p-5 group">
          <div className="flex items-center gap-3 mb-2">
            <span className="hanzi-display text-2xl text-jade-500">音</span>
            <h3 className="font-semibold text-ink-800">Pronunciation</h3>
          </div>
          <p className="text-sm text-ink-500">Practice reading &amp; listening</p>
        </a>

        <a href="/translate" className="card-hover p-5 group">
          <div className="flex items-center gap-3 mb-2">
            <span className="hanzi-display text-2xl text-amber-500">译</span>
            <h3 className="font-semibold text-ink-800">Translate</h3>
          </div>
          <p className="text-sm text-ink-500">Sentence practice with learned words</p>
        </a>
      </div>

      {/* Today's activity */}
      <div className="card p-5 mb-4">
        <h3 className="font-semibold text-ink-800 mb-3">Today</h3>
        <div className="flex items-center gap-6 text-sm text-ink-500">
          <span>{stats.reviewsToday} reviews completed</span>
          <span>{stats.new} new words waiting</span>
        </div>
      </div>

      {/* Daily Hanzi */}
      <DailyHanziCard />
    </div>
  );
}

function DailyHanziCard() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink-800 mb-1">Daily Hanzi Practice</h3>
          <p className="text-sm text-ink-500">Send 15 characters to practice via Telegram</p>
        </div>
        <SendDailyButton />
      </div>
    </div>
  );
}

function SendDailyButton() {
  // This is a server component wrapper, the actual button needs to be client
  return <SendButton />;
}
