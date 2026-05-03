// src/app/converse/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface SessionListItem {
  id: string;
  topic: string;
  topicLabel: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  correctionCount: number;
  newWordCount: number;
}

interface Turn {
  role: 'user' | 'assistant';
  content_zh: string;
  content_pinyin?: string;
  content_en?: string;
  timestamp: string;
}

interface Correction {
  turn: number;
  mistake: string;
  correction: string;
  explanation: string;
}

interface NewWord {
  hanzi: string;
  pinyin: string;
  meaning: string;
  category?: string;
}

interface SessionDetail {
  id: string;
  topic: string;
  topicLabel: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  transcript: Turn[];
  corrections: Correction[];
  newWords: NewWord[];
}

interface PendingVocab {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  category: string | null;
  sourceSession: string;
  sourceTopic: string;
  createdAt: string;
}

export default function ConversePage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  // Pending vocab state
  const [pending, setPending] = useState<PendingVocab[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState
    Record<string, { pinyin: string; meaning: string; category: string }>
  >({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch('/api/converse/sessions').then(r => r.json()),
      fetch('/api/converse/pending').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
    ])
      .then(([sessData, pendData, catData]) => {
        setSessions(sessData.sessions || []);
        setPending(pendData.pending || []);
        setCategories(catData.categories || []);
        const seed: Record<string, { pinyin: string; meaning: string; category: string }> = {};
        (pendData.pending || []).forEach((p: PendingVocab) => {
          seed[p.id] = {
            pinyin: p.pinyin,
            meaning: p.meaning,
            category: p.category || '',
          };
        });
        setEditing(seed);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/converse/sessions/${selectedId}`)
      .then(r => r.json())
      .then(data => {
        setSelected(data);
        setLoadingDetail(false);
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          setTimeout(() => {
            detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }
      })
      .catch(() => setLoadingDetail(false));
  }, [selectedId]);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function setBusy(id: string, busy: boolean) {
    setBusyIds(prev => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function approveOne(p: PendingVocab) {
    const edit = editing[p.id] || { pinyin: p.pinyin, meaning: p.meaning, category: p.category || '' };
    if (!edit.category) {
      alert('Choisis une catégorie avant d\'approuver.');
      return;
    }
    setBusy(p.id, true);
    try {
      const res = await fetch('/api/converse/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: p.id,
          hanzi: p.hanzi,
          pinyin: edit.pinyin,
          meaning: edit.meaning,
          category: edit.category,
        }),
      });
      if (res.ok) {
        setPending(prev => prev.filter(x => x.id !== p.id));
      } else {
        alert("Erreur lors de l'ajout.");
      }
    } finally {
      setBusy(p.id, false);
    }
  }

  async function discardOne(p: PendingVocab) {
    if (!confirm(`Supprimer ${p.hanzi} sans l'ajouter ?`)) return;
    setBusy(p.id, true);
    try {
      const res = await fetch(`/api/converse/pending?id=${p.id}`, { method: 'DELETE' });
      if (res.ok) {
        setPending(prev => prev.filter(x => x.id !== p.id));
      }
    } finally {
      setBusy(p.id, false);
    }
  }

  async function approveAll() {
    // Verify all pending words have a category set
    const missing = pending.filter(p => {
      const edit = editing[p.id];
      return !edit || !edit.category;
    });
    if (missing.length > 0) {
      alert(`${missing.length} mot(s) n'ont pas de catégorie. Approuve-les un par un.`);
      return;
    }
    if (!confirm(`Approuver les ${pending.length} mots avec leurs valeurs actuelles ?`)) return;
    for (const p of pending) {
      await approveOne(p);
    }
  }

  async function deleteSession(id: string) {
    if (!confirm('Supprimer cette session ?')) return;
    const res = await fetch(`/api/converse/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setSessions(s => s.filter(x => x.id !== id));
      if (selectedId === id) setSelectedId(null);
    } else if (res.status === 409) {
      alert('Impossible de supprimer une session active. Termine-la avec /endconverse.');
    } else {
      alert('Erreur de suppression.');
    }
  }

  return (
    <div className="min-h-screen bg-ink-50 p-4 md:p-8 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-ink-900 mb-6">
          💬 Conversations
        </h1>

        {/* Pending Review section */}
        {pending.length > 0 && (
          <div className="mb-8 bg-white rounded-lg border border-amber-300 p-4 md:p-6">
            <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-ink-900">
                  📖 Pending Review ({pending.length})
                </h2>
                <p className="text-xs text-ink-500 mt-1">
                  New words from /converse. Edit if needed, then approve or discard.
                </p>
              </div>
              <button
                onClick={approveAll}
                disabled={busyIds.size > 0}
                className="px-3 py-1.5 text-sm bg-jade-500 text-white rounded-md hover:bg-jade-600 disabled:opacity-50"
              >
                Approve all
              </button>
            </div>

            <div className="space-y-3">
              {pending.map(p => {
                const edit = editing[p.id] || {
                  pinyin: p.pinyin,
                  meaning: p.meaning,
                  category: p.category || '',
                };
                const isBusy = busyIds.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="border border-ink-200 rounded-lg p-3 bg-ink-50"
                  >
                    {/* Mobile: vertical stack. Desktop (md+): horizontal layout. */}
                    <div className="flex flex-col md:flex-row md:items-start md:gap-3">
                      {/* Hanzi block */}
                      <div className="md:flex-shrink-0 md:min-w-[80px] mb-3 md:mb-0">
                        <div className="text-3xl md:text-2xl font-bold text-ink-900">{p.hanzi}</div>
                        <div className="text-[10px] text-ink-400 mt-1">
                          {p.sourceTopic}
                        </div>
                      </div>

                      {/* Inputs */}
                      <div className="flex-1 min-w-0 space-y-2 mb-3 md:mb-0">
                        <div>
                          <label className="text-[10px] text-ink-500 uppercase tracking-wide">
                            Pinyin
                          </label>
                          <input
                            type="text"
                            value={edit.pinyin}
                            onChange={e =>
                              setEditing(prev => ({
                                ...prev,
                                [p.id]: { ...edit, pinyin: e.target.value },
                              }))
                            }
                            disabled={isBusy}
                            className="w-full text-sm px-2 py-1.5 border border-ink-200 rounded bg-white focus:border-vermillion-400 focus:outline-none disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-ink-500 uppercase tracking-wide">
                            Meaning
                          </label>
                          <input
                            type="text"
                            value={edit.meaning}
                            onChange={e =>
                              setEditing(prev => ({
                                ...prev,
                                [p.id]: { ...edit, meaning: e.target.value },
                              }))
                            }
                            disabled={isBusy}
                            className="w-full text-sm px-2 py-1.5 border border-ink-200 rounded bg-white focus:border-vermillion-400 focus:outline-none disabled:opacity-50"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-ink-500 uppercase tracking-wide">
                            Category
                          </label>
                          <select
                            value={edit.category}
                            onChange={e =>
                              setEditing(prev => ({
                                ...prev,
                                [p.id]: { ...edit, category: e.target.value },
                              }))
                            }
                            disabled={isBusy}
                            className="w-full text-sm px-2 py-1.5 border border-ink-200 rounded bg-white focus:border-vermillion-400 focus:outline-none disabled:opacity-50"
                          >
                            <option value="">— Choose category —</option>
                            {categories.map(cat => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            {/* If Claude's suggestion isn't in the list (rare hallucination), still show it */}
                            {edit.category && !categories.includes(edit.category) && (
                              <option value={edit.category}>
                                {edit.category} (new)
                              </option>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Buttons: side-by-side on mobile, stacked on desktop */}
                      <div className="flex flex-row md:flex-col gap-2 md:flex-shrink-0">
                        <button
                          onClick={() => approveOne(p)}
                          disabled={isBusy}
                          className="flex-1 md:flex-none px-3 py-2 md:py-1 text-xs bg-jade-500 text-white rounded-md hover:bg-jade-600 disabled:opacity-50"
                        >
                          ✅ Approve
                        </button>
                        <button
                          onClick={() => discardOne(p)}
                          disabled={isBusy}
                          className="flex-1 md:flex-none px-3 py-2 md:py-1 text-xs bg-vermillion-500 text-white rounded-md hover:bg-vermillion-600 disabled:opacity-50"
                        >
                          ❌ Discard
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-ink-600">Chargement...</p>
        ) : sessions.length === 0 ? (
          <div className="bg-white rounded-lg p-8 text-center">
            <p className="text-ink-600 mb-2">Aucune conversation pour le moment.</p>
            <p className="text-sm text-ink-500">
              Send <code className="bg-ink-100 px-1 rounded">/converse</code> on Telegram to start one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Session list */}
            <div className="md:col-span-1 space-y-2">
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedId === s.id
                      ? 'bg-vermillion-50 border-vermillion-400'
                      : 'bg-white border-ink-200 hover:border-ink-400'
                  }`}
                >
                  <div className="font-medium text-ink-900 text-sm">{s.topicLabel}</div>
                  <div className="text-xs text-ink-500 mt-1">{formatDate(s.startedAt)}</div>
                  <div className="flex gap-3 mt-2 text-xs text-ink-600">
                    <span>💬 {s.turnCount}</span>
                    {s.correctionCount > 0 && <span>💡 {s.correctionCount}</span>}
                    {s.newWordCount > 0 && <span>📖 {s.newWordCount}</span>}
                    {!s.endedAt && (
                      <span className="text-vermillion-600 font-medium">● en cours</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Session detail */}
            <div ref={detailRef} className="md:col-span-2">
              {!selectedId ? (
                <div className="hidden md:block bg-white rounded-lg p-8 text-center text-ink-500">
                  Sélectionne une conversation pour voir le détail.
                </div>
              ) : loadingDetail ? (
                <div className="bg-white rounded-lg p-8 text-center text-ink-500">
                  Chargement...
                </div>
              ) : selected ? (
                <div className="bg-white rounded-lg p-4 md:p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-ink-900">{selected.topicLabel}</h2>
                      <p className="text-xs text-ink-500 mt-1">
                        {formatDate(selected.startedAt)}
                        {selected.endedAt && ` → ${formatDate(selected.endedAt)}`}
                      </p>
                    </div>
                    {selected.endedAt && (
                      <button
                        onClick={() => deleteSession(selected.id)}
                        className="text-xs text-ink-500 hover:text-vermillion-600"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 mb-6">
                    <h3 className="text-sm font-semibold text-ink-700 uppercase tracking-wide">
                      Transcript
                    </h3>
                    {selected.transcript.map((turn, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-lg ${
                          turn.role === 'user'
                            ? 'bg-jade-50 border-l-4 border-jade-500 ml-4 md:ml-8'
                            : 'bg-ink-50 border-l-4 border-ink-400 mr-4 md:mr-8'
                        }`}
                      >
                        <div className="text-xs text-ink-500 mb-1 uppercase">
                          {turn.role === 'user' ? 'Toi' : 'Bot'}
                        </div>
                        <div className="text-ink-900 break-words">{turn.content_zh}</div>
                        {turn.content_pinyin && (
                          <div className="text-sm text-ink-600 italic mt-1 break-words">
                            {turn.content_pinyin}
                          </div>
                        )}
                        {turn.content_en && (
                          <div className="text-xs text-ink-500 mt-1 break-words">
                            🇬🇧 {turn.content_en}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {selected.corrections.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-sm font-semibold text-ink-700 uppercase tracking-wide mb-2">
                        Corrections ({selected.corrections.length})
                      </h3>
                      <div className="space-y-2">
                        {selected.corrections.map((c, i) => (
                          <div key={i} className="bg-vermillion-50 border border-vermillion-200 rounded-lg p-3">
                            <div className="text-sm break-words">
                              <span className="line-through text-ink-500">{c.mistake}</span>
                              {' → '}
                              <span className="font-medium text-ink-900">{c.correction}</span>
                            </div>
                            <div className="text-xs text-ink-600 mt-1 italic">{c.explanation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selected.newWords.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-ink-700 uppercase tracking-wide mb-2">
                        Nouveaux mots ({selected.newWords.length})
                      </h3>
                      <div className="space-y-1">
                        {selected.newWords.map((w, i) => (
                          <div key={i} className="bg-jade-50 border border-jade-200 rounded-lg p-2 text-sm">
                            <span className="font-bold text-ink-900">{w.hanzi}</span>
                            <span className="text-ink-600 ml-2">({w.pinyin})</span>
                            <span className="text-ink-700 ml-2">— {w.meaning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
