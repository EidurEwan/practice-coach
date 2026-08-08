import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, diffDays } from '../src/engine/dates.js';
import {
  BASE_CURVE,
  TIGHT_CURVE,
  calibrationFromDiagnostic,
  curveUpdate,
  sm2Update,
} from '../src/engine/curve.js';
import { detectGenre, usesPerItemSRS, requiresInterleaving } from '../src/engine/genres.js';
import { createSkill, emptyStore, itemStatus, linkConfusable } from '../src/engine/model.js';
import {
  buildSession,
  canReview,
  granularityFor,
  logNewItem,
  previewRating,
  projectItem,
  projectLoad,
  overdueItems,
  dueBlockCount,
  dueItems,
  redistribute,
  restoreSchedule,
  setSkillSuspended,
  setTargetDate,
  skillSuspended,
  snapshotSchedule,
  reviewItem,
  skillMode,
} from '../src/engine/scheduler.js';
import { currentFormat } from '../src/engine/methods.js';
import { formatLogCard, formatSessionCard } from '../src/engine/card.js';

const D0 = '2026-01-05';

function setup(skillInput) {
  const store = emptyStore();
  const skill = createSkill({ createdAt: D0, ...skillInput });
  store.skills.push(skill);
  return { store, skill };
}

/** Review an item on the day it is due, over and over. */
function drill(store, itemId, ratings, startDate = D0) {
  let date = startDate;
  const results = [];
  for (const rating of ratings) {
    const item = store.items.find((i) => i.id === itemId);
    date = item.dueDate;
    results.push(reviewItem(store, itemId, { rating, recallAttempt: 'x', date }));
  }
  return results;
}

// ---------------------------------------------------------------------------
test('dates: addDays and diffDays are day-exact across a DST boundary', () => {
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(diffDays('2026-03-30', '2026-03-28'), -2);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('genre detection maps names to genres and infers open vs closed', () => {
  assert.equal(detectGenre('AQA A-Level Maths').genre, 'reasoning');
  assert.equal(detectGenre('Spanish').genre, 'language');
  assert.equal(detectGenre('Periodic table').genre, 'memorization');
  assert.equal(detectGenre('Cell Biology').genre, 'conceptual');

  const tennis = detectGenre('Tennis return');
  assert.equal(tennis.genre, 'physical');
  assert.equal(tennis.physicalType, 'open');

  const guitar = detectGenre('Guitar scales');
  assert.equal(guitar.genre, 'physical');
  assert.equal(guitar.physicalType, 'closed');

  assert.equal(detectGenre('Underwater basket weaving').genre, null);
});

test('genre routing: which tracks are per-item SRS and which must interleave', () => {
  assert.ok(usesPerItemSRS('memorization') && usesPerItemSRS('language'));
  assert.ok(!usesPerItemSRS('reasoning'));
  assert.ok(requiresInterleaving('reasoning') && requiresInterleaving('conceptual'));
  assert.ok(!requiresInterleaving('physical'));
});

// ---------------------------------------------------------------------------
test('base curve follows 1 -> 3 -> 7 -> 16 -> 35 on straight "OK" ratings', () => {
  let state = { repetition: 0, intervalDays: 1, ease: 2.5, difficultyPenalty: 1 };
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    state = { ...curveUpdate(state, 'ok', { genre: 'memorization', calibration: 1 }), difficultyPenalty: 1 };
    seen.push(state.intervalDays);
  }
  assert.deepEqual(seen, BASE_CURVE.slice(1, 6));
});

test('reasoning and conceptual topics use the compressed 1 -> 2 -> 5 -> 10 curve', () => {
  let state = { repetition: 0, intervalDays: 1, ease: 2.5, difficultyPenalty: 1 };
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    state = { ...curveUpdate(state, 'ok', { genre: 'reasoning', calibration: 1 }), difficultyPenalty: 1 };
    seen.push(state.intervalDays);
  }
  assert.deepEqual(seen, TIGHT_CURVE.slice(1, 5));
});

test('confidence adjustment: easy stretches, hard shrinks, failed resets to 1', () => {
  const base = { repetition: 2, intervalDays: 7, ease: 2.5, difficultyPenalty: 1 };
  const opts = { genre: 'conceptual', calibration: 1 };

  const ok = curveUpdate(base, 'ok', opts);
  const easy = curveUpdate(base, 'easy', opts);
  const hard = curveUpdate(base, 'hard', opts);
  const failed = curveUpdate(base, 'failed', opts);

  assert.ok(easy.intervalDays > ok.intervalDays, 'easy must schedule further out than ok');
  assert.ok(hard.intervalDays < ok.intervalDays, 'hard must schedule sooner than ok');
  assert.equal(failed.intervalDays, 1);
  assert.equal(failed.repetition, 0);
  assert.ok(failed.ease < base.ease);
});

