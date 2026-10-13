import { addDays, daysBetween, Day, formatShort, lateWords, weekStart } from './dates';
import {
  curveFor,
  FORMAT_LADDER,
  Genre,
  genreBadge,
  isPerItem,
  methodFor,
  TOP_OF_LADDER,
} from './genres';
import { Doc, Skill, Topic } from './types';

export type Flag = 'overdue' | 'weak' | 'deadline' | 'plateau' | 'collide';

/** The order the day is built in. The focus set is simply the front of it. */
const RANK: Flag[] = ['overdue', 'weak', 'deadline', 'plateau', 'collide'];

export const FLAG_LABEL: Record<Flag, string> = {
  overdue: 'Overdue',
  weak: 'Priority weak point',
  deadline: 'Pre-deadline',
  plateau: 'Plateau',
  collide: 'Discrimination drill',
};

export type PlanItem = {
  topic: Topic;
  skill: Skill;
  flags: Flag[];
  /** The single badge shown on the card — the highest-ranked flag it carries. */
  flag: Flag | null;
  daysLate: number;
  lateLabel: string;
  method: string;
  /** Reasoning work is never scheduled alone. */
  partner: Topic | null;
  /** Set when a confusable pair pushed this out of today's set. */
  heldApartFrom: Topic | null;
  /** A confusable partner, both now stable, deliberately practised alongside. */
  collideWith: Topic | null;
  reasons: string[];
};

export type Plan = {
  day: Day;
  capacity: number;
  /** Everything due today or earlier, ranked. */
  due: PlanItem[];
  /** The front of that list, up to capacity. */
  focus: PlanItem[];
  /** The rest — ranked, never a to-do list. */
  backlog: PlanItem[];
  /** How far over capacity the day is, before any redistribution. */
  over: number;
  /** Movable overflow: not overdue, not a weak point. */
  movable: PlanItem[];
};

/** A skill's season is over once its target date has passed. */
export function seasonEnded(skill: Skill, day: Day): boolean {
  return !!skill.target_date && skill.target_date < day;
}

/**
 * Skills that schedule: not archived, not paused by hand, and — when a day is
 * given — not past their target date. A finished season stops scheduling but
 * deletes nothing; extending or clearing the date brings it all back.
 */
export function schedulingSkills(doc: Doc, day?: Day): Skill[] {
  return doc.skills.filter((s) => !s.archived_at && !s.paused_at && !(day && seasonEnded(s, day)));
}

export function skillById(doc: Doc, id: string): Skill | undefined {
  return doc.skills.find((s) => s.id === id);
}

export function activeTopics(doc: Doc, day?: Day): Topic[] {
  const live = new Set(schedulingSkills(doc, day).map((s) => s.id));
  return doc.topics.filter((t) => !t.archived_at && t.state !== 'paused' && live.has(t.skill_id));
}

/** Seasons that have ended and not been dealt with, for Today to say so. */
export function endedSeasons(doc: Doc, day: Day): { skill: Skill; topics: number; ratings: number }[] {
  return doc.skills
    .filter((s) => !s.archived_at && !s.paused_at && seasonEnded(s, day))
    .map((skill) => {
      const ids = new Set(doc.topics.filter((t) => t.skill_id === skill.id && !t.archived_at).map((t) => t.id));
      return { skill, topics: ids.size, ratings: doc.reviews.filter((r) => ids.has(r.topic_id) && r.rating !== 'pushed').length };
    });
}

/** A topic is shaky while its interval is inside the Learning band. */
export function isShaky(t: Topic): boolean {
  return t.interval_days < 10;
}

/** The date a skill is working towards: its own, or the exam date in Settings. */
export function targetOf(doc: Doc, skill: Skill): Day | null {
  return skill.target_date ?? doc.settings.exam_date;
}

function inDeadlineWindow(doc: Doc, skill: Skill, day: Day): boolean {
  const target = targetOf(doc, skill);
  if (!target) return false;
  const left = daysBetween(day, target);
  return left >= 0 && left <= doc.settings.pre_deadline_days;
}

