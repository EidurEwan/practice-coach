// Interval maths: expanding-spacing curves, SM-2, and forgetting-rate calibration.

import { usesPerItemSRS } from './genres.js';
import { addDays } from './dates.js';

/** Days after first exposure, roughly x2.2 each step (spec section 3). */
export const BASE_CURVE = [1, 3, 7, 16, 35, 70, 154, 339];

/** Reasoning & conceptual topics get compressed early intervals. */
export const TIGHT_CURVE = [1, 2, 5, 10, 22, 48, 106, 233];

export const GROWTH = 2.2;

export const RATINGS = ['easy', 'ok', 'hard', 'failed'];

/** Confidence adjustment applied to the next interval (spec section 3). */
export const RATING_MULTIPLIER = { easy: 1.3, ok: 1.0, hard: 0.6, failed: 0 };

/** Rating -> SM-2 quality score. */
export const RATING_Q = { easy: 5, ok: 4, hard: 3, failed: 1 };

export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const EASE_DEFAULT = 2.5;

/** Permanent shrink applied when a topic is rated hard/failed 3x running. */
export const WEAK_POINT_PENALTY = 0.7;
export const PENALTY_FLOOR = 0.4;

/**
 * Assumed stability (days) of a single un-reviewed exposure for an average
 * learner, under R(d) = exp(-d / S). Used as the reference point the
 * forgetting-rate diagnostic is scored against.
 */
export const REFERENCE_STABILITY_DAYS = 7;

export const CALIBRATION_MIN = 0.6;
export const CALIBRATION_MAX = 1.5;

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function curveFor(genre) {
  return genre === 'reasoning' || genre === 'conceptual' ? TIGHT_CURVE : BASE_CURVE;
}

/** Interval for step `rep`, extrapolating past the end of the table by xGROWTH. */
export function curveStep(curve, rep) {
  if (rep < curve.length) return curve[rep];
  let v = curve[curve.length - 1];
  for (let i = curve.length; i <= rep; i += 1) v *= GROWTH;
  return v;
}

/**
 * Turn diagnostic answers into an interval scale factor.
 * @param {{daysSince:number, score:number}[]} answers - score in 0..1
 * @returns {number} <1 compresses intervals (fast forgetter), >1 stretches them.
 */
export function calibrationFromDiagnostic(answers) {
  const usable = (answers || []).filter(
    (a) => Number.isFinite(a.score) && Number.isFinite(a.daysSince),
  );
  if (usable.length === 0) return 1;

  const factors = usable.map(({ daysSince, score }) => {
    const days = Math.max(1, daysSince);
    const retention = clamp(score, 0.05, 0.95);
    const observedStability = -days / Math.log(retention);
    // sqrt damps the response so one shaky answer can't blow up the schedule.
    return Math.sqrt(observedStability / REFERENCE_STABILITY_DAYS);
  });

  const mean = factors.reduce((a, b) => a + b, 0) / factors.length;
  return Number(clamp(mean, CALIBRATION_MIN, CALIBRATION_MAX).toFixed(2));
}

/**
 * Expanding-curve update, used for topic-level tracks
 * (reasoning / conceptual / physical).
 */
export function curveUpdate(state, rating, { genre, calibration = 1 }) {
  const curve = curveFor(genre);
  const penalty = state.difficultyPenalty ?? 1;

  if (rating === 'failed') {
    return {
      repetition: 0,
      intervalDays: 1,
      ease: clamp(state.ease - 0.2, EASE_MIN, EASE_MAX),
    };
  }

  const easeDelta = rating === 'easy' ? 0.1 : rating === 'hard' ? -0.15 : 0;
  const ease = clamp(state.ease + easeDelta, EASE_MIN, EASE_MAX);
  const repetition = state.repetition + 1;

  const raw =
    curveStep(curve, repetition) *
    calibration *
    (ease / EASE_DEFAULT) *
    RATING_MULTIPLIER[rating] *
    penalty;

  // Minimum one day = minimum one sleep cycle before any repeat.
  return { repetition, intervalDays: Math.max(1, Math.round(raw)), ease };
}

/**
 * Strict per-item SM-2, used for memorization and language items so each item
 * carries its own ease factor rather than averaging across a topic.
 */
export function sm2Update(state, rating, { calibration = 1 } = {}) {
  const q = RATING_Q[rating];
  const penalty = state.difficultyPenalty ?? 1;

  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const ease = clamp(state.ease + delta, EASE_MIN, EASE_MAX);

  if (q < 3) {
    return { repetition: 0, intervalDays: 1, ease };
  }

  const repetition = state.repetition + 1;
  let interval;
  if (repetition === 1) interval = 1;
  else if (repetition === 2) interval = 6;
  else interval = state.intervalDays * ease;

  interval *= calibration * RATING_MULTIPLIER[rating] * penalty;

  return { repetition, intervalDays: Math.max(1, Math.round(interval)), ease };
}

/** Dispatch to the right algorithm for the track. */
export function nextState(state, rating, { genre, calibration = 1 }) {
  return usesPerItemSRS(genre)
    ? sm2Update(state, rating, { calibration })
    : curveUpdate(state, rating, { genre, calibration });
}

/** First interval after initial exposure, before any review has happened. */
export function firstInterval(genre, calibration = 1) {
  return Math.max(1, Math.round(curveStep(curveFor(genre), 0) * calibration));
}

/**
 * Project every review falling on or before `untilISO`, assuming each one is
 * rated "OK". Returns the repetition count as it will stand at each review, so
 * effort can be estimated per step.
 *
 * This is a forecast, not a schedule: a single "failed" collapses the chain
 * back to a 1-day interval, and an "easy" stretches it. Only the first entry is
 * an actually-committed due date.
 *
 * @param {string|null} options.from - overdue items are projected from here
 *   rather than from the date they were missed.
 */
export function projectUntil(item, genre, calibration, untilISO, options = {}) {
  const { from = null, maxSteps = 200 } = options;
  let state = {
    repetition: item.repetition,
    intervalDays: item.intervalDays,
    ease: item.ease,
    difficultyPenalty: item.difficultyPenalty ?? 1,
  };
  let cursor = from && item.dueDate < from ? from : item.dueDate;

  const out = [];
  while (cursor <= untilISO && out.length < maxSteps) {
    out.push({ date: cursor, repetition: state.repetition });
    state = {
      ...nextState(state, 'ok', { genre, calibration }),
      difficultyPenalty: state.difficultyPenalty,
    };
    cursor = addDays(cursor, state.intervalDays);
  }
  return out;
}

/**
 * Project the next `count` review dates assuming every future rating is "OK".
 * Used for the "upcoming schedule" line of the practice card.
 */
export function projectSchedule(item, genre, calibration, count = 5) {
  let state = {
    repetition: item.repetition,
    intervalDays: item.intervalDays,
    ease: item.ease,
    difficultyPenalty: item.difficultyPenalty ?? 1,
  };
  let cursor = item.dueDate;
  const out = [cursor];

  for (let i = 1; i < count; i += 1) {
    state = { ...nextState(state, 'ok', { genre, calibration }), difficultyPenalty: state.difficultyPenalty };
    cursor = addDays(cursor, state.intervalDays);
    out.push(cursor);
  }
  return out;
}
