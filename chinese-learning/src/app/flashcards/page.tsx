'use client';

import { useState, useEffect, useCallback } from 'react';

type Card = {
  wordId: number;
  direction: string;
  prompt: string;
  promptLabel: string;
  answer: string;
  hint: string;
  status: string;
};

type SessionStats = {
  correct: number;
  wrong: number;
  partial: number;
  total: number;
};

export default function FlashcardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalDue, setTotalDue] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ correct: 0, wrong: 0, partial: 0, total: 0 });
  const [submitting, setSubmitting] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/flashcards?limit=20');
    const data = await res.json();
    setCards(data.cards);
    setTotalDue(data.totalDue);
    setCurrentIndex(0);
    setFlipped(false);
    setShowHint(false);
    setSessionDone(false);
    setStats({ correct: 0, wrong: 0, partial: 0, total: 0 });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const currentCard = cards[currentIndex];

  const handleGrade = useCallback(async (result: 'CORRECT' | 'PARTIAL' | 'WRONG') => {
    if (!currentCard || submitting) return;
    setSubmitting(true);

    await fetch('/api/flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wordId: currentCard.wordId,
        result,
        module: 'FLASHCARD',
      }),
    });

    setStats(prev => ({
      correct: prev.correct + (result === 'CORRECT' ? 1 : 0),
      wrong: prev.wrong + (result === 'WRONG' ? 1 : 0),
      partial: prev.partial + (result === 'PARTIAL' ? 1 : 0),
      total: prev.total + 1,
    }));

    if (currentIndex + 1 < cards.length) {
      setCurrentIndex(prev => prev + 1);
      setFlipped(false);
      setShowHint(false);
    } else {
      setSessionDone(true);
    }
    setSubmitting(false);
  }, [currentCard, submitting, currentIndex, cards.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sessionDone || loading || !currentCard) return;

      if (!flipped) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setFlipped(true);
        }
        if (e.key === 'h') setShowHint(true);
      } else {
        if (e.key === '1') handleGrade('WRONG');
        if (e.key === '2') handleGrade('PARTIAL');
        if (e.key === '3') handleGrade('CORRECT');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, sessionDone, loading, currentCard, handleGrade]);

  const directionLabels: Record<string, string> = {
    hanzi_to_meaning: '字 → EN',
    meaning_to_hanzi: 'EN → 字',
    hanzi_to_pinyin: '字 → PY',
    meaning_to_pinyin: 'EN → PY',
    pinyin_to_meaning: 'PY → EN',
  };

  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <p className="text-ink-400 mt-20">Loading cards...</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="mt-20">
          <p className="hanzi-display text-5xl text-ink-300 mb-4">空</p>
          <h2 className="text-xl font-display font-bold text-ink-800 mb-2">No cards to review</h2>
          <p className="text-ink-500 mb-6">Add vocabulary first, then come back to practice.</p>
          <a href="/vocab" className="btn-primary">Go to Vocabulary</a>
        </div>
      </div>
    );
  }

  if (sessionDone) {
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="mt-16">
          <p className="text-5xl mb-4">
            {accuracy >= 80 ? '🎉' : accuracy >= 50 ? '💪' : '📚'}
          </p>
          <h2 className="text-2xl font-display font-bold text-ink-900 mb-2">Session Complete</h2>
          <p className="text-ink-500 mb-6">{stats.total} cards reviewed · {accuracy}% correct</p>

          <div className="flex justify-center gap-6 mb-8">
            <div className="text-center">
              <span className="text-2xl font-bold text-jade-600">{stats.correct}</span>
              <p className="text-xs text-ink-500">Correct</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-amber-600">{stats.partial}</span>
              <p className="text-xs text-ink-500">Partial</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-vermillion-600">{stats.wrong}</span>
              <p className="text-xs text-ink-500">Wrong</p>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <button onClick={fetchCards} className="btn-primary">
              {totalDue > stats.total ? `Continue (${totalDue - stats.total} more)` : 'Review Again'}
            </button>
            <a href="/" className="btn-secondary">Dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-display font-bold text-ink-900">
          卡片 <span className="text-ink-400 font-body text-base font-normal">Flashcards</span>
        </h2>
        <div className="flex items-center gap-4 text-sm text-ink-500">
          <span>{currentIndex + 1} / {cards.length}</span>
          <span className="text-ink-300">·</span>
          <span>{totalDue} due</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-ink-100 rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-vermillion-500 rounded-full transition-all duration-300"
          style={{ width: `${(currentIndex / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div
        onClick={() => !flipped && setFlipped(true)}
        className={`card p-8 min-h-[320px] flex flex-col items-center justify-center
          cursor-pointer select-none transition-all duration-200
          ${!flipped ? 'hover:shadow-md' : ''}`}
      >
        {/* Direction badge */}
        <span className="badge bg-ink-100 text-ink-500 mb-4">
          {directionLabels[currentCard.direction] || currentCard.direction}
        </span>

        {/* Status badge */}
        <span className={`badge mb-4 ${
          currentCard.status === 'NEW' ? 'badge-new' :
          currentCard.status === 'LEARNING' ? 'badge-learning' : 'badge-learned'
        }`}>
          {currentCard.status.toLowerCase()}
        </span>

        {/* Prompt */}
        <div className="text-center mb-6">
          <p className={
            currentCard.direction.startsWith('hanzi') ? 'hanzi-large' :
            currentCard.direction === 'pinyin_to_meaning' ? 'text-3xl text-ink-700' :
            'text-2xl text-ink-800 font-medium'
          }>
            {currentCard.prompt}
          </p>
          <p className="text-sm text-ink-400 mt-3">{currentCard.promptLabel}</p>
        </div>

        {/* Hint */}
        {!flipped && (
          <div className="mt-2">
            {showHint ? (
              <p className="text-sm text-ink-400 italic">{currentCard.hint}</p>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setShowHint(true); }}
                className="text-xs text-ink-400 hover:text-ink-600 underline"
              >
                Show hint (H)
              </button>
            )}
          </div>
        )}

        {/* Answer */}
        {flipped && (
          <div className="mt-4 pt-4 border-t border-ink-100 w-full text-center">
            <p className={
              currentCard.direction.endsWith('hanzi') ? 'hanzi-medium text-ink-900' :
              currentCard.direction.endsWith('pinyin') ? 'text-2xl text-ink-700' :
              'text-xl text-ink-800 font-medium'
            }>
              {currentCard.answer}
            </p>
            <p className="text-sm text-ink-400 mt-2">{currentCard.hint}</p>
          </div>
        )}

        {!flipped && (
          <p className="text-xs text-ink-300 mt-6">Tap or press Space to reveal</p>
        )}
      </div>

      {/* Grading buttons */}
      {flipped && (
        <div className="flex gap-3 mt-6 justify-center">
          <button
            onClick={() => handleGrade('WRONG')}
            disabled={submitting}
            className="flex-1 max-w-[140px] py-3 px-4 rounded-lg font-medium text-sm
              bg-vermillion-50 text-vermillion-700 border border-vermillion-200
              hover:bg-vermillion-100 transition-all active:scale-[0.98]"
          >
            <span className="block text-lg mb-0.5">✗</span>
            Wrong (1)
          </button>
          <button
            onClick={() => handleGrade('PARTIAL')}
            disabled={submitting}
            className="flex-1 max-w-[140px] py-3 px-4 rounded-lg font-medium text-sm
              bg-amber-50 text-amber-700 border border-amber-200
              hover:bg-amber-100 transition-all active:scale-[0.98]"
          >
            <span className="block text-lg mb-0.5">~</span>
            Partial (2)
          </button>
          <button
            onClick={() => handleGrade('CORRECT')}
            disabled={submitting}
            className="flex-1 max-w-[140px] py-3 px-4 rounded-lg font-medium text-sm
              bg-jade-50 text-jade-700 border border-jade-200
              hover:bg-jade-100 transition-all active:scale-[0.98]"
          >
            <span className="block text-lg mb-0.5">✓</span>
            Correct (3)
          </button>
        </div>
      )}

      {/* Shortcuts */}
      <div className="mt-8 text-center text-xs text-ink-300">
        Space: flip · 1: wrong · 2: partial · 3: correct · H: hint
      </div>
    </div>
  );
}
