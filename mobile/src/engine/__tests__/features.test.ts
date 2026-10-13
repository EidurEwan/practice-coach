import { addDays } from '../dates';
import { daysEarly, needsEncoding, parseSyllabus } from '../intake';
import { activeTopics, buildPlan, dayAsText, endedSeasons, targetOf } from '../plan';
import { applyLog, applyRating, calibrationFrom, CALIBRATION_MAX, CALIBRATION_MIN, newTopicDefaults, projectedChain } from '../schedule';
import { normaliseDoc, withDefaults } from '../../store/format';
import { doc, skill, topic } from './factory';

const DAY = '2026-10-14';

describe('the forgetting-rate diagnostic', () => {
  test('average recall after a week reads as average, and changes nothing much', () => {
    // exp(−7 ÷ 7) ≈ 37% — between "partly" and "no" — lands near 1.
    const f = calibrationFrom([{ daysAgo: 7, recall: 'partly' }, { daysAgo: 7, recall: 'no' }]);
    expect(f).toBeGreaterThan(0.8);
    expect(f).toBeLessThan(1.2);
  });

  test('remembering well after a long gap stretches the schedule; forgetting fast compresses it', () => {
    expect(calibrationFrom([{ daysAgo: 21, recall: 'yes' }])).toBeGreaterThan(1);
    expect(calibrationFrom([{ daysAgo: 2, recall: 'no' }])).toBeLessThan(1);
  });

  test('never moves a schedule past the clamp, however extreme the answers', () => {
    expect(calibrationFrom([{ daysAgo: 60, recall: 'yes' }])).toBe(CALIBRATION_MAX);
    expect(calibrationFrom([{ daysAgo: 1, recall: 'no' }])).toBe(CALIBRATION_MIN);
  });

  test('no usable answers changes nothing', () => {
    expect(calibrationFrom([])).toBe(1);
    expect(calibrationFrom([{ daysAgo: 0, recall: 'yes' }])).toBe(1);
  });
});

describe('calibration scales every interval', () => {
  const t = topic({ interval_days: 10, repetition: 3 });

  test('on a rating', () => {
    expect(applyRating(t, 'reasoning', 'ok', DAY, 1.5).interval_days).toBe(Math.round(22 * 1.5));
    expect(applyRating(t, 'reasoning', 'ok', DAY, 0.6).interval_days).toBe(Math.round(22 * 0.6));
  });

  test('on a new topic', () => {
    expect(newTopicDefaults('physical', false, DAY, 1.5).interval_days).toBe(Math.round(3 * 1.5));
  });

  test('on a deck, without compounding over successive ratings', () => {
    let deck = topic({ interval_days: 10, repetition: 4, ease: 2.5 });
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      deck = { ...deck, ...applyRating(deck, 'language', 'ok', DAY, 0.6) };
      gaps.push(deck.interval_days);
    }
    // Each OK multiplies by the ease, not by ease × calibration again.
    expect(gaps[3] / gaps[2]).toBeCloseTo(2.5, 0);
  });

  test('and the forecast follows', () => {
    expect(projectedChain(t, 'reasoning', 1, 1.5)).toEqual([33]);
  });
});

describe('logging a topic again', () => {
  test('does not shrink a weak topic a little more each time', () => {
    const weak = topic({ state: 'learning', interval_days: 7, penalty: 0.49 });
    expect(applyLog(weak, 'reasoning', DAY, false).interval_days).toBe(7);
  });

  test('"felt shaky" still pulls it in', () => {
    expect(applyLog(topic({ state: 'learning', interval_days: 10 }), 'reasoning', DAY, true).interval_days).toBe(6);
  });
});

describe('seasons and pauses', () => {
  const maths = skill({ id: 'maths', name: 'Maths', target_date: addDays(DAY, -1) });
  const chem = skill({ id: 'chem', name: 'Chemistry', paused_at: '2026-10-01T00:00:00.000Z' });
  const bio = skill({ id: 'bio', name: 'Biology' });
  const d = doc({
    skills: [maths, chem, bio],
    topics: [
      topic({ id: 'm', skill_id: 'maths', due_on: DAY }),
      topic({ id: 'c', skill_id: 'chem', due_on: DAY }),
      topic({ id: 'b', skill_id: 'bio', due_on: DAY }),
    ],
  });

  test('a finished season and a paused subject stop scheduling', () => {
    expect(buildPlan(d, DAY).due.map((i) => i.topic.id)).toEqual(['b']);
  });

  test('a finished season is still scheduling on its last day', () => {
    expect(activeTopics(d, addDays(DAY, -1)).map((t) => t.id)).toContain('m');
  });

  test('a finished season is reported, with what it amounted to; a paused one is not', () => {
    const ended = endedSeasons(d, DAY);
    expect(ended.map((e) => e.skill.id)).toEqual(['maths']);
    expect(ended[0].topics).toBe(1);
  });
});

