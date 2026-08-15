import { addDays, Day } from './dates';
import { COMPRESSED, CURVE_GROWTH, curveFor, EXPANDING, Genre, isPerItem, PhysicalKind, TOP_OF_LADDER } from './genres';
import { Rating, Skill, Topic, TopicState } from './types';

/** Ease is clamped here. One bad week cannot make a topic unschedulable. */
export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const EASE_DEFAULT = 2.5;

/** A weak point costs 30% of the interval, permanently, down to this floor. */
export const PENALTY_STEP = 0.7;
export const PENALTY_FLOOR = 0.4;

/** Three in a row is the trigger for both a plateau and a weak point. */
export const STREAK_TRIGGER = 3;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The rung `n` of a genre's curve, extended past the end at ×2.2 a step. */
export function curveAt(genre: Genre, n: number): number {
  const curve = curveFor(genre);
  if (n < 0) return curve[0];
  if (n < curve.length) return curve[n];
  const over = n - (curve.length - 1);
  return Math.round(curve[curve.length - 1] * Math.pow(CURVE_GROWTH, over));
}

/** What a freshly logged topic gets before it has ever been rated. */
export function firstInterval(genre: Genre, feltShaky: boolean): number {
  if (feltShaky) return curveAt(genre, 0);
  return curveAt(genre, 1);
}

export type Outcome = {
  interval_days: number;
  repetition: number;
  ease: number;
  streak: number;
  penalty: number;
  format_rung: number;
  state: TopicState;
  due_on: Day;
  /** True when this rating tripped the plateau escalation. */
  plateau: boolean;
  /** True when this rating tripped (or deepened) the weak-point penalty. */
  weakened: boolean;
};

/**
 * One rating, applied. Pure: the same topic and rating always give the same
 * outcome, which is what lets the buttons state their consequence before they
 * are pressed — the preview and the commit run this identical function.
 */
export function applyRating(topic: Topic, genre: Genre, rating: Rating, on: Day): Outcome {
  const base = {
    interval_days: topic.interval_days,
    repetition: topic.repetition,
    ease: topic.ease,
    streak: topic.streak,
    penalty: topic.penalty,
    format_rung: topic.format_rung,
    state: topic.state,
    plateau: false,
    weakened: false,
  };

  // "Didn't get to it" is not a judgement of memory: it returns tomorrow and
  // touches nothing else, so a busy day cannot corrupt the schedule.
  if (rating === 'pushed') {
    return { ...base, due_on: addDays(on, 1) };
  }

  let { repetition, ease, streak, penalty, format_rung } = base;
  let raw: number;

  if (isPerItem(genre)) {
    switch (rating) {
      case 'failed':
        repetition = 0;
        ease = clamp(ease - 0.2, EASE_MIN, EASE_MAX);
        raw = 1;
        break;
      case 'hard':
        repetition = repetition + 1;
        ease = clamp(ease - 0.15, EASE_MIN, EASE_MAX);
        raw = topic.interval_days * 0.6;
        break;
      case 'ok':
        repetition = repetition + 1;
        raw = perItemStep(topic.interval_days, repetition, ease);
        break;
      case 'easy':
        repetition = repetition + 1;
        ease = clamp(ease + 0.15, EASE_MIN, EASE_MAX);
        raw = perItemStep(topic.interval_days, repetition, ease) * 1.3;
        break;
    }
  } else {
    switch (rating) {
      case 'failed':
        repetition = 0;
        raw = curveAt(genre, 0);
        break;
      case 'hard':
        // Stays on its rung — a slow success is not progress, but it is not a reset.
        raw = curveAt(genre, repetition) * 0.6;
        break;
      case 'ok':
        repetition = repetition + 1;
        raw = curveAt(genre, repetition);
        break;
      case 'easy':
        repetition = repetition + 2;
        raw = curveAt(genre, repetition);
        break;
    }
  }

  // Streaks run in one direction only; the opposite rating clears them.
  if (rating === 'ok') streak = streak > 0 ? streak + 1 : 1;
  else if (rating === 'hard' || rating === 'failed') streak = streak < 0 ? streak - 1 : -1;
  else streak = 0;

  let plateau = false;
  let weakened = false;

  if (streak >= STREAK_TRIGGER) {
    // Three OKs running is a plateau, not stability: escalate the format
    // instead of running the same session again.
    plateau = true;
    format_rung = Math.min(TOP_OF_LADDER, format_rung + 1);
    streak = 0;
  }
  if (streak <= -STREAK_TRIGGER) {
    weakened = true;
    penalty = Math.max(PENALTY_FLOOR, penalty * PENALTY_STEP);
    streak = 0;
  }

  const interval_days = Math.max(1, Math.round(raw * penalty));
  const state: TopicState = topic.state === 'paused' ? 'paused' : interval_days >= 10 ? 'stable' : 'learning';

  return {
    interval_days,
    repetition,
    ease,
    streak,
    penalty,
    format_rung,
    state,
    due_on: addDays(on, interval_days),
    plateau,
    weakened,
  };
}

