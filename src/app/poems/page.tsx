'use client';

// src/app/poems/page.tsx

import { useState, useEffect } from 'react';

interface PoemProgress {
  chunkIndex: number;
  chunkSize: number;
  active: boolean;
}

interface Poem {
  id: number;
  title: string;
  author: string;
  lines: string; // JSON
  createdAt: string;
  progress: PoemProgress | null;
}

export default function PoemsPage() {
  const [poems, setPoems] = useState<Poem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', author: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function fetchPoems() {
    const res = await fetch('/api/poems');
    const data = await res.json();
    setPoems(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchPoems();
  }, []);

  async function handleSubmit() {
    if (!form.title || !form.author || !form.text) {
      setMessage('Tous les champs sont requis.');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/poems', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ title: '', author: '', text: '' });
      setShowForm(false);
      setMessage('Poème ajouté !');
      fetchPoems();
    } else {
      const err = await res.json();
      setMessage(err.error || 'Erreur.');
    }
    setSaving(false);
  }

  async function handleSetActive(id: number) {
    await fetch(`/api/poems/${id}`, { method: 'PATCH' });
    setMessage('Poème activé.');
    fetchPoems();
  }

  async function handleDelete(id: number) {
    if (!confirm('Supprimer ce poème ?')) return;
    await fetch(`/api/poems/${id}`, { method: 'DELETE' });
    setMessage('Poème supprimé.');
    fetchPoems();
  }

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">📜 Poèmes</h1>
          <p className="text-gray-500 mt-1">Mémorise un poème, 5 lignes par jour.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-ink-900 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
        >
          + Ajouter
        </button>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-jade-50 border border-jade-200 rounded-lg text-jade-600 text-sm">
          {message}
          <button className="ml-2 text-gray-400 hover:text-gray-600" onClick={() => setMessage('')}>✕</button>
        </div>
      )}

      {showForm && (
        <div className="mb-8 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-ink-900 mb-4">Nouveau poème</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vermillion/50"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="L'Albatros"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Auteur</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vermillion/50"
                value={form.author}
                onChange={e => setForm({ ...form, author: e.target.value })}
                placeholder="Charles Baudelaire"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Texte <span className="text-gray-400">(une ligne par vers)</span>
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-vermillion/50"
                rows={10}
                value={form.text}
                onChange={e => setForm({ ...form, text: e.target.value })}
                placeholder={"Souvent, pour s'amuser, les hommes d'équipage\nPrennent des albatros, vastes oiseaux des mers..."}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="bg-ink-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-500 px-4 py-2 rounded-lg text-sm hover:bg-gray-100"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : poems.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📜</div>
          <p>Aucun poème. Ajoute-en un !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {poems.map(poem => {
            const lines: string[] = JSON.parse(poem.lines);
            const progress = poem.progress;
            const totalChunks = progress ? Math.ceil(lines.length / progress.chunkSize) : 0;
            const currentChunk = progress ? progress.chunkIndex + 1 : 0;
            const isActive = progress?.active ?? false;

            return (
              <div
                key={poem.id}
                className={`p-5 rounded-xl border ${isActive ? 'border-jade-500 bg-jade-50' : 'border-gray-200 bg-white'} shadow-sm`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-ink-900">{poem.title}</h3>
                      {isActive && (
                        <span className="text-xs bg-jade-500 text-white px-2 py-0.5 rounded-full">Actif</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{poem.author}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {lines.length} vers · {totalChunks} chunks de 5
                      {progress && ` · Chunk ${currentChunk}/${totalChunks}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!isActive && (
                      <button
                        onClick={() => handleSetActive(poem.id)}
                        className="text-xs bg-jade-500 text-white px-3 py-1.5 rounded-lg hover:opacity-90"
                      >
                        Activer
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(poem.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                {/* Preview first 3 lines */}
                <div className="mt-3 pl-3 border-l-2 border-gray-200 text-sm text-gray-600 italic space-y-0.5">
                  {lines.slice(0, 3).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  {lines.length > 3 && <p className="text-gray-400">…</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
