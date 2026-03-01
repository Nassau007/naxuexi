/**
 * SM-2 Spaced Repetition Algorithm
 * Adapted for Chinese vocabulary learning
 *
 * quality: 0-5 rating of recall quality
 *   0 - Complete blackout
 *   1 - Wrong, but recognized after seeing answer
 *   2 - Wrong, but answer felt familiar
 *   3 - Correct with serious difficulty
 *   4 - Correct with some hesitation
 *   5 - Perfect recall
 */

export type SM2Input = {
  quality: number;       // 0-5
  easeFactor: number;    // Current ease factor (≥1.3)
  interval: number;      // Current interval in days
  reviewCount: number;   // Number of reviews so far
};

export type SM2Output = {
  easeFactor: number;
  interval: number;
  nextReview: Date;
  status: 'NEW' | 'LEARNING' | 'LEARNED';
};

export function calculateSM2(input: SM2Input): SM2Output {
  const { quality, reviewCount } = input;
  let { easeFactor, interval } = input;

  // Update ease factor
  const newEaseFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  // Calculate next interval
  if (quality < 3) {
    // Failed: reset to beginning
    interval = 0;
  } else {
    if (reviewCount === 0) {
      interval = 1;
    } else if (reviewCount === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * newEaseFactor);
    }
  }

  // Determine status
  let status: 'NEW' | 'LEARNING' | 'LEARNED';
  if (reviewCount === 0 && quality < 3) {
    status = 'NEW';
  } else if (interval >= 21) {
    // 3+ weeks interval = considered learned
    status = 'LEARNED';
  } else {
    status = 'LEARNING';
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    easeFactor: newEaseFactor,
    interval,
    nextReview,
    status,
  };
}

/**
 * Map a simple correct/wrong result to SM-2 quality score
 */
export function resultToQuality(result: 'CORRECT' | 'WRONG' | 'PARTIAL'): number {
  switch (result) {
    case 'CORRECT': return 4;
    case 'PARTIAL': return 3;
    case 'WRONG': return 1;
  }
}