function flagsFor(t: Topic, day: Day, deadline: boolean): Flag[] {
  const out: Flag[] = [];
  if (daysBetween(t.due_on, day) > 0) out.push('overdue');
  if (t.penalty < 1) out.push('weak');
  if (deadline) out.push('deadline');
  if (t.format_rung > 0) out.push('plateau');
  return out;
}

function rankOf(flags: Flag[]): number {
  for (let i = 0; i < RANK.length; i++) if (flags.includes(RANK[i])) return i;
  return RANK.length;
}

function primaryFlag(flags: Flag[]): Flag | null {
  for (const f of RANK) if (flags.includes(f)) return f;
  return null;
}

/** The line under the title: what this session actually is. */
export function methodLine(
  skill: Skill,
  topic: Topic,
  flags: Flag[],
  partner: Topic | null,
  collideWith: Topic | null = null,
): string {
  if (flags.includes('deadline')) return FORMAT_LADDER[TOP_OF_LADDER].line;
  if (collideWith) return `Mixed with ${collideWith.title} — tell the two apart, one problem at a time.`;
  if (topic.format_rung > 0) return FORMAT_LADDER[topic.format_rung].line;
  if (skill.genre === 'reasoning' && partner) return `Interleaved with ${partner.title} — never drilled alone.`;
  return methodFor(skill.genre, skill.physical_kind);
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function reasonsFor(
  doc: Doc,
  skill: Skill,
  topic: Topic,
  flags: Flag[],
  partner: Topic | null,
  partnerWhy: string,
  daysLate: number,
  heldApartFrom: Topic | null,
): string[] {
  const out: string[] = [];

  if (flags.includes('overdue')) {
    out.push(
      daysLate === 1
        ? 'Due yesterday — overdue work is ranked first.'
        : `Due ${daysLate} days ago — overdue work is ranked first.`,
    );
  }
  if (skill.genre === 'reasoning' && partner) {
    out.push(`Reasoning topics are never scheduled alone. ${partner.title} was picked because ${partnerWhy}.`);
  }
  if (flags.includes('weak')) {
    out.push(
      `Three hard or failed ratings running. A permanent ×0.7 penalty now applies, compounding to a floor of 0.4 — this one is at ×${topic.penalty.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}.`,
    );
    if (topic.sub_skill) {
      out.push(`You named ${topic.sub_skill} as the failing sub-skill, so this session targets that rather than the whole topic.`);
    }
  }
  if (flags.includes('plateau')) {
    out.push(
      `Three OKs running reads as a plateau, not stability. The format has escalated to ${FORMAT_LADDER[topic.format_rung].name.toLowerCase()}.`,
    );
    out.push(
      topic.format_rung >= TOP_OF_LADDER
        ? 'Top of the ladder. From here the next gain comes from external feedback, not from another format.'
        : `${TOP_OF_LADDER - topic.format_rung} ${TOP_OF_LADDER - topic.format_rung === 1 ? 'rung' : 'rungs'} left on the ladder.`,
    );
  }
  if (flags.includes('deadline')) {
    const target = targetOf(doc, skill)!;
    out.push(
      `Inside the ${doc.settings.pre_deadline_days}-day window before ${skill.target_date ? 'this skill\u2019s target date' : 'the exam'}, ${formatShort(
        target,
      )}, so practice switches to timed, exam-format conditions.`,
    );
  }
  if (skill.calibration !== 1) {
    out.push(
      `Every gap in this skill is ×${skill.calibration.toFixed(2)} — your forgetting-rate diagnostic ${
        skill.calibration > 1 ? 'found you hold on to it longer than average' : 'found it fades faster than average'
      }.`,
    );
  }
  if (heldApartFrom) {
    out.push(`Held apart from ${heldApartFrom.title} while either is shaky, so the two do not blur together.`);
  }
  if (flags.includes('collide')) {
    out.push(
      'You marked these two as easy to mix up. Both are stable now, so they are practised together on purpose — telling them apart is the skill.',
    );
  }

  if (isPerItem(skill.genre)) {
    out.push(
      `Per-item SM-2 — the deck counts as one thing, not one per card. Ease ${topic.ease.toFixed(1)}, review ${topic.repetition + 1}.`,
    );
  } else {
    const curve = curveFor(skill.genre).slice(0, 5).join(' → ');
    out.push(
      `${skill.genre === 'physical' ? 'Expanding' : 'Compressed'} curve: ${curve}. This is review ${topic.repetition + 1}.`,
    );
  }
  if (skill.genre === 'physical') {
    out.push(
      skill.physical_kind === 'open'
        ? 'Open skill, so it was never blocked — variable from day one.'
        : topic.repetition < 2
          ? 'Closed skill: blocked reps for the first two sessions, then randomised.'
          : 'Closed skill, past its two blocked sessions — randomised from here.',
    );
  }
  return out;
}

/**
 * Picks the second topic a reasoning session is interleaved with: another due
 * topic in the same skill first, then any other topic in the skill as a light
 * booster whose own schedule is untouched, then a cross-skill partner.
 */
function pickPartner(
  doc: Doc,
  skill: Skill,
  topic: Topic,
  dueIds: Set<string>,
  day: Day,
): { partner: Topic | null; why: string } {
  const siblings = activeTopics(doc, day).filter((t) => t.skill_id === skill.id && t.id !== topic.id);
  const dueSibling = siblings.find((t) => dueIds.has(t.id));
  if (dueSibling) return { partner: dueSibling, why: 'it is due in the same skill, so the pair costs one session rather than two' };
  const booster = siblings.sort((a, b) => daysBetween(b.due_on, a.due_on))[0];
  if (booster) return { partner: booster, why: 'it is the nearest thing in this skill — a light booster, its own schedule untouched' };
  const cross = activeTopics(doc, day).find((t) => t.skill_id !== skill.id);
  if (cross) return { partner: cross, why: 'this skill has only one topic, so the partner comes from another skill' };
  return { partner: null, why: '' };
}

export function buildPlan(doc: Doc, day: Day): Plan {
  const capacity = doc.settings.daily_capacity;
  const topics = activeTopics(doc, day);
  const dueTopics = topics.filter((t) => daysBetween(t.due_on, day) >= 0);
  const dueIds = new Set(dueTopics.map((t) => t.id));
  const byId = new Map(doc.topics.map((t) => [t.id, t]));

  // Pairs of things you mix up, both directions.
  const partnerOf = new Map<string, string[]>();
  for (const p of doc.pairs) {
    partnerOf.set(p.topic_a, (partnerOf.get(p.topic_a) ?? []).concat(p.topic_b));
    partnerOf.set(p.topic_b, (partnerOf.get(p.topic_b) ?? []).concat(p.topic_a));
  }
  const live = new Map(topics.map((t) => [t.id, t]));

  const items: PlanItem[] = dueTopics.map((topic) => {
    const skill = skillById(doc, topic.skill_id)!;
    const flags = flagsFor(topic, day, inDeadlineWindow(doc, skill, day));
    // Once both of a confusable pair are stable, they stop being held apart
    // and are practised together on purpose — discrimination is the point.
    const collideWith = isShaky(topic)
      ? null
      : (partnerOf.get(topic.id) ?? []).map((id) => live.get(id)).find((o): o is Topic => !!o && !isShaky(o)) ?? null;
    if (collideWith) flags.push('collide');
    const daysLate = Math.max(0, daysBetween(topic.due_on, day));
    const { partner, why } =
      skill.genre === 'reasoning' && !collideWith ? pickPartner(doc, skill, topic, dueIds, day) : { partner: null, why: '' };
    return {
      topic,
      skill,
      flags,
      flag: primaryFlag(flags),
      daysLate,
      lateLabel: lateWords(daysLate),
      method: methodLine(skill, topic, flags, partner, collideWith),
      partner,
      heldApartFrom: null,
      collideWith,
      reasons: reasonsFor(doc, skill, topic, flags, partner, why, daysLate, null),
    };
  });

  items.sort((a, b) => {
    const r = rankOf(a.flags) - rankOf(b.flags);
    if (r !== 0) return r;
    if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
    return a.topic.due_on < b.topic.due_on ? -1 : a.topic.due_on > b.topic.due_on ? 1 : 0;
  });

  // Confusable pairs are held apart while either is shaky: whichever ranks
  // lower waits, and is told why.

  const focus: PlanItem[] = [];
  const deferred: PlanItem[] = [];
  const rest: PlanItem[] = [];
  const placed = new Set<string>();

  for (const item of items) {
    const clash = (partnerOf.get(item.topic.id) ?? [])
      .filter((id) => placed.has(id))
      .map((id) => byId.get(id))
      .find((other) => !!other && (isShaky(other) || isShaky(item.topic)));

    if (clash) {
      const held: PlanItem = {
        ...item,
        heldApartFrom: clash,
        reasons: reasonsFor(doc, item.skill, item.topic, item.flags, item.partner, '', item.daysLate, clash),
      };
      deferred.push(held);
      continue;
    }
    if (focus.length < capacity) {
      focus.push(item);
      placed.add(item.topic.id);
    } else {
      rest.push(item);
    }
  }

  const backlog = rest.concat(deferred);
  const movable = backlog.filter((i) => !i.flags.includes('overdue') && !i.flags.includes('weak') && !i.heldApartFrom);

  return {
    day,
    capacity,
    due: items,
    focus,
    backlog,
    over: Math.max(0, items.length - capacity),
    movable,
  };
}

/**
 * The day as plain text, to paste into notes or send to someone: the focus
 * set in order, with its method, then what is waiting behind it.
 */
export function dayAsText(plan: Plan): string {
  const lines = [`Interval — ${formatShort(plan.day)}`, ''];
  if (!plan.focus.length) {
    lines.push('Nothing due. The day is clear.');
    return lines.join('\n');
  }
  plan.focus.forEach((item, i) => {
    const flag = item.flag ? ` [${FLAG_LABEL[item.flag]}]` : '';
    lines.push(`${i + 1}. ${item.topic.title} — ${item.skill.name}${flag}`);
    lines.push(`   ${item.method}`);
  });
  if (plan.backlog.length) {
    lines.push('', `Also due, behind these: ${plan.backlog.length}`);
  }
  return lines.join('\n');
}

/**
 * Moves the movable overflow onto the next day with room. Overdue work and
 * priority weak points never move — the offer is to reshape the week, not to
 * pretend the arrears are not there.
 */
export function redistribute(doc: Doc, day: Day): { id: string; due_on: Day }[] {
  const plan = buildPlan(doc, day);
  if (!plan.movable.length) return [];

  const capacity = doc.settings.daily_capacity;
  const load = new Map<Day, number>();
  for (const t of activeTopics(doc, day)) {
    if (daysBetween(t.due_on, day) >= 0) continue;
    load.set(t.due_on, (load.get(t.due_on) ?? 0) + 1);
  }

  const moves: { id: string; due_on: Day }[] = [];
  for (const item of plan.movable) {
    let target = addDays(day, 1);
    for (let i = 0; i < 365; i++) {
      if ((load.get(target) ?? 0) < capacity) break;
      target = addDays(target, 1);
    }
    load.set(target, (load.get(target) ?? 0) + 1);
    moves.push({ id: item.topic.id, due_on: target });
  }
  return moves;
}

export type Horizon = '2w' | '3m' | '1y' | '5y';

export const HORIZONS: { key: Horizon; label: string; days: number }[] = [
  { key: '2w', label: '2 weeks', days: 14 },
  { key: '3m', label: '3 months', days: 92 },
  { key: '1y', label: '1 year', days: 365 },
  { key: '5y', label: '5 years', days: 1826 },
];

/** One review on one day — the committed next one, or one projected after it. */
export type Occurrence = {
  key: string;
  topic: Topic;
  skill: Skill;
  day: Day;
  /** 0 is the committed review; 1, 2, … are projected on unbroken OKs. */
  index: number;
  committed: boolean;
  overdue: boolean;
  daysLate: number;
};

type Projector = (topic: Topic, genre: Genre, count: number, calibration?: number) => { day: Day; index: number }[];

/**
 * Every review between `day` and `until`, in date order.
 *
 * Overdue work counts as today — that is when it will actually be done — and
 * everything projected after it follows from today too. Projecting from the
 * missed date instead put the follow-up reviews in the past, where they were
 * dropped, so anyone behind saw a lighter future than they really had.
 */
export function occurrences(
  doc: Doc,
  day: Day,
  until: Day,
  opts: { skill?: string | null; projected?: boolean },
  project: Projector,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const topic of activeTopics(doc, day)) {
    const skill = skillById(doc, topic.skill_id)!;
    if (opts.skill && skill.id !== opts.skill) continue;

    const daysLate = Math.max(0, daysBetween(topic.due_on, day));
    const anchored = daysLate > 0 ? { ...topic, due_on: day } : topic;
    const count = opts.projected === false ? 1 : 40;

    for (const { day: on, index } of project(anchored, skill.genre, count, skill.calibration)) {
      if (on > until) break;
      out.push({
        key: `${topic.id}-${index}`,
        topic,
        skill,
        day: on,
        index,
        committed: index === 0,
        overdue: index === 0 && daysLate > 0,
        daysLate: index === 0 ? daysLate : 0,
      });
    }
  }
  return out.sort((a, b) =>
    a.day !== b.day
      ? a.day < b.day ? -1 : 1
      : a.overdue !== b.overdue
        ? a.overdue ? -1 : 1
        : a.skill.name.localeCompare(b.skill.name) || a.topic.title.localeCompare(b.topic.title),
  );
}

