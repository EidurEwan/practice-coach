import { bandFor } from './bands';
import { addDays, dayOf, daysBetween, Day, weekStart } from './dates';
import { activeTopics, skillById } from './plan';
import { applyRating } from './schedule';
import { Doc, Rating, Skill, Topic } from './types';

/**
 * What the Progress screen knows. Pure, like the rest of the engine.
 *
 * Recall is estimated with the forgetting curve the app already shows on its
 * cards, R(t) = exp(−t / S). The schedule sets each gap so the next review
 * lands while recall is still about 90%, so a topic's stability follows from
 * its current gap: S = gap / −ln 0.9. Nothing here is measured — no test of
 * memory is ever taken — so every figure it produces is labelled an estimate
 * where it is shown.
 */

/** The recall the schedule aims to catch each review at. */
export const TARGET_RECALL = 0.9;

const LN_TARGET = -Math.log(TARGET_RECALL);

export function stabilityOf(intervalDays: number): number {
  return Math.max(1, intervalDays) / LN_TARGET;
}

export function recall(daysSince: number, intervalDays: number): number {
  return Math.exp(-Math.max(0, daysSince) / stabilityOf(intervalDays));
}

/**
 * When the topic was last practised. A rating stamps the moment; a topic that
 * has only ever been logged was studied one gap before it falls due.
 */
export function lastPractised(topic: Topic): Day {
  return topic.last_reviewed_at ? dayOf(topic.last_reviewed_at) : addDays(topic.due_on, -topic.interval_days);
}

/** Estimated recall of one topic on `on`, if nothing more is done before then. */
export function recallOn(topic: Topic, on: Day): number {
  return recall(daysBetween(lastPractised(topic), on), topic.interval_days);
}

/** A review the simulation expects: the day it happens and the gap it sets. */
type SimReview = { day: Day; interval: number };

/**
 * The reviews a topic gets from `from` to `until` if each is done on the day
 * it falls due and rated OK. Overdue work is done today. Runs the real
 * rating, so the forecast cannot drift from what the schedule would do.
 */
function keepUp(topic: Topic, skill: Skill, from: Day, until: Day): SimReview[] {
  const out: SimReview[] = [];
  let cur: Topic = daysBetween(topic.due_on, from) > 0 ? { ...topic, due_on: from } : topic;
  for (let i = 0; i < 400 && cur.due_on <= until; i++) {
    const on = cur.due_on;
    const next = applyRating(cur, skill.genre, 'ok', on, skill.calibration);
    out.push({ day: on, interval: next.interval_days });
    cur = { ...cur, ...next };
  }
  return out;
}

/**
 * Estimated recall at the start of `on` for a topic that keeps getting
 * reviewed on time — before that day's own review, so day 0 is the present.
 */
function keepUpRecall(topic: Topic, reviews: SimReview[], on: Day): number {
  let last: SimReview | null = null;
  for (const r of reviews) {
    if (r.day >= on) break;
    last = r;
  }
  return last ? recall(daysBetween(last.day, on), last.interval) : recallOn(topic, on);
}

