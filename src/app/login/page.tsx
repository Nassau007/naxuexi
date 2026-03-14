'use client';

// src/app/login/page.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
    } else {
      setError('Mot de passe incorrect.');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">拿学习</h1>
          <p className="text-gray-400 text-sm">NaXueXi</p>
        </div>

        <div className="p-6 rounded-xl border border-ink-700 bg-ink-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full p-3 rounded-lg bg-ink-700 text-white border border-ink-600 focus:outline-none focus:border-jade-500"
            />

            {error && (
              <p className="text-vermillion-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-jade-500 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Entrer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