test('SM-2 gives each item its own ease factor rather than averaging a topic', () => {
  const start = { repetition: 0, intervalDays: 1, ease: 2.5, difficultyPenalty: 1 };

  let easyItem = start;
  let hardItem = start;
  for (let i = 0; i < 3; i += 1) {
    easyItem = { ...sm2Update(easyItem, 'easy'), difficultyPenalty: 1 };
    hardItem = { ...sm2Update(hardItem, 'hard'), difficultyPenalty: 1 };
  }

  assert.ok(easyItem.ease > 2.5, 'easy items drift up in ease');
  assert.ok(hardItem.ease < 2.5, 'hard items drift down in ease');
  assert.ok(easyItem.intervalDays > hardItem.intervalDays);

  const lapsed = sm2Update({ repetition: 5, intervalDays: 40, ease: 2.5, difficultyPenalty: 1 }, 'failed');
  assert.equal(lapsed.intervalDays, 1);
  assert.equal(lapsed.repetition, 0);
});

test('never schedules a repeat sooner than one sleep cycle', () => {
  const punished = { repetition: 0, intervalDays: 1, ease: 1.3, difficultyPenalty: 0.4 };
  const next = curveUpdate(punished, 'hard', { genre: 'reasoning', calibration: 0.6 });
  assert.ok(next.intervalDays >= 1);
});

// ---------------------------------------------------------------------------
test('diagnostic compresses intervals for fast forgetters and stretches for retainers', () => {
  const fast = calibrationFromDiagnostic([{ daysSince: 3, score: 0.2 }, { daysSince: 3, score: 0 }]);
  const average = calibrationFromDiagnostic([{ daysSince: 3, score: 0.65 }]);
  const strong = calibrationFromDiagnostic([{ daysSince: 7, score: 1 }, { daysSince: 5, score: 1 }]);

  assert.ok(fast < 0.9, `expected compression, got ${fast}`);
  assert.ok(average > 0.9 && average < 1.15, `expected ~1.0, got ${average}`);
  assert.ok(strong > 1.2, `expected stretch, got ${strong}`);
  assert.equal(calibrationFromDiagnostic([]), 1);
});

test('calibration actually scales the first review date', () => {
  const slow = setup({ name: 'Cell Biology', genre: 'conceptual', calibration: 0.6 });
  const fastRetainer = setup({ name: 'Cell Biology', genre: 'conceptual', calibration: 1.5 });

  const a = logNewItem(slow.store, slow.skill.id, { title: 'Mitosis', firstExposure: D0 });
  const b = logNewItem(fastRetainer.store, fastRetainer.skill.id, { title: 'Mitosis', firstExposure: D0 });

  drill(slow.store, a.item.id, ['ok', 'ok']);
  drill(fastRetainer.store, b.item.id, ['ok', 'ok']);

  assert.ok(
    a.item.intervalDays < b.item.intervalDays,
    `fast forgetter should review sooner (${a.item.intervalDays} vs ${b.item.intervalDays})`,
  );
});

// ---------------------------------------------------------------------------
test('logging a topic schedules a first review and projects the full curve', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const { item, projection } = logNewItem(store, skill.id, {
    title: 'Proofs',
    subSkill: 'induction',
    firstExposure: D0,
    shaky: true,
  });

  assert.equal(item.dueDate, addDays(D0, 1));
  assert.equal(item.subSkill, 'induction');
  assert.equal(itemStatus(item), 'weak', 'a shaky sub-skill starts on the weak list');
  assert.equal(projection.length, 5);
  assert.ok(projection.every((d, i) => i === 0 || d > projection[i - 1]), 'projection expands');
});

test('memorization items without an encoding are flagged at first exposure', () => {
  const { store, skill } = setup({ name: 'Periodic table', genre: 'memorization' });
  const bare = logNewItem(store, skill.id, { title: 'Group 1 metals', firstExposure: D0 });
  const encoded = logNewItem(store, skill.id, {
    title: 'Group 2 metals',
    encoding: 'Beer Mugs Can Serve Barmen',
    firstExposure: D0,
  });

  assert.ok(bare.flags.some((f) => f.type === 'encoding-missing'));
  assert.ok(!encoded.flags.some((f) => f.type === 'encoding-missing'));
});

// ---------------------------------------------------------------------------
test('cram guard blocks a re-drill of something that is not due', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  const { item } = logNewItem(store, skill.id, { title: 'ser vs estar', firstExposure: D0 });
  drill(store, item.id, ['ok', 'ok', 'ok']);

  const gate = canReview(store, item, D0);
  assert.equal(gate.allowed, false);

  const blocked = reviewItem(store, item.id, { rating: 'ok', date: D0 });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, 'not-due');

  const forced = reviewItem(store, item.id, { rating: 'ok', date: D0, override: true });
  assert.equal(forced.blocked, false, 'explicit override is still possible');
});

test('a failed rating resets the interval and marks the topic weak', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const { item } = logNewItem(store, skill.id, { title: 'Integration by parts', firstExposure: D0 });

  drill(store, item.id, ['ok', 'ok']);
  assert.ok(item.intervalDays > 1);

  const [result] = drill(store, item.id, ['failed']);
  assert.equal(item.intervalDays, 1);
  assert.equal(itemStatus(item), 'weak');
  assert.ok(result.flags.some((f) => f.type === 'reset'));
});

