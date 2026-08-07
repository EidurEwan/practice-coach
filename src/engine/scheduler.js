// The scheduling engine: what to practise today, in what order, using what
// method — plus what each rating does to an item's future schedule.

import { addDays, diffDays, humanDate, shortDate, todayISO, weekday } from './dates.js';
import {
  PENALTY_FLOOR,
  WEAK_POINT_PENALTY,
  nextState,
  projectSchedule,
  projectUntil,
} from './curve.js';
import { requiresInterleaving, usesPerItemSRS } from './genres.js';
import {
  confusablePartners,
  createItem,
  getSkill,
  itemStatus,
  itemsForSkill,
  newId,
  stability,
} from './model.js';
import {
  canEscalateFormat,
  currentFormat,
  workUnits,
  practiceMethod,
} from './methods.js';

const BLOCKED_SESSION_LIMIT = 2;

// ---------------------------------------------------------------------------
// Deadline mode
// ---------------------------------------------------------------------------

/**
 * Once a target date is inside the window, practice shifts to timed,
 * exam/performance-format conditions (spec section 3).
 */
export function skillMode(skill, date = todayISO(), windowDays = 21) {
  if (!skill?.targetDate) return { mode: 'normal', daysToTarget: null };
  const daysToTarget = diffDays(date, skill.targetDate);
  if (daysToTarget < 0) return { mode: 'past-deadline', daysToTarget };
  if (daysToTarget <= windowDays) return { mode: 'pre-deadline', daysToTarget };
  return { mode: 'normal', daysToTarget };
}

export function isPreDeadline(store, skill, date) {
  return skillMode(skill, date, store.settings.preDeadlineWindowDays).mode === 'pre-deadline';
}

// ---------------------------------------------------------------------------
// Confusable-pair spacing
// ---------------------------------------------------------------------------

/**
 * Keep confusable pairs apart while either is still shaky, then deliberately
 * collide them once both are stable, to force discrimination.
 * Mutates due dates; returns the flags raised.
 */