describe('the deadline window', () => {
  test('uses the skill’s own target date before the global exam date', () => {
    const own = skill({ id: 's', target_date: addDays(DAY, 5) });
    const d = doc({
      skills: [own],
      topics: [topic({ skill_id: 's', due_on: DAY })],
      settings: { ...doc().settings, exam_date: addDays(DAY, 200), pre_deadline_days: 21 },
    });
    expect(targetOf(d, own)).toBe(addDays(DAY, 5));
    expect(buildPlan(d, DAY).due[0].flags).toContain('deadline');
  });

  test('falls back to the exam date in Settings', () => {
    const plain = skill({ id: 's' });
    const d = doc({
      skills: [plain],
      topics: [topic({ skill_id: 's', due_on: DAY })],
      settings: { ...doc().settings, exam_date: addDays(DAY, 10) },
    });
    expect(buildPlan(d, DAY).due[0].flags).toContain('deadline');
  });
});

describe('confusable pairs', () => {
  const s = skill({ id: 's', genre: 'conceptual' });
  const pair = (a: string, b: string) => ({ id: `${a}${b}`, topic_a: a, topic_b: b, created_at: DAY, updated_at: DAY });

  test('once both are stable they are practised together on purpose', () => {
    const d = doc({
      skills: [s],
      topics: [
        topic({ id: 'a', title: 'Mitosis', skill_id: 's', interval_days: 22, due_on: DAY }),
        topic({ id: 'b', title: 'Meiosis', skill_id: 's', interval_days: 22, due_on: addDays(DAY, 9) }),
      ],
      pairs: [pair('a', 'b')],
    });
    const [item] = buildPlan(d, DAY).due;
    expect(item.collideWith?.id).toBe('b');
    expect(item.flags).toContain('collide');
    expect(item.method).toContain('Meiosis');
  });

  test('while either is shaky they are still held apart, not collided', () => {
    const d = doc({
      skills: [s],
      topics: [
        topic({ id: 'a', skill_id: 's', interval_days: 22, due_on: DAY }),
        topic({ id: 'b', skill_id: 's', interval_days: 3, due_on: DAY }),
      ],
      pairs: [pair('a', 'b')],
    });
    const plan = buildPlan(d, DAY);
    expect(plan.due.every((i) => !i.collideWith)).toBe(true);
    expect(plan.backlog.some((i) => i.heldApartFrom)).toBe(true);
  });
});

describe('pasting a syllabus', () => {
  test('strips numbering and bullets of every common kind', () => {
    const text = ['1. Kinematics', '2) Forces', '1.1 Vectors', '3.2.1 Momentum', '- Energy', '• Waves', 'a) Optics', '(iv) Fields'].join('\n');
    expect(parseSyllabus(text)).toEqual(['Kinematics', 'Forces', 'Vectors', 'Momentum', 'Energy', 'Waves', 'Optics', 'Fields']);
  });

  test('leaves a bare leading number alone — it is part of the title', () => {
    expect(parseSyllabus('3 sets of reps\n10 minute warm-up')).toEqual(['3 sets of reps', '10 minute warm-up']);
  });

  test('drops blanks and duplicates, and tidies whitespace', () => {
    expect(parseSyllabus('  Forces  \n\n1. forces\nTorque   and   rotation\n')).toEqual(['Forces', 'Torque and rotation']);
  });

  test('takes nested markers off one at a time', () => {
    expect(parseSyllabus('- 1.2 Circular motion')).toEqual(['Circular motion']);
  });
});

describe('the intake rules', () => {
  test('a memorization fact needs an encoding; other genres do not', () => {
    expect(needsEncoding('memorization', '')).toBe(true);
    expect(needsEncoding('memorization', '  ')).toBe(true);
    expect(needsEncoding('memorization', 'Kings Play Chess On Fine Green Silk')).toBe(false);
    expect(needsEncoding('reasoning', null)).toBe(false);
  });

  test('says how early practising something would be', () => {
    expect(daysEarly(topic({ due_on: addDays(DAY, 4) }), DAY)).toBe(4);
    expect(daysEarly(topic({ due_on: DAY }), DAY)).toBe(0);
  });
});

describe('the day as text', () => {
  test('lists the focus set in order, with its method', () => {
    const s = skill({ id: 's', name: 'Maths' });
    const d = doc({ skills: [s], topics: [topic({ skill_id: 's', title: 'Chain rule', due_on: DAY })] });
    const text = dayAsText(buildPlan(d, DAY));
    expect(text).toContain('1. Chain rule — Maths');
    expect(text.split('\n')[0]).toContain('Interval');
  });

  test('says so when the day is clear', () => {
    expect(dayAsText(buildPlan(doc(), DAY))).toContain('Nothing due');
  });
});

describe('older saved data', () => {
  test('fills the new fields without touching anything else', () => {
    const old = { id: 's', name: 'Maths', genre: 'reasoning', hue_index: 2 };
    expect(withDefaults('skills', old)).toEqual({ ...old, level: null, target_date: null, paused_at: null, calibration: 1 });
    expect(withDefaults('topics', { id: 't', title: 'x' })).toMatchObject({ cue: null, answer: null, encoding: null, title: 'x' });
  });

  test('keeps a calibration that was set, and repairs one that is not a number', () => {
    expect(withDefaults('skills', { id: 's', calibration: 1.3 }).calibration).toBe(1.3);
    expect(withDefaults('skills', { id: 's', calibration: 'x' }).calibration).toBe(1);
  });

  test('happens on load', () => {
    const d = normaliseDoc({ skills: [{ id: 's', name: 'Old' }], topics: [{ id: 't', title: 'Old' }] });
    expect(d.skills[0].calibration).toBe(1);
    expect(d.topics[0].encoding).toBeNull();
  });
});