test('three hard/failed sessions running permanently shortens the interval', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const { item } = logNewItem(store, skill.id, { title: 'Vectors', firstExposure: D0 });

  drill(store, item.id, ['hard', 'hard']);
  assert.equal(item.difficultyPenalty, 1, 'no permanent penalty before the third strike');

  const [third] = drill(store, item.id, ['hard']);
  assert.equal(itemStatus(item), 'priority-weak');
  assert.ok(item.difficultyPenalty < 1);
  assert.ok(third.flags.some((f) => f.type === 'priority-weak'));
  assert.ok(third.flags.some((f) => f.type === 'decompose'), 'asks which sub-skill is failing');

  // Recovering clears the flag but keeps the shortened spacing.
  const penaltyAfterStrikes = item.difficultyPenalty;
  drill(store, item.id, ['ok', 'ok', 'ok']);
  assert.equal(itemStatus(item), 'plateau');
  assert.equal(item.difficultyPenalty, penaltyAfterStrikes, 'penalty is permanent');
});

test('three "OK"s running is treated as a plateau and changes the practice format', () => {
  const { store, skill } = setup({ name: 'Cell Biology', genre: 'conceptual' });
  const { item } = logNewItem(store, skill.id, { title: 'Osmosis', firstExposure: D0 });

  const before = currentFormat(item, skill);
  drill(store, item.id, ['ok', 'ok']);
  assert.equal(itemStatus(item), 'active');

  const [third] = drill(store, item.id, ['ok']);
  assert.equal(itemStatus(item), 'plateau');
  assert.notEqual(currentFormat(item, skill), before, 'format escalates instead of repeating');
  assert.ok(third.flags.some((f) => f.type === 'plateau'));

  // A non-"OK" result means the new format produced a real signal; clear it.
  drill(store, item.id, ['hard']);
  assert.notEqual(itemStatus(item), 'plateau');
});

test('a plateau at the top of the ladder asks for external feedback', () => {
  const { store, skill } = setup({ name: 'Cell Biology', genre: 'conceptual' });
  const { item } = logNewItem(store, skill.id, { title: 'Krebs cycle', firstExposure: D0 });
  item.formatIndex = 99; // already at the hardest format

  const results = drill(store, item.id, ['ok', 'ok', 'ok']);
  const plateau = results.at(-1).flags.find((f) => f.type === 'plateau');
  assert.ok(plateau);
  assert.match(plateau.message, /external feedback/i);
});

// ---------------------------------------------------------------------------
test('closed physical skills start blocked then switch to randomized', () => {
  const { store, skill } = setup({ name: 'Guitar', genre: 'physical', physicalType: 'closed' });
  const { item } = logNewItem(store, skill.id, { title: 'A minor pentatonic', firstExposure: D0 });

  let session = buildSession(store, addDays(D0, 1));
  assert.equal(session.blocks[0].method.label, 'Blocked practice');

  drill(store, item.id, ['ok', 'ok']);
  session = buildSession(store, item.dueDate);
  assert.equal(session.blocks[0].method.label, 'Randomized practice');
});

test('open physical skills are randomized from session one', () => {
  const { store, skill } = setup({ name: 'Tennis', genre: 'physical', physicalType: 'open' });
  logNewItem(store, skill.id, { title: 'Return of serve', firstExposure: D0 });

  const session = buildSession(store, addDays(D0, 1));
  assert.equal(session.blocks[0].method.label, 'Variable / reactive drill');
  // Varied from the first session — blocked repetition actively hurts open skills.
  assert.match(session.blocks[0].method.detail, /vary|never two the same/i);
  assert.doesNotMatch(session.blocks[0].method.detail, /identical conditions|blocked/i);
});

test('physical skills never repeat without a sleep cycle', () => {
  const { store, skill } = setup({ name: 'Tennis', genre: 'physical', physicalType: 'open' });
  const { item } = logNewItem(store, skill.id, { title: 'Return of serve', firstExposure: D0 });
  const results = drill(store, item.id, ['failed', 'failed']);
  for (const r of results) {
    assert.ok(diffDays(r.date, r.nextDate) >= 1, `${r.date} -> ${r.nextDate} skips a sleep cycle`);
  }
});

// ---------------------------------------------------------------------------
test('reasoning reviews are never scheduled in isolation', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const a = logNewItem(store, skill.id, { title: 'Proofs', subSkill: 'induction', firstExposure: D0 });
  const b = logNewItem(store, skill.id, { title: 'Differentiation', firstExposure: D0 });

  const session = buildSession(store, addDays(D0, 1));
  assert.equal(session.blocks.length, 2);
  for (const block of session.blocks) {
    assert.ok(block.interleaveWith, `${block.item.title} must have an interleaving partner`);
    assert.notEqual(block.interleaveWith.item.id, block.item.id);
  }
  assert.ok([a, b].every((x) => x.item.dueDate === addDays(D0, 1)));
});

