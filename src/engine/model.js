// Data model: skills (tracks), items (topics or SRS cards), review history.

import { addDays, todayISO } from './dates.js';
import { EASE_DEFAULT, firstInterval } from './curve.js';
import { usesPerItemSRS } from './genres.js';

let counter = 0;
export function newId(prefix = 'x') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export const STORE_VERSION = 1;

export function emptyStore() {
  return {
    version: STORE_VERSION,
    settings: {
      dailyCapacityItems: 6,
      preDeadlineWindowDays: 21,
      onboarded: false,
      theme: 'system',
    },
    skills: [],
    items: [],
    reviews: [],
    confusables: [],
  };
}

/**
 * @param {object} input
 * @param {string} input.name
 * @param {'language'|'reasoning'|'physical'|'conceptual'|'memorization'} input.genre
 * @param {'closed'|'open'|null} [input.physicalType]
 * @param {string} [input.level] - level / exam / goal context
 * @param {string|null} [input.targetDate] - ISO exam or performance date
 * @param {number} [input.calibration] - from the forgetting-rate diagnostic
 */
export function createSkill(input) {
  return {
    id: newId('sk'),
    name: input.name.trim(),
    genre: input.genre,
    physicalType: input.genre === 'physical' ? input.physicalType || 'closed' : null,
    blend: input.blend || [],
    level: input.level || '',
    targetDate: input.targetDate || null,
    calibration: input.calibration ?? 1,
    diagnostic: input.diagnostic || null,
    // Out of the way but not destroyed. Deleting is a separate, deliberate act
    // and can only reach something already archived.
    archived: false,
    createdAt: input.createdAt || todayISO(),
  };
}

/**
 * A trackable unit. `kind: 'topic'` for topic-level tracks (reasoning,
 * conceptual, physical); `kind: 'item'` for per-item SRS (memorization,
 * language) where each card carries its own ease factor.
 */
export function createItem(skill, input) {
  const exposure = input.firstExposure || todayISO();
  const interval = firstInterval(skill.genre, skill.calibration);

  return {
    id: newId('it'),
    skillId: skill.id,
    title: input.title.trim(),
    kind: usesPerItemSRS(skill.genre) ? 'item' : 'topic',
    subSkill: input.subSkill?.trim() || null,
    encoding: input.encoding?.trim() || null,
    cue: input.cue?.trim() || null,
    answer: input.answer?.trim() || null,
    notes: input.notes?.trim() || null,

    firstExposure: exposure,
    createdAt: exposure,

    // Scheduling state
    repetition: 0,
    intervalDays: interval,
    ease: EASE_DEFAULT,
    difficultyPenalty: 1,
    dueDate: addDays(exposure, interval),
    lastReviewed: null,

    // Rating streaks driving plateau / weak-point detection
    streakOK: 0,
    streakBad: 0,
    cleanStreak: 0,
    weakFlag: Boolean(input.shaky),
    priorityWeak: false,
    plateauFlag: false,

    formatIndex: 0,
    blockedSessions: 0,
    archived: false,
    history: [],
  };
}

// A syllabus pasted out of a PDF or an exam-board spec arrives numbered, so the
// marker is stripped. Deliberately strict: a bare leading number is left alone,
// because "3 sets of reps" is a title, not a list item.
const LIST_MARKER = /^\s*(?:[-*•–—]|\d+(?:\.\d+)+\.?|\d+[.)])\s+/;

/**
 * One item per line. Topic tracks take "title | sub-skill"; per-item decks take
 * "cue | answer | encoding".
 *
 * This exists because entering a subject one form submission at a time was the
 * activation wall — forty topics meant forty round trips before the app did
 * anything useful.
 */
export function parseBulkInput(text, { perItem = false } = {}) {
  return String(text || '')
    .split('\n')
    .map((line) => line.replace(LIST_MARKER, '').trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((p) => p.trim());
      if (!perItem) {
        const [title, subSkill] = parts;
        return { title, subSkill: subSkill || null };
      }
      const [cue, answer, encoding] = parts;
      return {
        title: answer ? `${cue} — ${answer}` : cue,
        cue,
        answer: answer || null,
        encoding: encoding || null,
      };
    })
    .filter((input) => input.title);
}

/** Derived status — never stored, always recomputed from streaks. */
export function itemStatus(item) {
  if (item.archived) return 'archived';
  if (item.priorityWeak) return 'priority-weak';
  if (item.weakFlag) return 'weak';
  if (item.plateauFlag) return 'plateau';
  return 'active';
}

export const STATUS_LABEL = {
  'priority-weak': 'Priority weak point',
  weak: 'Weak',
  plateau: 'Plateau',
  active: 'On track',
  archived: 'Archived',
};

/** Reviews that did not end in failure — a rough proxy for "independently solid". */
export function stability(item) {
  return item.history.filter((h) => h.rating !== 'failed').length;
}

export function linkConfusable(store, aId, bId, note = '') {
  if (aId === bId) return null;
  const exists = store.confusables.find(
    (c) => (c.a === aId && c.b === bId) || (c.a === bId && c.b === aId),
  );
  if (exists) return exists;
  const pair = { id: newId('cp'), a: aId, b: bId, note };
  store.confusables.push(pair);
  return pair;
}

export function confusablePartners(store, itemId) {
  return store.confusables
    .filter((c) => c.a === itemId || c.b === itemId)
    .map((c) => (c.a === itemId ? c.b : c.a))
    .map((id) => store.items.find((i) => i.id === id))
    .filter(Boolean);
}

export function getSkill(store, skillId) {
  return store.skills.find((s) => s.id === skillId) || null;
}

export function itemsForSkill(store, skillId) {
  return store.items.filter((i) => i.skillId === skillId && !i.archived);
}
