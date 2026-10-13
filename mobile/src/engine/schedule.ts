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

/** What Easy adds over OK, on every genre. */
export const EASY_BONUS = 1.3;

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
export function firstInterval(genre: Genre, feltShaky: boolean, calibration = 1): number {
  return Math.max(1, Math.round(curveAt(genre, feltShaky ? 0 : 1) * calibration));
}

/** The diagnostic's clamp: no result moves a schedule further than this. */
export const CALIBRATION_MIN = 0.6;
export const CALIBRATION_MAX = 1.5;

/** The stability a single exposure is taken to have, in days. */
export const REFERENCE_STABILITY = 7;

/** How sure the person was that they recalled it. */
export type RecallAnswer = 'no' | 'partly' | 'yes';

const RECALL_P: Record<RecallAnswer, number> = { no: 0.15, partly: 0.5, yes: 0.85 };

/**
 * The forgetting-rate diagnostic. Each answer is a real recall attempt at
 * something learned `daysAgo` days ago. Recall after d days is exp(−d ÷ S), so
 * each answer back-solves a stability S; the geometric mean of those is set
 * against a 7-day single exposure. The ratio is square-root damped, so one
 * shaky answer cannot blow up a schedule, then clamped to 0.6–1.5.
 *
 * Fast forgetters get compressed intervals, strong retainers stretched ones.
 */
export function calibrationFrom(answers: { daysAgo: number; recall: RecallAnswer }[]): number {
  const usable = answers.filter((a) => a.daysAgo >= 1);
  if (!usable.length) return 1;
  const logS = usable.map((a) => Math.log(a.daysAgo / -Math.log(RECALL_P[a.recall])));
  const stability = Math.exp(logS.reduce((x, y) => x + y, 0) / logS.length);
  const factor = Math.sqrt(stability / REFERENCE_STABILITY);
  return Math.round(clamp(factor, CALIBRATION_MIN, CALIBRATION_MAX) * 100) / 100;
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
export function applyRating(topic: Topic, genre: Genre, rating: Rating, on: Day, calibration = 1): Outcome {
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
    // The interval as it would be without the weak-point penalty. The stored
    // interval already has the penalty in it, so stepping from that and then
    // applying the penalty again compounded it on every rating — a card with
    // two weak points stalled at one day and stayed there, however many OKs
    // it got. The penalty is applied once, below, to whatever this produces.
    const unpenalised = topic.interval_days / (topic.penalty * calibration);
    switch (rating) {
      case 'failed':
        repetition = 0;
        ease = clamp(ease - 0.2, EASE_MIN, EASE_MAX);
        raw = 1;
        break;
      case 'hard':
        repetition = repetition + 1;
        ease = clamp(ease - 0.15, EASE_MIN, EASE_MAX);
        raw = unpenalised * 0.6;
        break;
      case 'ok':
        repetition = repetition + 1;
        raw = perItemStep(unpenalised, repetition, ease);
        break;
      case 'easy':
        repetition = repetition + 1;
        ease = clamp(ease + 0.15, EASE_MIN, EASE_MAX);
        raw = perItemStep(unpenalised, repetition, ease) * EASY_BONUS;
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
        // The next rung, lengthened — not two rungs at once. Skipping a rung
        // multiplies the gap by the curve's growth twice, which on a mature
        // topic is one tap moving it from seven weeks to eight months.
        repetition = repetition + 1;
        raw = curveAt(genre, repetition) * EASY_BONUS;
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

  let interval_days = Math.max(1, Math.round(raw * penalty * calibration));
  // A success never brings a topic back sooner than last time. Rounding a
  // short, penalised interval can otherwise land on the same day count — or
  // fewer — and an OK that changes nothing reads as the app not listening.
  // A deck's first two reviews are the exception — they are fixed steps —
  // unless a penalty has squeezed them onto the same day.
  const fixedStep = isPerItem(genre) && repetition <= 2 && penalty === 1;
  if ((rating === 'ok' || rating === 'easy') && !fixedStep && interval_days <= topic.interval_days) {
    interval_days = topic.interval_days + 1;
  }
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
export function previewRatings(topic: Topic, genre: Genre, on: Day, calibration = 1): RatingPreview[] {
  return (['failed', 'hard', 'ok', 'easy'] as Rating[]).map((rating) => ({
    rating,
    days: applyRating(topic, genre, rating, on, calibration).interval_days,
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
  calibration = 1,
): { interval_days: number; due_on: Day } {
  // A topic's stored interval already carries its penalty and calibration, so
  // they are applied only to a fresh one. Multiplying the stored interval by
  // the penalty again shrank a weak topic a little more on every log.
  const interval =
    topic.state === 'new'
      ? Math.max(1, Math.round(firstInterval(genre, feltShaky, calibration) * topic.penalty))
      : Math.max(1, Math.round(feltShaky ? topic.interval_days * 0.6 : topic.interval_days));
  return { interval_days: interval, due_on: addDays(studiedOn, interval) };
}

/**
 * Where a topic goes on an unbroken run of OKs, each review on the day it is
 * due. Runs the real rating, so a projection can never disagree with what
 * rating OK would actually do — the two used to be separate arithmetic, and
 * the projection inherited every bug the rating had and some of its own.
 */
function okRun(topic: Topic, genre: Genre, count: number, calibration: number): Topic[] {
  const out: Topic[] = [];
  let cur = topic;
  for (let i = 0; i < count; i++) {
    const next = applyRating(cur, genre, 'ok', cur.due_on, calibration);
    cur = { ...cur, ...next, state: next.state };
    out.push(cur);
  }
  return out;
}

/** The full projected chain from a topic's current position, on unbroken OKs. */
export function projectedChain(topic: Topic, genre: Genre, count: number, calibration = 1): number[] {
  return okRun(topic, genre, count, calibration).map((t) => t.interval_days);
}

/** The dates a topic lands on next, if every rating is OK. */
export function projectedDates(
  topic: Topic,
  genre: Genre,
  count: number,
  calibration = 1,
): { day: Day; index: number }[] {
  const out: { day: Day; index: number }[] = [{ day: topic.due_on, index: 0 }];
  okRun(topic, genre, count - 1, calibration).forEach((t, i) => out.push({ day: t.due_on, index: i + 1 }));
  return out;
}

export function newTopicDefaults(genre: Genre, feltShaky: boolean, studiedOn: Day, calibration = 1) {
  const interval = firstInterval(genre, feltShaky, calibration);
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