test('a lone reasoning topic pulls in a booster and flags the gap', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const { flags } = logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  assert.ok(flags.some((f) => f.type === 'needs-interleave-partner'));

  const session = buildSession(store, addDays(D0, 1));
  assert.ok(session.blocks[0].flags.some((f) => f.type === 'no-partner'));
});

test('booster partners keep their own schedule untouched', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  const old = logNewItem(store, skill.id, { title: 'Trigonometry', firstExposure: D0 });
  drill(store, old.item.id, ['easy', 'easy']); // pushed well into the future

  const dueDateBefore = old.item.dueDate;
  const session = buildSession(store, addDays(D0, 1));
  const proofs = session.blocks.find((b) => b.item.title === 'Proofs');

  assert.equal(proofs.interleaveWith.kind, 'booster');
  assert.equal(old.item.dueDate, dueDateBefore, 'building a session must not mutate schedules');
});

// ---------------------------------------------------------------------------
test('confusable pairs are separated while shaky, then deliberately collided', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const a = logNewItem(store, skill.id, { title: 'Proof by induction', firstExposure: D0 });
  const b = logNewItem(store, skill.id, {
    title: 'Proof by contradiction',
    firstExposure: D0,
    confusableWith: [a.item.id],
  });

  // Both were due the same day; the newer/less stable one is pushed out.
  assert.notEqual(a.item.dueDate, b.item.dueDate);
  assert.ok(b.flags.some((f) => f.type === 'confusable-separated'));

  // Once both are established, a collision becomes a discrimination drill.
  a.item.history = [{ rating: 'ok' }, { rating: 'ok' }];
  b.item.history = [{ rating: 'ok' }, { rating: 'ok' }];
  b.item.dueDate = a.item.dueDate;

  const session = buildSession(store, a.item.dueDate);
  assert.ok(session.warnings.some((w) => w.type === 'discrimination-drill'));
  assert.ok(!session.warnings.some((w) => w.type === 'confusable-collision'));
});

test('an unstable confusable collision is flagged with a defer action', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  const a = logNewItem(store, skill.id, { title: 'por', firstExposure: D0 });
  const b = logNewItem(store, skill.id, { title: 'para', firstExposure: D0 });
  linkConfusable(store, a.item.id, b.item.id);
  b.item.dueDate = a.item.dueDate; // force them back together

  const session = buildSession(store, a.item.dueDate);
  assert.ok(session.warnings.some((w) => w.type === 'confusable-collision'));
  assert.ok(session.actions.some((x) => x.type === 'defer'));
});

// ---------------------------------------------------------------------------
test('overdue material is scheduled first and flagged', () => {
  const { store, skill } = setup({ name: 'Cell Biology', genre: 'conceptual' });
  logNewItem(store, skill.id, { title: 'Ignored topic', firstExposure: D0 });
  logNewItem(store, skill.id, { title: 'Fresh topic', firstExposure: addDays(D0, 9) });

  const session = buildSession(store, addDays(D0, 10));
  assert.equal(session.blocks[0].item.title, 'Ignored topic');
  assert.ok(session.blocks[0].overdueDays > 0);
  assert.ok(session.blocks[0].flags.some((f) => f.type === 'overdue'));
  assert.ok(session.warnings.some((w) => w.type === 'overdue'));
});

test('daily load cap warns and offers a redistribution that respects overdue work', () => {
  const { store, skill } = setup({ name: 'Cell Biology', genre: 'conceptual' });
  store.settings.dailyCapacityItems = 2;

  const stale = logNewItem(store, skill.id, { title: 'Overdue topic', firstExposure: D0 });
  for (let i = 0; i < 4; i += 1) {
    logNewItem(store, skill.id, { title: `Topic ${i}`, firstExposure: addDays(D0, 4) });
  }

  const date = addDays(D0, 5);
  const session = buildSession(store, date);
  const overload = session.warnings.find((w) => w.type === 'overload');

  assert.ok(overload, 'expected an overload warning');
  assert.ok(session.totalUnits > session.capacity);
  assert.ok(!overload.overflow.includes(stale.item.id), 'overdue work is never pushed');

  const moved = redistribute(store, overload.overflow, date);
  assert.ok(moved.length > 0);
  assert.ok(moved.every((i) => i.dueDate === addDays(date, 1)));
  assert.ok(buildSession(store, date).totalUnits <= session.totalUnits);
});

test('per-item SRS decks collapse into one block per skill', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  for (let i = 0; i < 12; i += 1) {
    logNewItem(store, skill.id, { title: `word ${i}`, firstExposure: D0 });
  }
  const session = buildSession(store, addDays(D0, 1));
  assert.equal(session.blocks.length, 1);
  assert.equal(session.blocks[0].kind, 'batch');
  assert.equal(session.blocks[0].items.length, 12);
});