export function applyConfusableSpacing(store, item) {
  const flags = [];
  for (const partner of confusablePartners(store, item.id)) {
    if (partner.archived || partner.dueDate !== item.dueDate) continue;

    const bothStable = stability(item) >= 2 && stability(partner) >= 2;
    if (bothStable) {
      flags.push({
        type: 'discrimination-drill',
        message: `Confusable pair — "${item.title}" and "${partner.title}" are both stable now, so they are deliberately scheduled together to force you to tell them apart.`,
      });
      continue;
    }

    // Push whichever is less established so each becomes independently solid.
    const target = stability(item) <= stability(partner) ? item : partner;
    target.dueDate = addDays(target.dueDate, 1);
    flags.push({
      type: 'confusable-separated',
      message: `Confusable pair — "${item.title}" and "${partner.title}" kept apart for now; "${target.title}" moved to ${humanDate(target.dueDate)} so each is solid on its own first.`,
    });
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Logging new material
// ---------------------------------------------------------------------------

/**
 * Log a topic/item the user studied today and give it a first review date.
 * @returns {{item: object, flags: object[], projection: string[]}}
 */
export function logNewItem(store, skillId, input) {
  const skill = getSkill(store, skillId);
  if (!skill) throw new Error(`Unknown skill ${skillId}`);

  const item = createItem(skill, input);
  const flags = [];

  // "Felt shaky" tightens the first interval and marks it for extra interleaving.
  if (input.shaky) {
    item.intervalDays = Math.max(1, Math.round(item.intervalDays * 0.7));
    item.dueDate = addDays(item.firstExposure, item.intervalDays);
    flags.push({
      type: 'weak',
      message: `${item.subSkill ? `"${item.subSkill}"` : 'This topic'} marked shaky — the next session targets it specifically before broadening back out.`,
    });
  }

  if (skill.genre === 'memorization' && !item.encoding) {
    flags.push({
      type: 'encoding-missing',
      message: 'No encoding recorded. Spaced repetition only works on something that was encoded well in the first place — add a mnemonic, acronym, story link, loci, or chunk grouping.',
    });
  }

  store.items.push(item);

  for (const otherId of input.confusableWith || []) {
    const pair = confusablePartners(store, item.id).some((p) => p.id === otherId);
    if (!pair) {
      store.confusables.push({ id: newId('cp'), a: item.id, b: otherId, note: '' });
    }
  }

  flags.push(...applyConfusableSpacing(store, item));

  if (isPreDeadline(store, skill, item.firstExposure)) {
    const { daysToTarget } = skillMode(skill, item.firstExposure, store.settings.preDeadlineWindowDays);
    flags.push({
      type: 'pre-deadline',
      message: `${skill.name} is ${daysToTarget} days from its target date. Adding new material now competes with consolidating what is already weak — prioritise timed practice on overdue and weak topics.`,
    });
  }

  if (requiresInterleaving(skill.genre) && itemsForSkill(store, skill.id).length < 2) {
    flags.push({
      type: 'needs-interleave-partner',
      message: `${skill.name} only has one topic logged. ${skill.genre === 'reasoning' ? 'Reasoning' : 'Conceptual'} reviews should never happen in isolation — log a second topic so reviews can be interleaved.`,
    });
  }

  return {
    item,
    flags,
    projection: projectSchedule(item, skill.genre, skill.calibration, 5),
  };
}

// ---------------------------------------------------------------------------
// Reviewing
// ---------------------------------------------------------------------------

/** Guardrail: don't let the user re-drill something that isn't due. */
export function canReview(store, item, date = todayISO()) {
  if (item.dueDate <= date) return { allowed: true };
  return {
    allowed: false,
    reason: 'not-due',
    message: `"${item.title}" is not due until ${humanDate(item.dueDate, date)}. Re-drilling it today buys fluency you already have and wastes the spacing effect.`,
  };
}

/**
 * Apply a rating to an item. `recallAttempt` is retained on the review record
 * for history written by earlier versions, which required a typed retrieval
 * attempt before rating; it is optional and normally empty.
 */
export function reviewItem(store, itemId, options = {}) {
  const { rating, recallAttempt = '', date = todayISO(), override = false } = options;
  const item = store.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Unknown item ${itemId}`);
  const skill = getSkill(store, item.skillId);

  const gate = canReview(store, item, date);
  if (!gate.allowed && !override) {
    return {
      blocked: true,
      reason: gate.reason,
      message: gate.message,
      dueInstead: dueItems(store, date).map((i) => i.title),
    };
  }

  const flags = [];
  const intervalBefore = item.intervalDays;
  const formatBefore = currentFormat(item, skill);

  // --- streaks (computed before the interval so a new weak-point penalty applies now)
  item.streakOK = rating === 'ok' ? item.streakOK + 1 : 0;
  if (rating === 'hard' || rating === 'failed') {
    item.streakBad += 1;
    item.cleanStreak = 0;
  } else {
    item.streakBad = 0;
    item.cleanStreak += 1;
  }

  if (rating === 'failed') {
    item.weakFlag = true;
    flags.push({
      type: 'reset',
      message: `Failed — "${item.title}" resets to a 1-day interval and joins the weak list, so it gets interleaved more often until it holds.`,
    });
  }
  if (item.cleanStreak >= 2) item.weakFlag = false;
  if (rating !== 'ok') item.plateauFlag = false;

  // 3 hard/failed in a row: shorten the interval permanently, not just once.
  if (item.streakBad >= 3) {
    const alreadyFlagged = item.priorityWeak;
    item.priorityWeak = true;
    item.difficultyPenalty = Math.max(PENALTY_FLOOR, item.difficultyPenalty * WEAK_POINT_PENALTY);
    flags.push({
      type: 'priority-weak',
      message: alreadyFlagged
        ? `"${item.title}" is still failing (${item.streakBad} sessions running). Intervals shortened again — now at ${Math.round(item.difficultyPenalty * 100)}% of normal spacing.`
        : `"${item.title}" has been hard or failed ${item.streakBad} sessions running. Flagged as a priority weak point and its intervals are now permanently shortened to ${Math.round(item.difficultyPenalty * 100)}% of normal.`,
    });
    flags.push({
      type: 'decompose',
      message: `Which part of "${item.title}" is actually failing? Target that sub-skill next session rather than redoing the whole topic.`,
    });
  }
  if (item.cleanStreak >= 3) item.priorityWeak = false;

  // --- plateau: three "OK"s running is stalling, not stability.
  if (item.streakOK >= 3) {
    item.plateauFlag = true;
    const escalated = canEscalateFormat(item, skill);
    if (escalated) item.formatIndex += 1;
    item.streakOK = 0;
    flags.push({
      type: 'plateau',
      message: escalated
        ? `Plateau — "${item.title}" has been "OK" three sessions running with no movement. Practice format changes from ${formatBefore} to ${currentFormat(item, skill)}.`
        : `Plateau — "${item.title}" has been "OK" three sessions running and is already at the hardest format. Time for external feedback: a teacher, a coach, or a marked past paper.`,
    });
  }

  // --- interval
  const updated = nextState(
    {
      repetition: item.repetition,
      intervalDays: item.intervalDays,
      ease: item.ease,
      difficultyPenalty: item.difficultyPenalty,
    },
    rating,
    { genre: skill.genre, calibration: skill.calibration },
  );

  item.repetition = updated.repetition;
  item.intervalDays = updated.intervalDays;
  item.ease = updated.ease;
  item.lastReviewed = date;
  item.dueDate = addDays(date, item.intervalDays);

  if (skill.genre === 'physical' && skill.physicalType !== 'open') {
    item.blockedSessions += 1;
    if (item.blockedSessions === BLOCKED_SESSION_LIMIT) {
      flags.push({
        type: 'format-shift',
        message: `"${item.title}" has had its ${BLOCKED_SESSION_LIMIT} blocked sessions. From here it moves to randomized practice — mixed with other sub-skills, never two of the same in a row.`,
      });
    }
  }

  flags.push(...applyConfusableSpacing(store, item));

  if (isPreDeadline(store, skill, date)) {
    const { daysToTarget } = skillMode(skill, date, store.settings.preDeadlineWindowDays);
    flags.push({
      type: 'pre-deadline',
      message: `${skill.name}: ${daysToTarget} days to target — this review runs in timed, ${skill.genre === 'physical' ? 'performance' : 'exam'}-format conditions.`,
    });
  }

  const entry = {
    date,
    rating,
    recallAttempt,
    intervalBefore,
    intervalAfter: item.intervalDays,
    ease: item.ease,
    format: currentFormat(item, skill),
  };
  item.history.push(entry);
  store.reviews.push({ id: newId('rv'), itemId: item.id, skillId: skill.id, ...entry });

  return {
    blocked: false,
    item,
    skill,
    flags,
    date,
    nextDate: item.dueDate,
    projection: projectSchedule(item, skill.genre, skill.calibration, 5),
  };
}

/**
 * What a rating would do to this item, without doing it. Mirrors the interval
 * arithmetic in reviewItem exactly — including the permanent penalty that a
 * third consecutive hard/failed applies — so the buttons can show the real
 * consequence before the user commits to one.
 */
export function previewRating(store, item, rating) {
  const skill = getSkill(store, item.skillId);
  if (!skill) return null;

  let penalty = item.difficultyPenalty;
  const streakBad = rating === 'hard' || rating === 'failed' ? item.streakBad + 1 : 0;
  if (streakBad >= 3) penalty = Math.max(PENALTY_FLOOR, penalty * WEAK_POINT_PENALTY);

  const next = nextState(
    {
      repetition: item.repetition,
      intervalDays: item.intervalDays,
      ease: item.ease,
      difficultyPenalty: penalty,
    },
    rating,
    { genre: skill.genre, calibration: skill.calibration },
  );
  return next.intervalDays;
}

/**
 * Everything reviewItem can mutate, deep-copied. Ratings are irreversible
 * otherwise, and a mis-tap would silently rewrite a schedule.
 */
export function snapshotSchedule(store) {
  return {
    items: JSON.parse(JSON.stringify(store.items)),
    reviews: JSON.parse(JSON.stringify(store.reviews)),
  };
}

export function restoreSchedule(store, snapshot) {
  if (!snapshot) return false;
  store.items = JSON.parse(JSON.stringify(snapshot.items));
  store.reviews = JSON.parse(JSON.stringify(snapshot.reviews));
  return true;
}

// ---------------------------------------------------------------------------
// Session building
// ---------------------------------------------------------------------------

export function dueItems(store, date = todayISO()) {
  return store.items.filter((i) => !i.archived && i.dueDate <= date);
}

export function overdueItems(store, date = todayISO()) {
  return store.items.filter((i) => !i.archived && i.dueDate < date);
}

function byOldestTouched(a, b) {
  const aKey = a.lastReviewed || a.createdAt;
  const bKey = b.lastReviewed || b.createdAt;
  return aKey.localeCompare(bKey);
}

/**
 * Find an older, unrelated topic to interleave with. Prefers another topic
 * already in today's session; otherwise pulls in a light "booster" touch on an
 * older topic that is not otherwise due (which does not alter its schedule).
 */
export function pickInterleavePartner(store, item, sessionIds) {
  const differentSubSkill = (c) => !item.subSkill || !c.subSkill || c.subSkill !== item.subSkill;
  const choose = (list) => list.find(differentSubSkill) || list[0] || null;

  const siblings = itemsForSkill(store, item.skillId).filter((c) => c.id !== item.id);

  const inSession = choose(siblings.filter((c) => sessionIds.has(c.id)).sort(byOldestTouched));
  if (inSession) return { item: inSession, kind: 'due' };

  const booster = choose(siblings.filter((c) => c.repetition > 0).sort(byOldestTouched))
    || choose(siblings.slice().sort(byOldestTouched));
  if (booster) return { item: booster, kind: 'booster' };

  const crossSkill = choose(
    store.items
      .filter((c) => !c.archived && c.id !== item.id && c.skillId !== item.skillId)
      .sort(byOldestTouched),
  );
  if (crossSkill) return { item: crossSkill, kind: 'cross-skill' };

  return null;
}

const RANK = { overdue: 0, 'priority-weak': 1, weak: 2, 'pre-deadline': 3, plateau: 4, normal: 5 };

/** Ordering key for the practice card: overdue first, then weakest, then the rest. */
function rankFor(status, overdueDays, preDeadline) {
  if (overdueDays > 0) return RANK.overdue;
  if (status === 'priority-weak') return RANK['priority-weak'];
  if (status === 'weak') return RANK.weak;
  if (preDeadline) return RANK['pre-deadline'];
  if (status === 'plateau') return RANK.plateau;
  return RANK.normal;
}

/**
 * Build today's practice card: ordered blocks, methods, timings, warnings.
 * Pure — it reads the store and never mutates it, so it is safe to call on
 * every render. Anything that would change state is returned as an action.
 */
export function buildSession(store, date = todayISO()) {
  const capacity = store.settings.dailyCapacityItems;
  const due = dueItems(store, date);
  const sessionIds = new Set(due.map((i) => i.id));

  const topicEntries = [];
  const batches = new Map();

  for (const item of due) {
    const skill = getSkill(store, item.skillId);
    if (!skill) continue;
    if (usesPerItemSRS(skill.genre)) {
      if (!batches.has(skill.id)) batches.set(skill.id, { skill, items: [] });
      batches.get(skill.id).items.push(item);
    } else {
      topicEntries.push({ skill, item });
    }
  }

  const blocks = [];

  for (const { skill, item } of topicEntries) {
    const overdueDays = Math.max(0, diffDays(item.dueDate, date));
    const status = itemStatus(item);
    const preDeadline = isPreDeadline(store, skill, date);
    const partner = requiresInterleaving(skill.genre)
      ? pickInterleavePartner(store, item, sessionIds)
      : null;

    const flags = [];
    if (overdueDays > 0) {
      flags.push({
        type: 'overdue',
        message: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'} — do this first, before anything scheduled for today.`,
      });
    }
    if (status === 'plateau') {
      flags.push({
        type: 'plateau',
        message: `Plateau flagged — running at ${currentFormat(item, skill)} instead of repeating the previous format.`,
      });
    }
    if (status === 'priority-weak') {
      flags.push({
        type: 'priority-weak',
        message: `Priority weak point — spacing permanently shortened to ${Math.round(item.difficultyPenalty * 100)}% of normal.`,
      });
    }
    if (requiresInterleaving(skill.genre) && !partner) {
      flags.push({
        type: 'no-partner',
        message: 'Nothing available to interleave with. Log another topic in this skill — reviewing it alone trains recall but not discrimination.',
      });
    }
    if (partner?.kind === 'cross-skill') {
      flags.push({
        type: 'weak-interleave',
        message: `Interleaving across skills (${getSkill(store, partner.item.skillId)?.name}) because this skill has no other topic yet.`,
      });
    }

    blocks.push({
      id: item.id,
      kind: 'topic',
      skill,
      item,
      items: [item],
      status,
      overdueDays,
      preDeadline,
      rank: rankFor(status, overdueDays, preDeadline),
      method: practiceMethod(item, skill, { preDeadline, interleaveWith: partner?.item || null }),
      interleaveWith: partner,
      units: workUnits(item, skill),
      flags,
    });
  }

  for (const { skill, items } of batches.values()) {
    const overdueDays = Math.max(...items.map((i) => Math.max(0, diffDays(i.dueDate, date))));
    const preDeadline = isPreDeadline(store, skill, date);
    const weak = items.filter((i) => itemStatus(i) !== 'active');
    const lead = items[0];

    const flags = [];
    if (overdueDays > 0) {
      flags.push({
        type: 'overdue',
        message: `${items.filter((i) => i.dueDate < date).length} item(s) overdue by up to ${overdueDays} day(s) — clear these first.`,
      });
    }
    if (weak.length) {
      flags.push({
        type: 'weak',
        message: `${weak.length} item(s) flagged weak or plateaued: ${weak.slice(0, 4).map((i) => i.title).join(', ')}${weak.length > 4 ? '…' : ''}. Do these first while attention is fresh.`,
      });
    }
    const unencoded = items.filter((i) => skill.genre === 'memorization' && !i.encoding);
    if (unencoded.length) {
      flags.push({
        type: 'encoding-missing',
        message: `${unencoded.length} item(s) have no encoding. Give each a mnemonic or chunk before drilling it again.`,
      });
    }

    blocks.push({
      id: `batch_${skill.id}`,
      kind: 'batch',
      skill,
      item: lead,
      items: items.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byOldestTouched(a, b)),
      status: weak.length ? 'weak' : 'active',
      overdueDays,
      preDeadline,
      rank: rankFor(weak.length ? 'weak' : 'active', overdueDays, preDeadline),
      method: practiceMethod(lead, skill, { preDeadline, itemCount: items.length }),
      interleaveWith: null,
      units: workUnits(lead, skill, { itemCount: items.length }),
      flags,
    });
  }

  blocks.sort(
    (a, b) => a.rank - b.rank
      || b.overdueDays - a.overdueDays
      || a.item.dueDate.localeCompare(b.item.dueDate)
      || a.skill.name.localeCompare(b.skill.name),
  );

  const totalUnits = blocks.reduce((sum, b) => sum + b.units, 0);
  const warnings = [];
  const actions = [];

  // --- confusable pairs colliding in today's session
  for (const pair of store.confusables) {
    const a = store.items.find((i) => i.id === pair.a);
    const b = store.items.find((i) => i.id === pair.b);
    if (!a || !b || !sessionIds.has(a.id) || !sessionIds.has(b.id)) continue;

    if (stability(a) >= 2 && stability(b) >= 2) {
      warnings.push({
        level: 'info',
        type: 'discrimination-drill',
        message: `Discrimination drill: "${a.title}" and "${b.title}" are confusable and both stable, so practise them back to back with the labels hidden — the point is telling them apart.`,
      });
    } else {
      const later = stability(a) <= stability(b) ? a : b;
      warnings.push({
        level: 'warn',
        type: 'confusable-collision',
        message: `"${a.title}" and "${b.title}" are confusable and at least one is still shaky. Practising them together now risks blurring both — push "${later.title}" to tomorrow.`,
      });
      actions.push({ type: 'defer', itemId: later.id, days: 1, label: `Push "${later.title}" to tomorrow` });
    }
  }

  // --- daily load cap
  if (totalUnits > capacity) {
    const deferrable = blocks
      .filter((b) => b.overdueDays === 0 && b.status !== 'priority-weak')
      .sort((a, b) => b.rank - a.rank);

    const overflow = [];
    let projected = totalUnits;
    for (const block of deferrable) {
      if (projected <= capacity) break;
      overflow.push(block.id);
      projected -= block.units;
    }

    warnings.push({
      level: 'warn',
      type: 'overload',
      message: `${totalUnits} due against your cap of ${capacity}. ${
        overflow.length
          ? `${overflow.length} non-urgent block(s) can move to tomorrow, bringing today to ~${projected} min.`
          : 'Everything due today is overdue or a priority weak point, so none of it should move — consider a longer session or splitting it across the day.'
      }`,
      overflow,
    });
    if (overflow.length) {
      actions.push({ type: 'redistribute', blockIds: overflow, label: 'Redistribute to tomorrow' });
    }
  }

  // --- deadline modes
  const modes = store.skills
    .map((skill) => ({ skill, ...skillMode(skill, date, store.settings.preDeadlineWindowDays) }))
    .filter((m) => m.mode !== 'normal');

  for (const m of modes) {
    if (m.mode === 'pre-deadline') {
      warnings.push({
        level: 'info',
        type: 'pre-deadline',
        message: `${m.skill.name}: ${m.daysToTarget} day${m.daysToTarget === 1 ? '' : 's'} to target date — pre-deadline mode is on. Practice runs timed and in ${m.skill.genre === 'physical' ? 'performance' : 'exam'} format, and weak/overdue topics take priority over new material.`,
      });
    }
  }

  const overdueCount = blocks.reduce((n, b) => n + (b.overdueDays > 0 ? 1 : 0), 0);
  if (overdueCount > 0) {
    warnings.unshift({
      level: 'warn',
      type: 'overdue',
      message: `${overdueCount} ${overdueCount === 1 ? 'item is' : 'items are'} overdue. Those come first — the longer they sit, the more they cost.`,
    });
  }

  return { date, blocks, totalUnits, capacity, warnings, actions, modes, overdueCount };
}