/** The gap a topic will have at the start of `on` if it keeps getting reviewed on time. */
function keepUpInterval(topic: Topic, reviews: SimReview[], on: Day): number {
  let interval = topic.interval_days;
  for (const r of reviews) {
    if (r.day >= on) break;
    interval = r.interval;
  }
  return interval;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Counts per proficiency band, Fragile to Retained. */
export type BandMix = [number, number, number, number, number];

export function bandMix(intervals: number[]): BandMix {
  const out: BandMix = [0, 0, 0, 0, 0];
  for (const i of intervals) out[bandFor(i).level - 1] += 1;
  return out;
}

type Tracked = { topic: Topic; skill: Skill };

/** What is being scheduled on `today` — finished seasons and paused subjects are not. */
function tracked(doc: Doc, today: Day, skillId?: string | null): Tracked[] {
  return activeTopics(doc, today)
    .filter((t) => !skillId || t.skill_id === skillId)
    .map((topic) => ({ topic, skill: skillById(doc, topic.skill_id)! }));
}

export type Outlook = {
  /** Days from today. */
  days: number;
  on: Day;
  /** Average estimated recall if every review is done on time. */
  keepRecall: number;
  /** Average estimated recall if practice stops today. */
  stopRecall: number;
  /** Proficiency bands on that day, kept up. */
  keepBands: BandMix;
};

/**
 * The two futures, side by side, at each of `points` days ahead. Day 0 is
 * now, where the two lines start together.
 */
export function outlook(doc: Doc, today: Day, points: number[], skillId?: string | null): Outlook[] {
  const items = tracked(doc, today, skillId);
  const until = addDays(today, Math.max(0, ...points));
  const sims = items.map(({ topic, skill }) => ({ topic, reviews: keepUp(topic, skill, today, until) }));

  return points.map((days) => {
    const on = addDays(today, days);
    return {
      days,
      on,
      keepRecall: mean(sims.map((s) => keepUpRecall(s.topic, s.reviews, on))),
      stopRecall: mean(items.map(({ topic }) => recallOn(topic, on))),
      keepBands: bandMix(sims.map((s) => keepUpInterval(s.topic, s.reviews, on))),
    };
  });
}

/** Reviews it takes to keep up, per week from this one — the cost of the "kept up" line. */
export function weeklyWorkload(doc: Doc, today: Day, weeks: number): { week: Day; reviews: number }[] {
  const first = weekStart(today);
  const out = Array.from({ length: weeks }, (_, i) => ({ week: addDays(first, i * 7), reviews: 0 }));
  const until = addDays(first, weeks * 7 - 1);
  for (const { topic, skill } of tracked(doc, today)) {
    for (const r of keepUp(topic, skill, today, until)) {
      const i = Math.floor(daysBetween(first, r.day) / 7);
      if (i >= 0 && i < weeks) out[i].reviews += 1;
    }
  }
  return out;
}

export type Summary = {
  tracked: number;
  /** Ratings in the last 30 days, not counting "didn't get to it". */
  reviews30: number;
  /** Share of those that were OK or Easy. Null when there were none. */
  recallRate30: number | null;
  /** Days in a row, up to today, with a rating or a log. Today counts once it has one. */
  streak: number;
  /** Estimated recall across everything tracked, today. */
  recallNow: number | null;
};

/** Each local day with practice on it — a rating or a logged session. */
function practiceDays(doc: Doc): Set<Day> {
  const days = new Set<Day>();
  for (const r of doc.reviews) if (r.rating !== 'pushed') days.add(dayOf(r.rated_at));
  for (const e of doc.log_entries) days.add(e.studied_on);
  return days;
}

export function summary(doc: Doc, today: Day): Summary {
  const since = addDays(today, -29);
  const recent = doc.reviews.filter((r) => r.rating !== 'pushed' && dayOf(r.rated_at) >= since);
  const good = recent.filter((r) => r.rating === 'ok' || r.rating === 'easy').length;

  const days = practiceDays(doc);
  // A streak is not broken by a day that has not finished yet.
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const topics = activeTopics(doc, today);
  return {
    tracked: topics.length,
    reviews30: recent.length,
    recallRate30: recent.length ? good / recent.length : null,
    streak,
    recallNow: topics.length ? mean(topics.map((t) => recallOn(t, today))) : null,
  };
}

/** Practice per day for the last `weeks` whole weeks, Monday first, ending this week. */
export function activity(doc: Doc, today: Day, weeks: number): { day: Day; count: number; future: boolean }[] {
  const counts = new Map<Day, number>();
  for (const r of doc.reviews) {
    if (r.rating === 'pushed') continue;
    const d = dayOf(r.rated_at);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  for (const e of doc.log_entries) counts.set(e.studied_on, (counts.get(e.studied_on) ?? 0) + 1);

  const first = addDays(weekStart(today), -(weeks - 1) * 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const day = addDays(first, i);
    return { day, count: counts.get(day) ?? 0, future: day > today };
  });
}

export function ratingMix(doc: Doc, today: Day, days: number): Record<Exclude<Rating, 'pushed'>, number> {
  const since = addDays(today, -(days - 1));
  const out = { failed: 0, hard: 0, ok: 0, easy: 0 };
  for (const r of doc.reviews) {
    if (r.rating === 'pushed' || dayOf(r.rated_at) < since) continue;
    out[r.rating] += 1;
  }
  return out;
}

export type SkillProgress = {
  skill: Skill;
  topics: number;
  recallNow: number;
  bandsNow: BandMix;
  bandsLater: BandMix;
};

export function skillProgress(doc: Doc, today: Day, horizonDays: number): SkillProgress[] {
  const out: SkillProgress[] = [];
  for (const skill of doc.skills.filter((s) => !s.archived_at)) {
    const items = tracked(doc, today, skill.id);
    if (!items.length) continue;
    const [later] = outlook(doc, today, [horizonDays], skill.id);
    out.push({
      skill,
      topics: items.length,
      recallNow: mean(items.map(({ topic }) => recallOn(topic, today))),
      bandsNow: bandMix(items.map(({ topic }) => topic.interval_days)),
      bandsLater: later.keepBands,
    });
  }
  return out;
}

export type Attention = { topic: Topic; skill: Skill; recall: number; why: string };

/**
 * The few topics most worth a look: weak points first, then whatever has
 * slipped furthest. A short list on purpose — it is a nudge, not a backlog.
 */
export function needsAttention(doc: Doc, today: Day, n: number): Attention[] {
  return tracked(doc, today)
    .map(({ topic, skill }) => {
      const r = recallOn(topic, today);
      const late = daysBetween(topic.due_on, today);
      const why =
        topic.penalty < 1
          ? 'Weak point — kept rating hard'
          : late > 0
            ? `${late} ${late === 1 ? 'day' : 'days'} overdue`
            : 'Lowest estimated recall';
      return { topic, skill, recall: r, why, weak: topic.penalty < 1 };
    })
    .filter((a) => a.weak || a.recall < TARGET_RECALL)
    .sort((a, b) => (a.weak !== b.weak ? (a.weak ? -1 : 1) : a.recall - b.recall))
    .slice(0, n)
    .map(({ weak: _, ...a }) => a);
}

/**
 * The first day a topic reaches a band on an unbroken run of OKs, or null if
 * it is already there or would not get there within two years.
 */
export function reachesBand(topic: Topic, skill: Skill, level: number, today: Day): Day | null {
  if (bandFor(topic.interval_days).level >= level) return null;
  for (const r of keepUp(topic, skill, today, addDays(today, 730))) {
    if (bandFor(r.interval).level >= level) return r.day;
  }
  return null;
}

