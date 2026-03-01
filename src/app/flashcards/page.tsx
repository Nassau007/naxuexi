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

type Direction = {
  key: string;
  label: string;
  description: string;
  icon: string;
};

const DIRECTIONS: Direction[] = [
  { key: 'hanzi_to_meaning', label: '字 → EN', description: 'See hanzi, guess meaning', icon: '字' },
  { key: 'meaning_to_hanzi', label: 'EN → 字', description: 'See meaning, recall hanzi', icon: 'A' },
  { key: 'hanzi_to_pinyin', label: '字 → PY', description: 'See hanzi, guess pinyin', icon: '拼' },
  { key: 'meaning_to_pinyin', label: 'EN → PY', description: 'See meaning, guess pinyin', icon: '音' },
  { key: 'pinyin_to_meaning', label: 'PY → EN', description: 'See pinyin, guess meaning', icon: 'P' },
];

type Phase = 'setup' | 'session' | 'done';

export default function FlashcardsPage() {
  // Setup state
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedModes, setSelectedModes] = useState<string[]>(['hanzi_to_meaning']);
  const [cardCount, setCardCount] = useState(20);

  // Session state
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [totalDue, setTotalDue] = useState(0);
  const [stats, setStats] = useState<SessionStats>({ correct: 0, wrong: 0, partial: 0, total: 0 });
  const [submitting, setSubmitting] = useState(false);

  const toggleMode = (key: string) => {
    setSelectedModes(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // Must keep at least one
        return prev.filter(m => m !== key);
      }
      return [...prev, key];
    });
  };

  const selectAllModes = () => {
    setSelectedModes(DIRECTIONS.map(d => d.key));
  };

  const startSession = async () => {
    setLoading(true);
    const mode = selectedModes.join(',');
    const res = await fetch(`/api/flashcards?limit=${cardCount}&mode=${mode}`);
    const data = await res.json();
    setCards(data.cards);
    setTotalDue(data.totalDue);
    setCurrentIndex(0);
    setFlipped(false);
    setShowHint(false);
    setStats({ correct: 0, wrong: 0, partial: 0, total: 0 });
    setLoading(false);
    setPhase(data.cards.length > 0 ? 'session' : 'setup');
  };

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
      setPhase('done');
    }
    setSubmitting(false);
  }, [currentCard, submitting, currentIndex, cards.length]);

  useEffect(() => {
    if (phase !== 'session') return;
    const onKey = (e: KeyboardEvent) => {
      if (!currentCard) return;
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
  }, [phase, flipped, currentCard, handleGrade]);

  const directionLabels: Record<string, string> = Object.fromEntries(
    DIRECTIONS.map(d => [d.key, d.label])
  );

  // ─── SETUP SCREEN ─────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-display font-bold text-ink-900">
            卡片 <span className="text-ink-400 font-body text-base font-normal">Flashcards</span>
          </h2>
          <p className="text-ink-500 mt-1">Choose your practice mode and start reviewing.</p>
        </div>

        {/* Mode selection */}
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink-800">Direction</h3>
            <button onClick={selectAllModes} className="text-xs text-vermillion-600 hover:text-vermillion-700">
              Select all
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {DIRECTIONS.map(dir => {
              const selected = selectedModes.includes(dir.key);
              return (
                <button
                  key={dir.key}
                  onClick={() => toggleMode(dir.key)}
                  className={`flex items-center gap-3 p-3 rounded-lg text-left transition-all
                    ${selected
                      ? 'bg-vermillion-50 border-2 border-vermillion-400'
                      : 'bg-ink-50 border-2 border-transparent hover:border-ink-200'
                    }`}
                >
                  <span className={`hanzi-display text-xl w-8 text-center
                    ${selected ? 'text-vermillion-600' : 'text-ink-400'}`}>
                    {dir.icon}
                  </span>
                  <div className="flex-1">
                    <span className={`text-sm font-medium ${selected ? 'text-vermillion-700' : 'text-ink-700'}`}>
                      {dir.label}
                    </span>
                    <span className="text-xs text-ink-400 ml-2">{dir.description}</span>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${selected
                      ? 'border-vermillion-500 bg-vermillion-500'
                      : 'border-ink-300'
                    }`}>
                    {selected && <span className="text-white text-xs">✓</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Card count */}
        <div className="card p-5 mb-6">
          <h3 className="font-semibold text-ink-800 mb-3">Cards per session</h3>
          <div className="flex gap-2">
            {[10, 20, 30, 50].map(n => (
              <button
                key={n}
                onClick={() => setCardCount(n)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${cardCount === n
                    ? 'bg-vermillion-600 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                  }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Start button */}
        <button
          onClick={startSession}
          disabled={loading || selectedModes.length === 0}
          className="btn-primary w-full py-3 text-base"
        >
          {loading ? 'Loading...' : `Start Review (${cardCount} cards)`}
        </button>
      </div>
    );
  }

  // ─── SESSION DONE ──────────────────────────────────────────

  if (phase === 'done') {
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
            <button onClick={startSession} className="btn-primary">
              {totalDue > stats.total ? `Continue (${totalDue - stats.total} more)` : 'Review Again'}
            </button>
            <button onClick={() => setPhase('setup')} className="btn-secondary">
              Change Mode
            </button>
            <a href="/" className="btn-ghost">Dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  // ─── ACTIVE SESSION ────────────────────────────────────────

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-display font-bold text-ink-900">
            卡片
          </h2>
          <button
            onClick={() => setPhase('setup')}
            className="text-xs text-ink-400 hover:text-ink-600 underline"
          >
            Change mode
          </button>
        </div>
        <div className="flex items-center gap-4 text-sm text-ink-500">
          <span>{currentIndex + 1} / {cards.length}</span>
          <span className="text-ink-300">·</span>
          <span className="text-jade-600">{stats.correct}✓</span>
          <span className="text-vermillion-600">{stats.wrong}✗</span>
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
        {/* Direction + status badges */}
        <div className="flex gap-2 mb-4">
          <span className="badge bg-ink-100 text-ink-500">
            {directionLabels[currentCard.direction] || currentCard.direction}
          </span>
          <span className={`badge ${
            currentCard.status === 'NEW' ? 'badge-new' :
            currentCard.status === 'LEARNING' ? 'badge-learning' : 'badge-learned'
          }`}>
            {currentCard.status.toLowerCase()}
          </span>
        </div>

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
          <div className="mt-4 pt-4 border-t border-ink-100 w-full text-center animate-fadeIn">
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
        <div className="flex gap-3 mt-6 justify-center animate-fadeIn">
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