// ---------------------------------------------------------------------------
// Actions the session can suggest
// ---------------------------------------------------------------------------

export function deferItem(store, itemId, days = 1) {
  const item = store.items.find((i) => i.id === itemId);
  if (!item) return null;
  item.dueDate = addDays(item.dueDate, days);
  return item;
}

/** Push the given session blocks back a day to get under the daily cap. */
export function redistribute(store, blockIds, date = todayISO()) {
  const session = buildSession(store, date);
  const wanted = new Set(blockIds);
  const moved = [];
  for (const block of session.blocks) {
    if (!wanted.has(block.id)) continue;
    for (const item of block.items) {
      item.dueDate = addDays(date, 1);
      moved.push(item);
    }
  }
  return moved;
}

/** Record which sub-skill of a topic was the hard part (spec section 4). */
export function setSubSkill(store, itemId, subSkill) {
  const item = store.items.find((i) => i.id === itemId);
  if (!item) return null;
  item.subSkill = subSkill?.trim() || null;
  return item;
}

// ---------------------------------------------------------------------------
// Long-range forecast
// ---------------------------------------------------------------------------

export const HORIZONS = [
  { id: '2w', label: '2 weeks', days: 14 },
  { id: '3m', label: '3 months', days: 92 },
  { id: '1y', label: '1 year', days: 365 },
  { id: '5y', label: '5 years', days: 1826 },
];

