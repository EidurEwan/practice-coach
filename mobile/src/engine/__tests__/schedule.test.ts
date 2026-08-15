import { addDays, backIn, daysBetween, formatLong, lateWords, relativePast, toDay } from '../dates';
import { bandFor, gapLabel, pipsFor } from '../bands';
import { COMPRESSED, detectGenre, EXPANDING, curveLabel, isPerItem, methodFor, TOP_OF_LADDER } from '../genres';
import {
  applyLog,
  applyRating,
  curveAt,
  EASE_MAX,
  EASE_MIN,
  firstInterval,
  newTopicDefaults,
  PENALTY_FLOOR,
  previewRatings,
  projectedChain,
  projectedDates,
} from '../schedule';
import { recallCurve } from '../recall';
import { Rating } from '../types';
import { topic } from './factory';

const DAY = '2026-08-09';

describe('dates', () => {
  test('adds and subtracts whole calendar days', () => {
    expect(addDays('2026-08-09', 1)).toBe('2026-08-10');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  test('survives a DST boundary — a 7-day interval is still 7 sleeps', () => {
    // 29 March 2026 is the UK clock change; a UTC-based add would land short.
    expect(addDays('2026-03-25', 7)).toBe('2026-04-01');
    expect(daysBetween('2026-03-25', '2026-04-01')).toBe(7);
  });

  test('daysBetween is signed and symmetric', () => {
    expect(daysBetween('2026-08-09', '2026-08-12')).toBe(3);
    expect(daysBetween('2026-08-12', '2026-08-09')).toBe(-3);
  });

  test('formats the copy the screens use', () => {
    expect(formatLong('2026-08-09')).toBe('Sunday 9 August');
    expect(backIn(1)).toBe('back tomorrow');
    expect(backIn(7)).toBe('back in 7 days');
    expect(relativePast(0)).toBe('today');
    expect(relativePast(1)).toBe('yesterday');
    expect(relativePast(21)).toBe('3 weeks ago');
    expect(lateWords(1)).toBe('yesterday');
    expect(lateWords(4)).toBe('4 days late');
  });

  test('toDay reads the local calendar day, not UTC', () => {
    expect(toDay(new Date(2026, 7, 9, 23, 30))).toBe('2026-08-09');
    expect(toDay(new Date(2026, 7, 10, 0, 30))).toBe('2026-08-10');
  });
});

describe('genres', () => {
  test('detects the genre from the skill name', () => {
    expect(detectGenre('Maths AA HL').genre).toBe('reasoning');
    expect(detectGenre('Chemistry HL').genre).toBe('conceptual');
    expect(detectGenre('History HL').genre).toBe('memorization');
    expect(detectGenre('Spanish B SL').genre).toBe('language');
    expect(detectGenre('Bouldering').genre).toBe('physical');
  });

  test('says when it guessed, and when the name is a blend', () => {
    expect(detectGenre('Maths AA HL').confidence).toBe('From the name');
    expect(detectGenre('Underwater basket weaving').confidence).toBe('Guessed');
    expect(detectGenre('Underwater basket weaving').genre).toBe('conceptual');
    expect(detectGenre('History of Physics').confidence).toBe('Blend — check it');
  });

  test('genre picks the curve and the method', () => {
    expect(curveLabel('reasoning')).toContain('1 → 2 → 5 → 10 → 22');
    expect(curveLabel('physical')).toContain('1 → 3 → 7 → 16 → 35');
    expect(curveLabel('language')).toBe('Per-item SM-2');
    expect(isPerItem('language')).toBe(true);
    expect(isPerItem('reasoning')).toBe(false);
    expect(methodFor('physical', 'open')).toBe('Variable and reactive from day one.');
    expect(methodFor('physical', 'closed')).toBe('Blocked reps first, then randomised.');
  });
});

describe('curves', () => {
  test('walks the published rungs', () => {
    expect(COMPRESSED.slice(0, 5)).toEqual([1, 2, 5, 10, 22]);
    expect(EXPANDING.slice(0, 5)).toEqual([1, 3, 7, 16, 35]);
    expect(curveAt('reasoning', 0)).toBe(1);
    expect(curveAt('reasoning', 4)).toBe(22);
    expect(curveAt('physical', 4)).toBe(35);
  });

  test('extends past the last rung at ×2.2', () => {
    expect(curveAt('physical', 7)).toBe(339);
    expect(curveAt('physical', 8)).toBe(Math.round(339 * 2.2));
    expect(curveAt('reasoning', 9)).toBe(Math.round(233 * 2.2 * 2.2));
  });

  test('a logged topic comes back on the second rung, or the first when shaky', () => {
    expect(firstInterval('reasoning', false)).toBe(2);
    expect(firstInterval('physical', false)).toBe(3);
    expect(firstInterval('reasoning', true)).toBe(1);
  });
});

describe('ratings', () => {
  const t = topic({ interval_days: 5, repetition: 2 });

  test('OK advances one rung, easy jumps one further', () => {
    expect(applyRating(t, 'reasoning', 'ok', DAY).interval_days).toBe(10);
    expect(applyRating(t, 'reasoning', 'easy', DAY).interval_days).toBe(22);
  });

  test('hard shrinks without losing the rung; failed resets to the first', () => {
    const hard = applyRating(t, 'reasoning', 'hard', DAY);
    expect(hard.interval_days).toBe(3);
    expect(hard.repetition).toBe(2);
    const failed = applyRating(t, 'reasoning', 'failed', DAY);
    expect(failed.interval_days).toBe(1);
    expect(failed.repetition).toBe(0);
  });

  test('nothing ever comes back sooner than one sleep', () => {
    const fragile = topic({ interval_days: 1, repetition: 0 });
    for (const r of ['failed', 'hard', 'ok', 'easy'] as Rating[]) {
      expect(applyRating(fragile, 'reasoning', r, DAY).interval_days).toBeGreaterThanOrEqual(1);
    }
  });

  test('the due date is the interval, counted from the day it was rated', () => {
    expect(applyRating(t, 'reasoning', 'ok', DAY).due_on).toBe(addDays(DAY, 10));
  });

  test('"didn\'t get to it" returns tomorrow and changes nothing else', () => {
    const pushed = applyRating(t, 'reasoning', 'pushed', DAY);
    expect(pushed.due_on).toBe(addDays(DAY, 1));
    expect(pushed.interval_days).toBe(t.interval_days);
    expect(pushed.ease).toBe(t.ease);
    expect(pushed.repetition).toBe(t.repetition);
    expect(pushed.streak).toBe(t.streak);
    expect(pushed.penalty).toBe(t.penalty);
  });

  test('the preview on the button is what the rating actually does', () => {
    const preview = previewRatings(t, 'reasoning', DAY);
    for (const { rating, days } of preview) {
      expect(applyRating(t, 'reasoning', rating, DAY).interval_days).toBe(days);
    }
    expect(preview.map((p) => p.days)).toEqual([1, 3, 10, 22]);
  });
});

describe('per-item genres', () => {
  test('ease moves with the rating and stays inside its clamp', () => {
    const deck = topic({ interval_days: 22, repetition: 4, ease: 2.4 });
    expect(applyRating(deck, 'language', 'easy', DAY).ease).toBeCloseTo(2.55);
    expect(applyRating(deck, 'language', 'hard', DAY).ease).toBeCloseTo(2.25);
    expect(applyRating(deck, 'language', 'failed', DAY).ease).toBeCloseTo(2.2);

    const brittle = topic({ ease: EASE_MIN });
    expect(applyRating(brittle, 'language', 'failed', DAY).ease).toBe(EASE_MIN);
    const easy = topic({ ease: EASE_MAX });
    expect(applyRating(easy, 'language', 'easy', DAY).ease).toBe(EASE_MAX);
  });

  test('an OK multiplies the interval by the ease once the deck is running', () => {
    const deck = topic({ interval_days: 22, repetition: 4, ease: 2.4 });
    expect(applyRating(deck, 'language', 'ok', DAY).interval_days).toBe(Math.round(22 * 2.4));
  });

  test('the first two reviews of a deck are fixed, not multiplied', () => {
    const fresh = topic({ interval_days: 2, repetition: 0, ease: 2.5 });
    const first = applyRating(fresh, 'language', 'ok', DAY);
    expect(first.interval_days).toBe(1);
    const second = applyRating({ ...fresh, ...first }, 'language', 'ok', DAY);
    expect(second.interval_days).toBe(3);
  });
});

describe('weak points', () => {
  test('three hard or failed running applies a permanent ×0.7', () => {
    let t = topic({ interval_days: 22, repetition: 4, streak: 0 });
    let out = applyRating(t, 'reasoning', 'hard', DAY);
    expect(out.penalty).toBe(1);
    t = { ...t, ...out };
    out = applyRating(t, 'reasoning', 'failed', DAY);
    expect(out.penalty).toBe(1);
    t = { ...t, ...out };
    out = applyRating(t, 'reasoning', 'hard', DAY);
    expect(out.weakened).toBe(true);
    expect(out.penalty).toBeCloseTo(0.7);
  });

  test('an OK in the middle clears the run', () => {
    let t = topic({ streak: -2 });
    const out = applyRating(t, 'reasoning', 'ok', DAY);
    expect(out.streak).toBe(1);
    expect(out.penalty).toBe(1);
  });

  test('the penalty compounds down to a floor, and scales every interval', () => {
    let t = topic({ interval_days: 22, repetition: 4, penalty: 1 });
    for (let i = 0; i < 30; i++) {
      t = { ...t, ...applyRating(t, 'reasoning', 'hard', DAY) };
    }
    expect(t.penalty).toBe(PENALTY_FLOOR);

    const penalised = topic({ interval_days: 5, repetition: 2, penalty: 0.7 });
    expect(applyRating(penalised, 'reasoning', 'ok', DAY).interval_days).toBe(Math.round(10 * 0.7));
  });
});

describe('plateau', () => {
  test('three OKs running escalates the format one rung and rearms', () => {
    let t = topic({ format_rung: 0, streak: 0 });
    let out = applyRating(t, 'reasoning', 'ok', DAY);
    t = { ...t, ...out };
    out = applyRating(t, 'reasoning', 'ok', DAY);
    t = { ...t, ...out };
    expect(out.plateau).toBe(false);
    out = applyRating(t, 'reasoning', 'ok', DAY);
    expect(out.plateau).toBe(true);
    expect(out.format_rung).toBe(1);
    expect(out.streak).toBe(0);
  });

  test('the ladder stops at the top rather than running off the end', () => {
    let t = topic({ format_rung: TOP_OF_LADDER, streak: 2 });
    const out = applyRating(t, 'reasoning', 'ok', DAY);
    expect(out.format_rung).toBe(TOP_OF_LADDER);
  });

  test('an easy rating breaks the OK run', () => {
    const t = topic({ streak: 2 });
    expect(applyRating(t, 'reasoning', 'easy', DAY).streak).toBe(0);
  });
});

describe('logging', () => {
  test('a new topic is scheduled from the day it was studied', () => {
    const d = newTopicDefaults('reasoning', false, '2026-08-07');
    expect(d.interval_days).toBe(2);
    expect(d.due_on).toBe('2026-08-09');
    expect(d.state).toBe('new');
  });

  test('"felt shaky" pulls the first look forward', () => {
    expect(newTopicDefaults('reasoning', true, '2026-08-09').due_on).toBe('2026-08-10');
  });

  test('backdating far enough makes it due immediately', () => {
    const d = newTopicDefaults('reasoning', false, '2026-08-01');
    expect(daysBetween(d.due_on, DAY)).toBeGreaterThan(0);
  });

  test('logging a tracked topic re-seeds its clock; shaky shortens it', () => {
    const t = topic({ interval_days: 10, state: 'stable' });
    expect(applyLog(t, 'reasoning', DAY, false)).toEqual({ interval_days: 10, due_on: addDays(DAY, 10) });
    expect(applyLog(t, 'reasoning', DAY, true).interval_days).toBe(6);
  });
});

describe('projection', () => {
  test('the chain follows the curve on unbroken OKs', () => {
    const t = topic({ interval_days: 5, repetition: 2 });
    expect(projectedChain(t, 'reasoning', 4)).toEqual([10, 22, 48, 106]);
  });

  test('projected dates start at the committed one', () => {
    const t = topic({ interval_days: 5, repetition: 2, due_on: '2026-08-09' });
    const dates = projectedDates(t, 'reasoning', 3);
    expect(dates[0]).toEqual({ day: '2026-08-09', index: 0 });
    expect(dates[1]).toEqual({ day: '2026-08-19', index: 1 });
    expect(dates[2]).toEqual({ day: '2026-09-10', index: 2 });
  });
});

describe('proficiency bands', () => {
  test('reads the band off the current interval', () => {
    expect(bandFor(1).label).toBe('Fragile');
    expect(bandFor(2.9).label).toBe('Fragile');
    expect(bandFor(3).label).toBe('Learning');
    expect(bandFor(9).label).toBe('Learning');
    expect(bandFor(10).label).toBe('Familiar');
    expect(bandFor(34).label).toBe('Familiar');
    expect(bandFor(35).label).toBe('Strong');
    expect(bandFor(153).label).toBe('Strong');
    expect(bandFor(154).label).toBe('Retained');
    expect(bandFor(999).level).toBe(5);
  });

  test('the tone ramp runs red, amber, accent, green, green', () => {
    expect([1, 5, 20, 100, 200].map((d) => bandFor(d).tone)).toEqual(['red', 'amb', 'acc', 'grn', 'grn']);
  });

  test('pips fill to the level and the rest sit empty', () => {
    const pips = pipsFor(bandFor(35));
    expect(pips.filter((p) => p.filled)).toHaveLength(4);
    expect(pips.map((p) => p.width)).toEqual([7, 7, 7, 7, 5]);
  });

  test('the gap rolls into months at a month', () => {
    expect(gapLabel(22)).toBe('22d gap');
    expect(gapLabel(60)).toBe('2mo gap');
  });
});

describe('recall curve', () => {
  test('reconstructs the chain backwards and projects one more gap', () => {
    expect(recallCurve(22).chainLabel).toBe('1 → 2 → 4 → 10 → 22 → 48 days');
    expect(recallCurve(1).chainLabel).toBe('1 → 2 days');
  });

  test('the drop shrinks as the gaps widen — the whole point of the graphic', () => {
    const label = recallCurve(22).dropLabel;
    const [now, first] = label.match(/\d+/g)!.map(Number);
    expect(first).toBeGreaterThan(now);
    expect(recallCurve(22).path.startsWith('M')).toBe(true);
    expect(recallCurve(22).future.startsWith('M')).toBe(true);
    expect(recallCurve(22).dots.length).toBeGreaterThan(0);
  });

  test('every point stays inside the plot', () => {
    for (const days of [1, 3, 16, 154, 339]) {
      const curve = recallCurve(days);
      const nums = curve.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...nums)).toBeLessThanOrEqual(260);
    }
  });
});
