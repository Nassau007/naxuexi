'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WordData, VocabStats } from '@/lib/types';

type ViewMode = 'list' | 'add' | 'import';

export default function VocabPage() {
  const [words, setWords] = useState<WordData[]>([]);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchWords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '30' });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);

    const res = await fetch(`/api/vocab?${params}`);
    const data = await res.json();
    setWords(data.words);
    setStats(data.stats);
    setTotalPages(data.totalPages);
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchWords();
  }, [fetchWords]);

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
            + Add Word
          </button>
          <button
            onClick={() => setViewMode('import')}
            className={viewMode === 'import' ? 'btn-primary' : 'btn-secondary'}
          >
            Import CSV
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

      {/* Filters */}
      <div className="flex gap-3 mb-4">
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
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs text-ink-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Hanzi</th>
                  <th className="px-4 py-3">Pinyin</th>
                  <th className="px-4 py-3">Meaning</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reviews</th>
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

// ─── Add Word Form ─────────────────────────────────────────────

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

  const handleDelete = async () => {
    if (!confirm(`Delete "${word.hanzi}"?`)) return;
    setDeleting(true);
    await fetch(`/api/vocab/${word.id}`, { method: 'DELETE' });
    onUpdate();
  };

  const statusBadge = {
    NEW: 'badge-new',
    LEARNING: 'badge-learning',
    LEARNED: 'badge-learned',
  }[word.status];

  return (
    <tr className="border-b border-ink-50 hover:bg-ink-50/50 transition-colors">
      <td className="px-4 py-3">
        <span className="hanzi-display text-xl">{word.hanzi}</span>
      </td>
      <td className="px-4 py-3 text-sm text-ink-600">{word.pinyin}</td>
      <td className="px-4 py-3 text-sm">{word.meaning}</td>
      <td className="px-4 py-3 text-sm text-ink-500">{word.category || '—'}</td>
      <td className="px-4 py-3">
        <span className={statusBadge}>{word.status.toLowerCase()}</span>
      </td>
      <td className="px-4 py-3 text-sm text-ink-500">
        {word.reviewCount} ({word.correctCount}✓)
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
