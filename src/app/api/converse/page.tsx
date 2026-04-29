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

export default function ConversePage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/converse/sessions')
      .then(r => r.json())
      .then(data => {
        setSessions(data.sessions || []);
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
<div className="min-h-screen bg-ink-50 p-4 md:p-8 pb-24 md:pb-8 md:ml-64">
  <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-ink-900 mb-6">
          💬 Conversations
        </h1>

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
