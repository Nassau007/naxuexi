'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WordData, VocabStats } from '@/lib/types';

type ViewMode = 'list' | 'add' | 'import';
type CategoryCount = { category: string; count: number };

export default function VocabPage() {
  const [words, setWords] = useState<WordData[]>([]);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchWords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '30' });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('category', categoryFilter);

    const res = await fetch(`/api/vocab?${params}`);
    const data = await res.json();
    setWords(data.words);
    setStats(data.stats);
    setCategoryCounts(data.categoryCounts || []);
    setTotalPages(data.totalPages);
    setLoading(false);
  }, [page, search, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchWords();
  }, [fetchWords]);

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-ink-900">
            词汇 <span className="text-ink-400 font-body text-base font-normal">Vocabulary</span>
          </h2>
          {stats && (
            <p className="text-sm text-ink-500 mt-1">
              {stats.total} words — {stats.learned} learned, {stats.learning} learning, {stats.new} new
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('add')}
            className={viewMode === 'add' ? 'btn-primary' : 'btn-secondary'}
          >
            + Add
          </button>
          <button
            onClick={() => setViewMode('import')}
            className={viewMode === 'import' ? 'btn-primary' : 'btn-secondary'}
          >
            Import
          </button>
        </div>
      </div>

      {/* Add/Import panels */}
      {viewMode === 'add' && (
        <AddWordForm
          onClose={() => setViewMode('list')}
          onAdded={() => { setViewMode('list'); fetchWords(); }}
        />
      )}
      {viewMode === 'import' && (
        <ImportCSV
          onClose={() => setViewMode('list')}
          onImported={() => { setViewMode('list'); fetchWords(); }}
        />
      )}

      {/* Category breakdown (collapsible) */}
      <div className="mb-4">
        <button
          onClick={() => setShowBreakdown(s => !s)}
          className="btn-ghost text-sm text-ink-600 hover:text-ink-900"
        >
          {showBreakdown ? '▼' : '▶'} Category breakdown ({categoryCounts.length} categories)
        </button>
        {showBreakdown && categoryCounts.length > 0 && (
          <div className="card p-4 md:p-5 mt-2">
            <CategoryPieChart data={categoryCounts} />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search hanzi, pinyin, or meaning..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input w-auto"
        >
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="LEARNING">Learning</option>
          <option value="LEARNED">Learned</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="input w-auto"
        >
          <option value="">All categories</option>
          {categoryCounts.map(c => (
            <option key={c.category} value={c.category === 'Uncategorized' ? '' : c.category}>
              {c.category} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {/* Word List */}
      {loading ? (
        <div className="text-center py-12 text-ink-400">Loading...</div>
      ) : words.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="hanzi-display text-4xl text-ink-300 mb-3">空</p>
          <p className="text-ink-500">No words yet. Add your first word or import a CSV.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs text-ink-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Hanzi</th>
                  <th className="px-4 py-3">Pinyin</th>
                  <th className="px-4 py-3">Meaning</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reviews</th>
                  <th className="px-4 py-3 w-16 text-center">Focus</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {words.map((word) => (
                  <WordRow key={word.id} word={word} onUpdate={fetchWords} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {words.map((word) => (
              <WordCard key={word.id} word={word} onUpdate={fetchWords} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost"
              >
                ← Prev
              </button>
              <span className="px-3 py-1.5 text-sm text-ink-500">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-ghost"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Category Pie Chart ────────────────────────────────────────

function CategoryPieChart({ data }: { data: CategoryCount[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) return <p className="text-sm text-ink-500">No data yet.</p>;

  // Palette — cycles through ink/jade/vermillion/amber shades
  const palette = [
    '#c2410c', // vermillion-700
    '#059669', // jade-600
    '#d97706', // amber-600
    '#475569', // ink-600
    '#f97316', // orange
    '#10b981', // emerald
    '#f59e0b', // amber
    '#64748b', // slate
    '#ea580c', // orange-600
    '#14b8a6', // teal
    '#eab308', // yellow
    '#94a3b8', // slate-400
  ];

  const size = 180;
  const radius = size / 2;
  const cx = radius;
  const cy = radius;

  let cumulative = 0;
  const slices = data.map((d, i) => {
    const startAngle = (cumulative / total) * 2 * Math.PI;
    cumulative += d.count;
    const endAngle = (cumulative / total) * 2 * Math.PI;

    const x1 = cx + radius * Math.sin(startAngle);
    const y1 = cy - radius * Math.cos(startAngle);
    const x2 = cx + radius * Math.sin(endAngle);
    const y2 = cy - radius * Math.cos(endAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    // Edge case: single slice covering full circle
    const pathData = data.length === 1
      ? `M ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      path: pathData,
      color: palette[i % palette.length],
      label: d.category,
      count: d.count,
      pct: ((d.count / total) * 100).toFixed(1),
    };
  });

  return (
    <div className="flex flex-col md:flex-row items-start gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="white" strokeWidth={1} />
        ))}
      </svg>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-ink-700 truncate">{s.label}</span>
            <span className="text-ink-400 text-xs ml-auto whitespace-nowrap">
              {s.count} · {s.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Word Card (mobile) ────────────────────────────────────────

function WordCard({ word, onUpdate }: { word: WordData; onUpdate: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingFocus, setUpdatingFocus] = useState(false);
  const focusReview = (word as unknown as { focusReview?: boolean }).focusReview === true;

  const handleDelete = async () => {
    if (!confirm(`Delete "${word.hanzi}"?`)) return;
    setDeleting(true);
    await fetch(`/api/vocab/${word.id}`, { method: 'DELETE' });
    onUpdate();
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    await fetch(`/api/vocab/${word.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setUpdatingStatus(false);
    onUpdate();
  };

  const handleFocusToggle = async () => {
    setUpdatingFocus(true);
    await fetch(`/api/vocab/${word.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusReview: !focusReview }),
    });
    setUpdatingFocus(false);
    onUpdate();
  };

  const statusColors: Record<string, string> = {
    NEW: 'bg-ink-100 text-ink-600 border-ink-200',
    LEARNING: 'bg-amber-100 text-amber-700 border-amber-200',
    LEARNED: 'bg-jade-100 text-jade-700 border-jade-200',
  };

  return (
    <div className="card p-3 flex items-center gap-3">
      <span className="hanzi-display text-2xl w-10 text-center flex-shrink-0">{word.hanzi}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink-700">{word.pinyin}</span>
          <select
            value={word.status}
            disabled={updatingStatus}
            onChange={e => handleStatusChange(e.target.value)}
            className={`text-xs font-medium rounded-full px-2 py-0.5 border cursor-pointer
              focus:outline-none disabled:opacity-50 ${statusColors[word.status]}`}
          >
            <option value="NEW">new</option>
            <option value="LEARNING">learning</option>
            <option value="LEARNED">learned</option>
          </select>
        </div>
        <p className="text-sm text-ink-600 truncate">{word.meaning}</p>
        {word.category && <p className="text-xs text-ink-400">{word.category}</p>}
      </div>
      <button
        onClick={handleFocusToggle}
        disabled={updatingFocus}
        title={focusReview ? 'Unflag focus' : 'Flag as focus'}
        className={`text-lg leading-none flex-shrink-0 transition-opacity disabled:opacity-30 ${
          focusReview ? 'opacity-100' : 'opacity-25'
        }`}
      >
        🎯
      </button>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="btn-ghost text-xs text-ink-400 hover:text-vermillion-600 flex-shrink-0"
      >
        {deleting ? '...' : '✕'}
      </button>
    </div>
  );
}

function AddWordForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ hanzi: '', pinyin: '', meaning: '', category: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/vocab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setForm({ hanzi: '', pinyin: '', meaning: '', category: '' });
      onAdded();
    } else {
      const data = await res.json();
      setError(data.errorDetails?.[0]?.error || 'Failed to add word');
    }
    setSubmitting(false);
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-ink-800">Add New Word</h3>
        <button onClick={onClose} className="btn-ghost text-sm">✕ Close</button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="汉字"
          value={form.hanzi}
          onChange={(e) => setForm(f => ({ ...f, hanzi: e.target.value }))}
          className="input font-hanzi text-lg"
          required
        />
        <input
          type="text"
          placeholder="pīnyīn"
          value={form.pinyin}
          onChange={(e) => setForm(f => ({ ...f, pinyin: e.target.value }))}
          className="input"
          required
        />
        <input
          type="text"
          placeholder="Meaning"
          value={form.meaning}
          onChange={(e) => setForm(f => ({ ...f, meaning: e.target.value }))}
          className="input"
          required
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
            className="input"
          />
          <button type="submit" disabled={submitting} className="btn-primary whitespace-nowrap">
            {submitting ? '...' : 'Add'}
          </button>
        </div>
      </form>
      {error && <p className="text-sm text-vermillion-600 mt-2">{error}</p>}
    </div>
  );
}

// ─── CSV Import ────────────────────────────────────────────────

function ImportCSV({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: number } | null>(null);

  const handleImport = async () => {
    setSubmitting(true);
    setResult(null);

    const res = await fetch('/api/vocab/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    });

    const data = await res.json();
    setResult({ imported: data.imported, errors: data.errors });
    setSubmitting(false);

    if (data.imported > 0) {
      setTimeout(onImported, 1500);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(reader.result as string);
    reader.readAsText(file);
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-ink-800">Import CSV</h3>
        <button onClick={onClose} className="btn-ghost text-sm">✕ Close</button>
      </div>
      <p className="text-xs text-ink-500 mb-3">
        Format: <code className="bg-ink-100 px-1 rounded">hanzi,pinyin,meaning,category,hskLevel</code> — 
        header row optional
      </p>
      <div className="mb-3">
        <input
          type="file"
          accept=".csv,.txt"
          onChange={handleFileUpload}
          className="text-sm text-ink-600"
        />
      </div>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={'你好,nǐ hǎo,hello,greeting,1\n谢谢,xiè xie,thank you,greeting,1'}
        rows={6}
        className="input font-mono text-sm mb-3"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={handleImport}
          disabled={submitting || !csv.trim()}
          className="btn-primary"
        >
          {submitting ? 'Importing...' : 'Import'}
        </button>
        {result && (
          <span className="text-sm">
            <span className="text-jade-600">{result.imported} imported</span>
            {result.errors > 0 && (
              <span className="text-vermillion-600 ml-2">{result.errors} errors</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Word Row ──────────────────────────────────────────────────

function WordRow({ word, onUpdate }: { word: WordData; onUpdate: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingFocus, setUpdatingFocus] = useState(false);
  const focusReview = (word as unknown as { focusReview?: boolean }).focusReview === true;

  const handleDelete = async () => {
    if (!confirm(`Delete "${word.hanzi}"?`)) return;
    setDeleting(true);
    await fetch(`/api/vocab/${word.id}`, { method: 'DELETE' });
    onUpdate();
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    await fetch(`/api/vocab/${word.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setUpdatingStatus(false);
    onUpdate();
  };

  const handleFocusToggle = async () => {
    setUpdatingFocus(true);
    await fetch(`/api/vocab/${word.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusReview: !focusReview }),
    });
    setUpdatingFocus(false);
    onUpdate();
  };

  const statusColors: Record<string, string> = {
    NEW: 'bg-ink-100 text-ink-600 border-ink-200',
    LEARNING: 'bg-amber-100 text-amber-700 border-amber-200',
    LEARNED: 'bg-jade-100 text-jade-700 border-jade-200',
  };

  return (
    <tr className="border-b border-ink-50 hover:bg-ink-50/50 transition-colors">
      <td className="px-4 py-3">
        <span className="hanzi-display text-xl">{word.hanzi}</span>
      </td>
      <td className="px-4 py-3 text-sm text-ink-600">{word.pinyin}</td>
      <td className="px-4 py-3 text-sm">{word.meaning}</td>
      <td className="px-4 py-3 text-sm text-ink-500">{word.category || '—'}</td>
      <td className="px-4 py-3">
        <select
          value={word.status}
          disabled={updatingStatus}
          onChange={e => handleStatusChange(e.target.value)}
          className={`text-xs font-medium rounded-full px-2 py-0.5 border cursor-pointer
            focus:outline-none focus:ring-2 focus:ring-vermillion-500/30
            disabled:opacity-50 ${statusColors[word.status]}`}
        >
          <option value="NEW">new</option>
          <option value="LEARNING">learning</option>
          <option value="LEARNED">learned</option>
        </select>
      </td>
      <td className="px-4 py-3 text-sm text-ink-500">
        {word.reviewCount} ({word.correctCount}✓)
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={handleFocusToggle}
          disabled={updatingFocus}
          title={focusReview ? 'Unflag — stop prioritizing this word' : 'Flag — prioritize this word in daily focus hanzi'}
          className={`text-lg leading-none transition-opacity disabled:opacity-30 ${
            focusReview ? 'opacity-100' : 'opacity-25 hover:opacity-75'
          }`}
        >
          🎯
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="btn-ghost text-xs text-ink-400 hover:text-vermillion-600"
        >
          {deleting ? '...' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}
