'use client';

import { useState, useEffect } from 'react';

interface Attempt {
  id: number;
  userAnswer: string;
  score: number;
  feedback: string;
  passed: boolean;
  createdAt: string;
  sentence: {
    direction: string;
    prompt: string;
    reference: string;
  };
}

interface Sentence {
  id: number;
  direction: string;
  prompt: string;
  reference: string;
  used: boolean;
  createdAt: string;
}

interface Stats {
  total: number;
  passed: number;
  avgScore: number;
  stockRemaining: number;
}

const DIRECTION_LABELS: Record<string, string> = {
  EN_TO_ZH: '🇬🇧 → 🇨🇳',
  FR_TO_ZH: '🇫🇷 → 🇨🇳',
  ZH_TO_EN: '🇨🇳 → 🇬🇧',
};

const DIRECTION_FILTER_LABELS: Record<string, string> = {
  '': 'All',
  EN_TO_ZH: '🇬🇧 → 🇨🇳',
  FR_TO_ZH: '🇫🇷 → 🇨🇳',
  ZH_TO_EN: '🇨🇳 → 🇬🇧',
};

type Tab = 'history' | 'bank';

export default function TranslatePage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('history');
  const [dirFilter, setDirFilter] = useState('');
  const [usedFilter, setUsedFilter] = useState<'all' | 'unused' | 'used'>('all');

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/translate');
      const data = await res.json();
      setAttempts(data.attempts || []);
      setSentences(data.sentences || []);
      setStats(data.stats || null);
      setLoading(false);
    }
    load();
  }, []);

  const filteredSentences = sentences.filter(s => {
    if (dirFilter && s.direction !== dirFilter) return false;
    if (usedFilter === 'unused' && s.used) return false;
    if (usedFilter === 'used' && !s.used) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-ink-900">
          译练 <span className="text-ink-400 font-body text-base font-normal">Translation</span>
        </h2>
        <p className="text-ink-500 mt-1 text-sm">Send /translate on Telegram to practice.</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="stat-card">
            <span className="stat-value text-ink-900">{stats.total}</span>
            <span className="stat-label">Attempted</span>
          </div>
          <div className="stat-card">
            <span className="stat-value text-jade-600">{stats.passed}</span>
            <span className="stat-label">Passed</span>
          </div>
          <div className="stat-card">
            <span className="stat-value text-vermillion-600">{Math.round(stats.avgScore * 100)}%</span>
            <span className="stat-label">Avg score</span>
          </div>
          <div className="stat-card">
            <span className="stat-value text-amber-600">{stats.stockRemaining}</span>
            <span className="stat-label">In stock</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-ink-100 p-1 rounded-lg w-fit">
        {(['history', 'bank'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {t === 'history' ? 'History' : `Sentence Bank (${sentences.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-ink-400">Loading...</div>
      ) : tab === 'history' ? (

        // ── History tab ──
        attempts.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="hanzi-display text-4xl text-ink-300 mb-3">译</p>
            <p className="text-ink-500 font-medium mb-1">No attempts yet</p>
            <p className="text-ink-400 text-sm">Send /translate on Telegram to start practicing.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((attempt) => (
              <div key={attempt.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-500">
                      {DIRECTION_LABELS[attempt.sentence.direction]}
                    </span>
                    <span className={`badge ${attempt.passed ? 'bg-jade-100 text-jade-700' : 'bg-vermillion-100 text-vermillion-700'}`}>
                      {Math.round(attempt.score * 100)}%
                    </span>
                  </div>
                  <span className="text-xs text-ink-400 flex-shrink-0">
                    {new Date(attempt.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <p className="text-sm text-ink-500 mb-1">
                  <span className="font-medium text-ink-700">Prompt:</span> {attempt.sentence.prompt}
                </p>
                <p className="text-sm mb-1">
                  <span className="font-medium text-ink-700">Your answer:</span>{' '}
                  <span className={attempt.passed ? 'text-jade-700' : 'text-vermillion-700'}>
                    {attempt.userAnswer}
                  </span>
                </p>
                {!attempt.passed && (
                  <p className="text-sm text-ink-500 mb-2">
                    <span className="font-medium text-ink-700">Reference:</span> {attempt.sentence.reference}
                  </p>
                )}
                {attempt.feedback && (
                  <p className="text-xs text-ink-500 italic mt-2 pt-2 border-t border-ink-100">
                    {attempt.feedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        )

      ) : (

        // ── Sentence bank tab ──
        <>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap mb-4">
            <select
              value={dirFilter}
              onChange={e => setDirFilter(e.target.value)}
              className="input w-auto text-sm"
            >
              {Object.entries(DIRECTION_FILTER_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <select
              value={usedFilter}
              onChange={e => setUsedFilter(e.target.value as 'all' | 'unused' | 'used')}
              className="input w-auto text-sm"
            >
              <option value="all">All</option>
              <option value="unused">Unused</option>
              <option value="used">Used</option>
            </select>
            <span className="text-sm text-ink-400 self-center">{filteredSentences.length} sentences</span>
          </div>

          {filteredSentences.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-ink-400 text-sm">No sentences match your filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSentences.map(s => (
                <div key={s.id} className="card p-3 flex items-start gap-3">
                  <div className="flex-shrink-0 text-center pt-0.5">
                    <span className="text-xs text-ink-400">{DIRECTION_LABELS[s.direction]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800">{s.prompt}</p>
                    <p className="text-sm text-ink-500 mt-0.5">{s.reference}</p>
                  </div>
                  <span className={`badge flex-shrink-0 mt-0.5 ${s.used ? 'bg-ink-100 text-ink-400' : 'bg-jade-100 text-jade-700'}`}>
                    {s.used ? 'used' : 'new'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