/** Keep the row count readable: 5 years is 20 quarters, not 1,826 days. */
export function granularityFor(days) {
  if (days <= 21) return 'day';
  if (days <= 120) return 'week';
  if (days <= 760) return 'month';
  return 'quarter';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucketKey(date, fromDate, granularity) {
  if (granularity === 'day') return date;
  if (granularity === 'week') return `w${Math.floor(diffDays(fromDate, date) / 7)}`;
  if (granularity === 'month') return date.slice(0, 7);
  const [y, m] = date.split('-');
  return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
}

/** Every bucket across the horizon, including empty ones — gaps are signal. */
function bucketList(fromDate, until, granularity) {
  const out = [];
  if (granularity === 'day') {
    for (let d = fromDate; d <= until; d = addDays(d, 1)) {
      out.push({ key: d, start: d, end: d, label: d === fromDate ? 'Today' : `${weekday(d)} ${shortDate(d)}` });
    }
    return out;
  }
  if (granularity === 'week') {
    for (let i = 0; ; i += 1) {
      const start = addDays(fromDate, i * 7);
      if (start > until) break;
      const end = addDays(start, 6);
      out.push({ key: `w${i}`, start, end, label: i === 0 ? 'This week' : `${shortDate(start)} – ${shortDate(end)}` });
    }
    return out;
  }
  if (granularity === 'month') {
    let [y, m] = fromDate.split('-').map(Number);
    while (true) {
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      if (start > until) break;
      out.push({ key: start.slice(0, 7), start, end: monthEnd(y, m), label: `${MONTH_NAMES[m - 1]} ${y}` });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }
  let y = Number(fromDate.slice(0, 4));
  let q = Math.floor((Number(fromDate.slice(5, 7)) - 1) / 3) + 1;
  while (true) {
    const startMonth = (q - 1) * 3 + 1;
    const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    if (start > until) break;
    out.push({ key: `${y}-Q${q}`, start, end: monthEnd(y, startMonth + 2), label: `Q${q} ${y}` });
    q += 1;
    if (q > 4) { q = 1; y += 1; }
  }
  return out;
}

function monthEnd(y, m) {
  let year = y;
  let month = m;
  while (month > 12) { month -= 12; year += 1; }
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Split a bucket's reviews by skill, and by date within each skill, so the UI
 * can answer "what am I reviewing, on which day, for which skill" directly
 * rather than showing a bare count.
 */
function groupBySkill(entries) {
  const bySkill = new Map();
  for (const e of entries) {
    if (!bySkill.has(e.skill.id)) bySkill.set(e.skill.id, { skill: e.skill, entries: [], days: new Map() });
    const group = bySkill.get(e.skill.id);
    group.entries.push(e);
    if (!group.days.has(e.date)) group.days.set(e.date, []);
    group.days.get(e.date).push(e);
  }
  return [...bySkill.values()]
    .map((g) => ({
      skill: g.skill,
      count: g.entries.length,
      entries: g.entries.sort((a, b) => a.date.localeCompare(b.date)),
      days: [...g.days.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, items]) => ({ date, items })),
    }))
    .sort((a, b) => b.count - a.count || a.skill.name.localeCompare(b.skill.name));
}

/**
 * Projected review load out to any horizon. Only each item's first entry is a
 * committed due date — everything after it assumes an unbroken run of "OK"
 * ratings, so callers must present it as a forecast.
 */
export function projectLoad(store, fromDate = todayISO(), horizonDays = 14, options = {}) {
  const { skillId = null } = options;
  const until = addDays(fromDate, horizonDays);
  const granularity = granularityFor(horizonDays);
  const buckets = bucketList(fromDate, until, granularity);
  const index = new Map(buckets.map((b) => [b.key, { ...b, entries: [], count: 0, skills: [] }]));

  for (const item of store.items) {
    if (item.archived) continue;
    if (skillId && item.skillId !== skillId) continue;
    const skill = getSkill(store, item.skillId);
    if (!skill) continue;
    const hits = projectUntil(item, skill.genre, skill.calibration, until, { from: fromDate });
    for (const hit of hits) {
      const bucket = index.get(bucketKey(hit.date, fromDate, granularity));
      if (bucket) bucket.entries.push({ item, skill, ...hit });
    }
  }

  const rows = [...index.values()];
  for (const bucket of rows) {
    bucket.count = bucket.entries.length;
    bucket.skills = groupBySkill(bucket.entries);
  }

  const totalReviews = rows.reduce((n, b) => n + b.count, 0);
  const skillTotals = groupBySkill(rows.flatMap((b) => b.entries))
    .map(({ skill, count }) => ({ skill, count }));

  return {
    granularity,
    from: fromDate,
    until,
    horizonDays,
    buckets: rows,
    totalReviews,
    skillTotals,
    skillId,
    committed: dueItems(store, fromDate)
      .filter((i) => !skillId || i.skillId === skillId).length,
  };
}

/** Full projected review dates for a single item, for its detail row. */
export function projectItem(store, itemId, fromDate = todayISO(), horizonDays = 1826) {
  const item = store.items.find((i) => i.id === itemId);
  if (!item) return [];
  const skill = getSkill(store, item.skillId);
  if (!skill) return [];
  return projectUntil(item, skill.genre, skill.calibration, addDays(fromDate, horizonDays), { from: fromDate });
}