// ---------------------------------------------------------------------------
test('pre-deadline mode switches to timed, exam-format practice', () => {
  const examDate = addDays(D0, 30);
  const { store, skill } = setup({
    name: 'AQA A-Level Maths',
    genre: 'reasoning',
    targetDate: examDate,
  });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  logNewItem(store, skill.id, { title: 'Vectors', firstExposure: D0 });

  const early = buildSession(store, addDays(D0, 1));
  assert.equal(skillMode(skill, addDays(D0, 1)).mode, 'normal');
  assert.notEqual(early.blocks[0].method.label, 'Timed, exam-format');

  const late = addDays(examDate, -10);
  store.items.forEach((i) => { i.dueDate = late; });
  const session = buildSession(store, late);

  assert.equal(skillMode(skill, late).mode, 'pre-deadline');
  assert.equal(session.blocks[0].method.label, 'Timed, exam-format');
  assert.match(session.blocks[0].method.detail, /min|time|conditions/i);
  assert.ok(session.warnings.some((w) => w.type === 'pre-deadline'));
  assert.ok(session.blocks[0].preDeadline);
});

test('logging new material inside the deadline window is challenged', () => {
  const { store, skill } = setup({
    name: 'AQA A-Level Maths',
    genre: 'reasoning',
    targetDate: addDays(D0, 10),
  });
  const { flags } = logNewItem(store, skill.id, { title: 'Brand new topic', firstExposure: D0 });
  assert.ok(flags.some((f) => f.type === 'pre-deadline'));
});

// ---------------------------------------------------------------------------
test('review history is what drives the schedule, so it survives a reload', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  const { item } = logNewItem(store, skill.id, { title: 'el bolígrafo', firstExposure: D0 });
  drill(store, item.id, ['ok', 'easy', 'hard']);

  const reloaded = JSON.parse(JSON.stringify(store));
  const restored = reloaded.items[0];

  assert.equal(restored.history.length, 3);
  assert.equal(restored.ease, item.ease);
  assert.equal(restored.intervalDays, item.intervalDays);
  assert.equal(restored.dueDate, item.dueDate);
  assert.equal(reloaded.reviews.length, 3);
  assert.ok(restored.history.every((h) => 'recallAttempt' in h), 'recall attempts are stored');
});

// ---------------------------------------------------------------------------
test('rating preview matches exactly what the rating actually does', () => {
  for (const rating of ['easy', 'ok', 'hard', 'failed']) {
    const { store, skill } = setup({ name: 'Cell Biology', genre: 'conceptual' });
    const { item } = logNewItem(store, skill.id, { title: 'Osmosis', firstExposure: D0 });
    drill(store, item.id, ['ok', 'ok']); // give it some history to project from

    const predicted = previewRating(store, item, rating);
    const actual = reviewItem(store, item.id, { rating, date: item.dueDate }).item.intervalDays;

    assert.equal(predicted, actual, `preview for "${rating}" must match the real result`);
  }
});

test('rating preview accounts for the third-strike permanent penalty', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const { item } = logNewItem(store, skill.id, { title: 'Vectors', firstExposure: D0 });
  drill(store, item.id, ['hard', 'hard']); // two strikes down

  const predicted = previewRating(store, item, 'hard');
  const actual = reviewItem(store, item.id, { rating: 'hard', date: item.dueDate }).item.intervalDays;

  assert.equal(predicted, actual);
  assert.ok(item.difficultyPenalty < 1, 'the third strike really did apply a penalty');
});

test('undo restores the schedule exactly, including confusable side effects', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const a = logNewItem(store, skill.id, { title: 'Induction', firstExposure: D0 });
  const b = logNewItem(store, skill.id, { title: 'Contradiction', firstExposure: D0 });
  linkConfusable(store, a.item.id, b.item.id);
  drill(store, a.item.id, ['ok']);

  const before = JSON.stringify({ items: store.items, reviews: store.reviews });
  const snap = snapshotSchedule(store);

  // A rating that also shunts its confusable partner's due date.
  b.item.dueDate = a.item.dueDate;
  reviewItem(store, a.item.id, { rating: 'failed', date: a.item.dueDate });
  assert.notEqual(JSON.stringify({ items: store.items, reviews: store.reviews }), before);

  restoreSchedule(store, snap);
  assert.equal(JSON.stringify({ items: store.items, reviews: store.reviews }), before,
    'undo must return the store to byte-identical state');
});

test('undo is a no-op when there is nothing to undo', () => {
  const { store } = setup({ name: 'Spanish', genre: 'language' });
  assert.equal(restoreSchedule(store, null), false);
});

// ---------------------------------------------------------------------------
test('forecast granularity keeps the row count readable at every horizon', () => {
  assert.equal(granularityFor(14), 'day');
  assert.equal(granularityFor(92), 'week');
  assert.equal(granularityFor(365), 'month');
  assert.equal(granularityFor(1826), 'quarter');
});