function perItemStep(interval: number, repetition: number, ease: number): number {
  if (repetition <= 1) return 1;
  if (repetition === 2) return 3;
  return interval * ease;
}

export type RatingPreview = { rating: Rating; days: number };

/**
 * The four numbers on the rating rows. Same code path as the commit, so the
 * promise on the button is the promise the schedule keeps.
 */
export function previewRatings(topic: Topic, genre: Genre, on: Day): RatingPreview[] {
  return (['failed', 'hard', 'ok', 'easy'] as Rating[]).map((rating) => ({
    rating,
    days: applyRating(topic, genre, rating, on).interval_days,
  }));
}

/**
 * A study session that was logged rather than rated. It re-seeds the clock
 * from the day you actually studied; "felt shaky" pulls the next look sooner
 * without pretending to be a rating.
 */
export function applyLog(
  topic: Topic,
  genre: Genre,
  studiedOn: Day,
  feltShaky: boolean,
): { interval_days: number; due_on: Day } {
  const base = topic.state === 'new' ? firstInterval(genre, feltShaky) : topic.interval_days;
  const interval = Math.max(1, Math.round((feltShaky && topic.state !== 'new' ? base * 0.6 : base) * topic.penalty));
  return { interval_days: interval, due_on: addDays(studiedOn, interval) };
}

/** The full projected chain from a topic's current position, on unbroken OKs. */
export function projectedChain(topic: Topic, genre: Genre, count: number): number[] {
  const out: number[] = [];
  let interval = topic.interval_days;
  let repetition = topic.repetition;
  let ease = topic.ease;
  for (let i = 0; i < count; i++) {
    repetition += 1;
    const raw = isPerItem(genre) ? perItemStep(interval, repetition, ease) : curveAt(genre, repetition);
    interval = Math.max(1, Math.round(raw * topic.penalty));
    out.push(interval);
  }
  return out;
}

/** The dates a topic lands on next, if every rating is OK. */
export function projectedDates(topic: Topic, genre: Genre, count: number): { day: Day; index: number }[] {
  const chain = projectedChain(topic, genre, count);
  const out: { day: Day; index: number }[] = [];
  let day = topic.due_on;
  out.push({ day, index: 0 });
  for (let i = 0; i < chain.length - 1; i++) {
    day = addDays(day, chain[i]);
    out.push({ day, index: i + 1 });
  }
  return out;
}

export function newTopicDefaults(genre: Genre, feltShaky: boolean, studiedOn: Day) {
  const interval = firstInterval(genre, feltShaky);
  return {
    state: 'new' as TopicState,
    interval_days: interval,
    ease: EASE_DEFAULT,
    repetition: feltShaky ? 0 : 1,
    streak: 0,
    penalty: 1,
    format_rung: 0,
    due_on: addDays(studiedOn, interval),
  };
}

export function genreOf(skill: Skill): Genre {
  return skill.genre;
}

export function physicalKindOf(skill: Skill): PhysicalKind | null {
  return skill.physical_kind;
}

export const CURVES = { COMPRESSED, EXPANDING };
