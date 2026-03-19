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

  async function handleToggleActive(id: number, currentlyActive: boolean) {
    await fetch(`/api/poems/${id}`, { method: 'PATCH' });
    setMessage(currentlyActive ? 'Poème désactivé.' : 'Poème activé.');
    fetchPoems();
  }

  async function handleDelete(id: number) {
    if (!confirm('Supprimer ce poème ?')) return;
    await fetch(`/api/poems/${id}`, { method: 'DELETE' });
    setMessage('Poème supprimé.');
    fetchPoems();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-900 p-6 text-white flex items-center justify-center">
        Chargement...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-900 p-6 text-white max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📜 Poèmes</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-ink-700 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
        >
          {showForm ? 'Annuler' : '+ Ajouter'}
        </button>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-jade-500/20 text-jade-300 rounded-lg text-sm">
          {message}
        </div>
      )}

      {showForm && (
        <div className="mb-6 p-5 rounded-xl border border-ink-700 bg-ink-800 space-y-4">
          <input
            type="text"
            placeholder="Titre"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full p-3 rounded-lg bg-ink-700 text-white border border-ink-600 focus:outline-none focus:border-jade-500"
          />
          <input
            type="text"
            placeholder="Auteur"
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
            className="w-full p-3 rounded-lg bg-ink-700 text-white border border-ink-600 focus:outline-none focus:border-jade-500"
          />
          <textarea
            placeholder="Texte du poème (un vers par ligne)"
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            rows={10}
            className="w-full p-3 rounded-lg bg-ink-700 text-white border border-ink-600 focus:outline-none focus:border-jade-500"
          />
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-ink-700 text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      )}

      {poems.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="text-4xl mb-2">📜</p>
          <p>Aucun poème pour le moment. Ajoute-en un !</p>
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
                className={`p-5 rounded-xl border ${isActive ? 'border-jade-500 bg-jade-500/5' : 'border-ink-700 bg-ink-800'} shadow-sm`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{poem.title}</h3>
                      {isActive && (
                        <span className="text-xs bg-jade-500 text-white px-2 py-0.5 rounded-full">Actif</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{poem.author}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {lines.length} vers · {totalChunks} chunks de 5
                      {progress && ` · Chunk ${currentChunk}/${totalChunks}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(poem.id, isActive)}
                      className={`text-xs px-3 py-1.5 rounded-lg hover:opacity-90 ${
                        isActive
                          ? 'bg-gray-600 text-gray-200'
                          : 'bg-jade-500 text-white'
                      }`}
                    >
                      {isActive ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      onClick={() => handleDelete(poem.id)}
                      className="text-xs text-red-400 hover:text-red-300 px-2 py-1.5"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>

                {/* Preview first 3 lines */}
                <div className="mt-3 pl-3 border-l-2 border-ink-700 text-sm text-gray-400 italic space-y-0.5">
                  {lines.slice(0, 3).map((line: string, i: number) => (
                    <p key={i}>{line}</p>
                  ))}
                  {lines.length > 3 && <p className="text-gray-500">…</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