test('a 5-year forecast projects reviews out to the horizon in ~20 quarters', () => {
  const { store, skill } = setup({ name: 'Cell Biology', genre: 'conceptual' });
  logNewItem(store, skill.id, { title: 'Mitosis', firstExposure: D0 });
  logNewItem(store, skill.id, { title: 'Osmosis', firstExposure: D0 });

  const forecast = projectLoad(store, D0, 1826);

  assert.equal(forecast.granularity, 'quarter');
  assert.ok(forecast.buckets.length >= 20 && forecast.buckets.length <= 21,
    `expected ~20 quarters, got ${forecast.buckets.length}`);
  assert.ok(forecast.totalReviews > 0);
  assert.ok(forecast.buckets.every((b) => b.start <= forecast.until));

  // Expanding intervals mean early buckets carry far more load than late ones.
  const first = forecast.buckets[0].count;
  const last = forecast.buckets.at(-1).count;
  assert.ok(first > last, `load should thin out over time (${first} then ${last})`);
});

test('forecast horizons nest: a longer horizon never loses earlier reviews', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  for (let i = 0; i < 6; i += 1) {
    logNewItem(store, skill.id, { title: `word ${i}`, firstExposure: D0 });
  }
  const short = projectLoad(store, D0, 14);
  const long = projectLoad(store, D0, 1826);

  const within = (f, until) => f.buckets
    .flatMap((b) => b.entries)
    .filter((e) => e.date <= until).length;

  assert.equal(within(short, short.until), within(long, short.until));
  assert.ok(long.totalReviews > short.totalReviews);
});

test('overdue items are projected from today, not from the date they were missed', () => {
  const { store, skill } = setup({ name: 'Cell Biology', genre: 'conceptual' });
  logNewItem(store, skill.id, { title: 'Forgotten topic', firstExposure: D0 });

  const later = addDays(D0, 200);
  const forecast = projectLoad(store, later, 92);
  const dates = forecast.buckets.flatMap((b) => b.entries).map((e) => e.date);

  assert.ok(dates.length > 0);
  assert.ok(dates.every((d) => d >= later), 'no projected review may land in the past');
});

test('the forecast groups every bucket by skill, and totals per skill', () => {
  const maths = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const spanish = createSkill({ name: 'Spanish', genre: 'language', createdAt: D0 });
  maths.store.skills.push(spanish);
  logNewItem(maths.store, maths.skill.id, { title: 'Proofs', firstExposure: D0 });
  logNewItem(maths.store, maths.skill.id, { title: 'Vectors', firstExposure: D0 });
  logNewItem(maths.store, spanish.id, { title: 'ser vs estar', firstExposure: D0 });

  const forecast = projectLoad(maths.store, D0, 92);

  assert.equal(forecast.skillTotals.length, 2, 'both skills are represented');
  assert.equal(
    forecast.skillTotals.reduce((n, s) => n + s.count, 0),
    forecast.totalReviews,
    'per-skill totals must add up to the overall total',
  );

  for (const bucket of forecast.buckets) {
    const grouped = bucket.skills.reduce((n, g) => n + g.count, 0);
    assert.equal(grouped, bucket.count, `${bucket.label}: grouping lost entries`);
    for (const group of bucket.skills) {
      assert.ok(group.days.length > 0 || group.count === 0);
      const perDay = group.days.reduce((n, d) => n + d.items.length, 0);
      assert.equal(perDay, group.count, 'day breakdown must cover every review');
      assert.ok(group.days.every((d) => d.date >= forecast.from && d.date <= forecast.until));
    }
  }
});

test('the forecast can be filtered to a single skill, and totals follow', () => {
  const maths = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const spanish = createSkill({ name: 'Spanish', genre: 'language', createdAt: D0 });
  maths.store.skills.push(spanish);
  logNewItem(maths.store, maths.skill.id, { title: 'Proofs', firstExposure: D0 });
  logNewItem(maths.store, maths.skill.id, { title: 'Vectors', firstExposure: D0 });
  logNewItem(maths.store, spanish.id, { title: 'ser vs estar', firstExposure: D0 });

  const all = projectLoad(maths.store, D0, 92);
  const only = projectLoad(maths.store, D0, 92, { skillId: spanish.id });

  assert.equal(only.skillTotals.length, 1);
  assert.equal(only.skillTotals[0].skill.id, spanish.id);
  assert.ok(only.totalReviews > 0 && only.totalReviews < all.totalReviews);
  assert.ok(
    only.buckets.every((b) => b.entries.every((e) => e.skill.id === spanish.id)),
    'a filtered forecast must not leak other skills',
  );

  const spanishInAll = all.skillTotals.find((s) => s.skill.id === spanish.id).count;
  assert.equal(only.totalReviews, spanishInAll, 'filtering must not change the counts');
});

test('the forecast reports no effort estimate — practice length is the user\'s call', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  const forecast = projectLoad(store, D0, 365);

  assert.equal(forecast.totalMinutes, undefined);
  assert.ok(forecast.buckets.every((b) => b.minutes === undefined));
  assert.ok(forecast.totalReviews > 0, 'counts are still reported');
});