/** How a window of the agenda is bucketed: days, then weeks, months, years. */
export function bucketOf(day: Day, horizon: Horizon): Day {
  if (horizon === '2w') return day;
  if (horizon === '3m') return weekStart(day);
  if (horizon === '1y') return `${day.slice(0, 7)}-01`;
  return `${day.slice(0, 4)}-01-01`;
}

export type SkillTally = { skill: Skill; total: number; committed: number };

export type AgendaGroup = {
  /** The first day of the bucket. */
  key: string;
  items: Occurrence[];
  committed: number;
  /** Per skill, in the skills' own order — what a long horizon shows instead of a list. */
  bySkill: SkillTally[];
  /** Days in this bucket that are over the daily capacity on committed work alone. */
  overCapacity: number;
};

export function buildAgenda(
  doc: Doc,
  day: Day,
  horizon: Horizon,
  skillFilter: string | null,
  project: Projector,
  projected = true,
): AgendaGroup[] {
  const until = addDays(day, HORIZONS.find((h) => h.key === horizon)!.days);
  const groups = new Map<string, AgendaGroup>();
  const perDay = new Map<Day, number>();

  for (const o of occurrences(doc, day, until, { skill: skillFilter, projected }, project)) {
    const key = bucketOf(o.day, horizon);
    let g = groups.get(key);
    if (!g) {
      g = { key, items: [], committed: 0, bySkill: [], overCapacity: 0 };
      groups.set(key, g);
    }
    g.items.push(o);
    if (o.committed) {
      g.committed += 1;
      perDay.set(o.day, (perDay.get(o.day) ?? 0) + 1);
    }
    let tally = g.bySkill.find((x) => x.skill.id === o.skill.id);
    if (!tally) {
      tally = { skill: o.skill, total: 0, committed: 0 };
      g.bySkill.push(tally);
    }
    tally.total += 1;
    if (o.committed) tally.committed += 1;
  }

  const capacity = doc.settings.daily_capacity;
  for (const [d, n] of perDay) {
    if (n > capacity) groups.get(bucketOf(d, horizon))!.overCapacity += 1;
  }
  // A fixed order, the skills' own, so a skill sits in the same row of every
  // month and can be followed down the page.
  for (const g of groups.values()) g.bySkill.sort((a, b) => a.skill.hue_index - b.skill.hue_index);
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

export type DayLoad = { day: Day; committed: number; projected: number };

/** Reviews per day for the next `days` days — the strip at the top of Upcoming. */
export function dailyLoad(doc: Doc, day: Day, days: number, skillFilter: string | null, project: Projector): DayLoad[] {
  const out: DayLoad[] = Array.from({ length: days }, (_, i) => ({ day: addDays(day, i), committed: 0, projected: 0 }));
  const index = new Map(out.map((d, i) => [d.day, i]));
  for (const o of occurrences(doc, day, addDays(day, days - 1), { skill: skillFilter }, project)) {
    const at = index.get(o.day);
    if (at === undefined) continue;
    if (o.committed) out[at].committed += 1;
    else out[at].projected += 1;
  }
  return out;
}

export function badgeFor(skill: Skill): string {
  return genreBadge(skill.genre, skill.physical_kind);
}
