import { addDays, daysBetween, Day, lateWords } from './dates';
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

export type Flag = 'overdue' | 'weak' | 'deadline' | 'plateau';

/** The order the day is built in. The focus set is simply the front of it. */
const RANK: Flag[] = ['overdue', 'weak', 'deadline', 'plateau'];

export const FLAG_LABEL: Record<Flag, string> = {
  overdue: 'Overdue',
  weak: 'Priority weak point',
  deadline: 'Pre-deadline',
  plateau: 'Plateau',
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

const activeSkills = (doc: Doc) => doc.skills.filter((s) => !s.archived_at);

export function skillById(doc: Doc, id: string): Skill | undefined {
  return doc.skills.find((s) => s.id === id);
}

export function activeTopics(doc: Doc): Topic[] {
  const live = new Set(activeSkills(doc).map((s) => s.id));
  return doc.topics.filter((t) => !t.archived_at && t.state !== 'paused' && live.has(t.skill_id));
}

/** A topic is shaky while its interval is inside the Learning band. */
export function isShaky(t: Topic): boolean {
  return t.interval_days < 10;
}

function inDeadlineWindow(doc: Doc, day: Day): boolean {
  const exam = doc.settings.exam_date;
  if (!exam) return false;
  const left = daysBetween(day, exam);
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
export function methodLine(skill: Skill, topic: Topic, flags: Flag[], partner: Topic | null): string {
  if (flags.includes('deadline')) return FORMAT_LADDER[TOP_OF_LADDER].line;
  if (topic.format_rung > 0) return FORMAT_LADDER[topic.format_rung].line;
  if (skill.genre === 'reasoning' && partner) return `Interleaved with ${partner.title} — never drilled alone.`;
  return methodFor(skill.genre, skill.physical_kind);
}

function ordinal(n: number): string {
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
    out.push(
      `Inside the ${doc.settings.pre_deadline_days}-day window before the exam, so practice switches to timed, exam-format conditions.`,
    );
  }
  if (heldApartFrom) {
    out.push(`Held apart from ${heldApartFrom.title} while either is shaky, so the two do not blur together.`);
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
): { partner: Topic | null; why: string } {
  const siblings = activeTopics(doc).filter((t) => t.skill_id === skill.id && t.id !== topic.id);
  const dueSibling = siblings.find((t) => dueIds.has(t.id));
  if (dueSibling) return { partner: dueSibling, why: 'it is due in the same skill, so the pair costs one session rather than two' };
  const booster = siblings.sort((a, b) => daysBetween(b.due_on, a.due_on))[0];
  if (booster) return { partner: booster, why: 'it is the nearest thing in this skill — a light booster, its own schedule untouched' };
  const cross = activeTopics(doc).find((t) => t.skill_id !== skill.id);
  if (cross) return { partner: cross, why: 'this skill has only one topic, so the partner comes from another skill' };
  return { partner: null, why: '' };
}

export function buildPlan(doc: Doc, day: Day): Plan {
  const capacity = doc.settings.daily_capacity;
  const deadline = inDeadlineWindow(doc, day);
  const topics = activeTopics(doc);
  const dueTopics = topics.filter((t) => daysBetween(t.due_on, day) >= 0);
  const dueIds = new Set(dueTopics.map((t) => t.id));
  const byId = new Map(doc.topics.map((t) => [t.id, t]));

  const items: PlanItem[] = dueTopics.map((topic) => {
    const skill = skillById(doc, topic.skill_id)!;
    const flags = flagsFor(topic, day, deadline);
    const daysLate = Math.max(0, daysBetween(topic.due_on, day));
    const { partner, why } = skill.genre === 'reasoning' ? pickPartner(doc, skill, topic, dueIds) : { partner: null, why: '' };
    return {
      topic,
      skill,
      flags,
      flag: primaryFlag(flags),
      daysLate,
      lateLabel: lateWords(daysLate),
      method: methodLine(skill, topic, flags, partner),
      partner,
      heldApartFrom: null,
      reasons: reasonsFor(doc, skill, topic, flags, partner, why, daysLate, null),
    };
  });

  items.sort((a, b) => {
    const r = rankOf(a.flags) - rankOf(b.flags);
    if (r !== 0) return r;
    if (a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
    return a.topic.due_on < b.topic.due_on ? -1 : a.topic.due_on > b.topic.due_on ? 1 : 0;
  });

  // Confusable pairs are held apart: whichever ranks lower waits, and is told why.
  const partnerOf = new Map<string, string[]>();
  for (const p of doc.pairs) {
    partnerOf.set(p.topic_a, (partnerOf.get(p.topic_a) ?? []).concat(p.topic_b));
    partnerOf.set(p.topic_b, (partnerOf.get(p.topic_b) ?? []).concat(p.topic_a));
  }

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
 * Moves the movable overflow onto the next day with room. Overdue work and
 * priority weak points never move — the offer is to reshape the week, not to
 * pretend the arrears are not there.
 */
export function redistribute(doc: Doc, day: Day): { id: string; due_on: Day }[] {
  const plan = buildPlan(doc, day);
  if (!plan.movable.length) return [];

  const capacity = doc.settings.daily_capacity;
  const load = new Map<Day, number>();
  for (const t of activeTopics(doc)) {
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

export type AgendaRow = {
  key: string;
  title: string;
  skill: Skill;
  /** "next" is committed. Anything else is projected on an unbroken run of OKs. */
  chip: string;
  committed: boolean;
  overdue: boolean;
};

export type AgendaGroup = { key: string; title: string; count: string; rows: AgendaRow[] };

function bucketKey(day: Day, horizon: Horizon): string {
  if (horizon === '2w') return day;
  if (horizon === '3m') return day.slice(0, 7);
  if (horizon === '1y') return day.slice(0, 7);
  return day.slice(0, 4);
}

/**
 * Only each topic's *next* review is real. Everything past it assumes an
 * unbroken run of OK ratings, and is marked as such wherever it appears.
 */
export function buildAgenda(
  doc: Doc,
  day: Day,
  horizon: Horizon,
  skillFilter: string | null,
  projectedDates: (topic: Topic, genre: Genre, count: number) => { day: Day; index: number }[],
): AgendaGroup[] {
  const end = addDays(day, HORIZONS.find((h) => h.key === horizon)!.days);
  const groups = new Map<string, AgendaGroup>();

  for (const topic of activeTopics(doc)) {
    const skill = skillById(doc, topic.skill_id)!;
    if (skillFilter && skill.id !== skillFilter) continue;

    for (const { day: on, index } of projectedDates(topic, skill.genre, 14)) {
      if (on > end) break;
      const overdue = index === 0 && daysBetween(on, day) > 0;
      const at = overdue ? day : on;
      if (at < day) continue;
      const key = bucketKey(at, horizon);
      if (!groups.has(key)) groups.set(key, { key, title: '', count: '', rows: [] });
      groups.get(key)!.rows.push({
        key: `${topic.id}-${index}`,
        title: topic.title,
        skill,
        chip: overdue ? 'overdue' : index === 0 ? 'next' : ordinal(index + 1),
        committed: index === 0,
        overdue,
      });
    }
  }

  return [...groups.values()]
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((g) => ({ ...g, count: `${g.rows.length} due` }));
}

export function badgeFor(skill: Skill): string {
  return genreBadge(skill.genre, skill.physical_kind);
}