test('projecting a single item returns its whole future review chain', () => {
  const { store, skill } = setup({ name: 'Periodic table', genre: 'memorization' });
  const { item } = logNewItem(store, skill.id, { title: 'Group 1', encoding: 'x', firstExposure: D0 });

  const chain = projectItem(store, item.id, D0, 1826);
  assert.ok(chain.length > 5, `expected a multi-year chain, got ${chain.length}`);
  assert.equal(chain[0].date, item.dueDate, 'first entry is the committed due date');
  for (let i = 1; i < chain.length; i += 1) {
    assert.ok(chain[i].date > chain[i - 1].date, 'projected dates must strictly increase');
  }
});

test('an empty store forecasts cleanly rather than throwing', () => {
  const forecast = projectLoad(emptyStore(), D0, 1826);
  assert.equal(forecast.totalReviews, 0);
  assert.deepEqual(forecast.skillTotals, []);
  assert.ok(forecast.buckets.every((b) => b.skills.length === 0));
  assert.ok(forecast.buckets.length > 0, 'empty buckets still span the horizon');
});

test('practice cards render in the spec output format', () => {
  const { store, skill } = setup({ name: 'AQA A-Level Maths', genre: 'reasoning' });
  const logged = logNewItem(store, skill.id, {
    title: 'Proofs',
    subSkill: 'induction',
    firstExposure: D0,
    shaky: true,
  });
  logNewItem(store, skill.id, { title: 'Differentiation', firstExposure: D0 });

  const card = formatLogCard(store, { skill, ...logged }, D0);
  assert.match(card, /^📌 Logged: Proofs \(Reasoning, AQA A-Level Maths, induction\)/m);
  assert.match(card, /^📅 Next review:/m);
  assert.match(card, /^🔁 Also due today:/m);
  assert.match(card, /^🗓 Upcoming schedule for this topic:/m);
  assert.match(card, /^⚠️ Flags:/m);

  const session = formatSessionCard(store, addDays(D0, 1));
  assert.match(session, /Practice card/);
  assert.match(session, /Method —/);
  assert.match(session, /Interleave with —/);
  assert.doesNotMatch(session, /Blind recall/,
    'the blind-recall step was removed; the card must not still instruct it');
});

// --------------------------------------------------------------- backlog triage

test('a backlog is split into the day capacity and the rest, ranked', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning' });
  store.settings.dailyCapacityItems = 3;

  // Four badly overdue, eight due today: far past any one day's capacity.
  for (let i = 0; i < 4; i += 1) {
    logNewItem(store, skill.id, { title: `Stale ${i}`, firstExposure: D0 });
  }
  for (let i = 0; i < 8; i += 1) {
    logNewItem(store, skill.id, { title: `Fresh ${i}`, firstExposure: addDays(D0, 20) });
  }

  const date = addDays(D0, 21);
  const session = buildSession(store, date);

  assert.ok(session.blocks.length > session.capacity, 'expected a real backlog');
  assert.ok(session.focusCount <= session.capacity, 'focus set never exceeds the cap');
  assert.equal(session.deferredCount, session.blocks.length - session.focusCount);

  // The focus set is the front of the ranked list, so nothing overdue is
  // pushed behind something that is merely due.
  const focus = session.blocks.slice(0, session.focusCount);
  const rest = session.blocks.slice(session.focusCount);
  const worstInFocus = Math.max(...focus.map((b) => b.rank));
  const bestInRest = Math.min(...rest.map((b) => b.rank));
  assert.ok(worstInFocus <= bestInRest, 'focus set holds the highest-priority blocks');
  assert.ok(focus.every((b) => b.overdueDays > 0), 'overdue work comes first');
});

test('the focus set always offers at least one block', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  store.settings.dailyCapacityItems = 1;
  // One deck of 60 cards is 3 work units — more than the whole cap on its own.
  for (let i = 0; i < 60; i += 1) {
    logNewItem(store, skill.id, { title: `word ${i}`, firstExposure: D0 });
  }
  const session = buildSession(store, addDays(D0, 1));
  assert.ok(session.totalUnits > session.capacity);
  assert.equal(session.focusCount, 1, 'a day is never empty just because one block is large');
});

test('the overdue warning counts items, not blocks', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  for (let i = 0; i < 9; i += 1) {
    logNewItem(store, skill.id, { title: `word ${i}`, firstExposure: D0 });
  }
  // One skill's cards collapse to a single block, so a block count would say 1.
  const session = buildSession(store, addDays(D0, 10));
  assert.equal(session.overdueCount, 1, 'one block');
  assert.equal(session.overdueItemCount, 9, 'nine items');
  const overdue = session.warnings.find((w) => w.type === 'overdue');
  assert.match(overdue.message, /^9 items are overdue/);
});

test('the overload warning never reports work as minutes', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning' });
  store.settings.dailyCapacityItems = 2;
  for (let i = 0; i < 6; i += 1) {
    logNewItem(store, skill.id, { title: `Topic ${i}`, firstExposure: D0 });
  }
  const overload = buildSession(store, addDays(D0, 1)).warnings.find((w) => w.type === 'overload');
  assert.ok(overload, 'expected an overload warning');
  assert.doesNotMatch(overload.message, /\bmin\b|minute/, 'load is counted in items');
  assert.doesNotMatch(overload.message, /\(s\)/, 'plurals are written out');
});

// ------------------------------------------------------------- season wind-down

test('a skill stops scheduling once its target date has passed', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning', targetDate: addDays(D0, 30) });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });

  const before = addDays(D0, 29);
  assert.ok(!skillSuspended(skill, before), 'still running before the exam');
  assert.ok(dueItems(store, before).length > 0);

  const after = addDays(D0, 31);
  assert.ok(skillSuspended(skill, after), 'suspended once the date has passed');
  assert.equal(dueItems(store, after).length, 0, 'nothing from it is due any more');
  assert.equal(overdueItems(store, after).length, 0);
  assert.equal(buildSession(store, after).blocks.length, 0);
});

test('suspension hides the subject from the forecast too', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning', targetDate: addDays(D0, 30) });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });

  assert.ok(projectLoad(store, addDays(D0, 29), 60).totalReviews > 0);
  assert.equal(projectLoad(store, addDays(D0, 31), 60).totalReviews, 0,
    'a sat exam is not put back on the calendar');
});

test('the wind-down names the finished subject and keeps its work', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning', targetDate: addDays(D0, 30) });
  const { item } = logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  reviewItem(store, item.id, { rating: 'ok', date: item.dueDate });

  const session = buildSession(store, addDays(D0, 31));
  assert.equal(session.windDown.length, 1);
  assert.equal(session.windDown[0].skill.id, skill.id);
  assert.equal(session.windDown[0].reviews, 1, 'history is intact');
  assert.equal(session.windDown[0].topics, 1);
  assert.equal(store.items.length, 1, 'nothing is deleted');
});

test('resuming is a clear undo, and does not reappear in the wind-down', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning', targetDate: addDays(D0, 30) });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  const after = addDays(D0, 31);

  setSkillSuspended(store, skill.id, false);
  assert.ok(!skillSuspended(skill, after), 'the override beats the date');
  assert.ok(dueItems(store, after).length > 0, 'back on the schedule');
  assert.equal(buildSession(store, after).windDown.length, 0, 'no longer asked about');
});

test('a new target date starts a new season and clears the override', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning', targetDate: addDays(D0, 30) });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  const after = addDays(D0, 31);

  setSkillSuspended(store, skill.id, true);
  assert.ok(skillSuspended(skill, after));

  setTargetDate(store, skill.id, addDays(D0, 400));
  assert.equal(skill.suspended, null, 'the override is cleared');
  assert.ok(!skillSuspended(skill, after), 'running again towards the new date');
  assert.ok(dueItems(store, after).length > 0);
});

test('a skill with no target date is never auto-suspended', () => {
  const { store, skill } = setup({ name: 'Guitar', genre: 'physical' });
  logNewItem(store, skill.id, { title: 'Pentatonic', firstExposure: D0 });
  assert.ok(!skillSuspended(skill, addDays(D0, 3650)));
  assert.ok(dueItems(store, addDays(D0, 3650)).length > 0);
});

test('one finished subject does not suspend the others', () => {
  const store = emptyStore();
  const done = createSkill({ name: 'Maths', genre: 'reasoning', targetDate: addDays(D0, 10), createdAt: D0 });
  const live = createSkill({ name: 'Spanish', genre: 'language', targetDate: addDays(D0, 200), createdAt: D0 });
  store.skills.push(done, live);
  logNewItem(store, done.id, { title: 'Proofs', firstExposure: D0 });
  logNewItem(store, live.id, { title: 'el gato', firstExposure: D0 });

  const date = addDays(D0, 20);
  const due = dueItems(store, date);
  assert.ok(due.length > 0);
  assert.ok(due.every((i) => i.skillId === live.id), 'only the live subject is scheduled');
  assert.equal(buildSession(store, date).windDown.length, 1);
});

test('the nav badge counts blocks, so it agrees with the page it links to', () => {
  const { store, skill } = setup({ name: 'Spanish', genre: 'language' });
  for (let i = 0; i < 18; i += 1) {
    logNewItem(store, skill.id, { title: `word ${i}`, firstExposure: D0 });
  }
  const date = addDays(D0, 1);
  assert.equal(dueItems(store, date).length, 18, 'eighteen cards');
  assert.equal(dueBlockCount(store, date), 1, 'but one sitting');
  assert.equal(dueBlockCount(store, date), buildSession(store, date).blocks.length);
});

test('the badge ignores finished subjects', () => {
  const { store, skill } = setup({ name: 'Maths', genre: 'reasoning', targetDate: addDays(D0, 10) });
  logNewItem(store, skill.id, { title: 'Proofs', firstExposure: D0 });
  assert.equal(dueBlockCount(store, addDays(D0, 9)), 1);
  assert.equal(dueBlockCount(store, addDays(D0, 20)), 0);
});
