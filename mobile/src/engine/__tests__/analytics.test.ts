import {
  activity,
  bandMix,
  lastPractised,
  needsAttention,
  outlook,
  reachesBand,
  recall,
  recallOn,
  ratingMix,
  skillProgress,
  summary,
  TARGET_RECALL,
  weeklyWorkload,
} from '../analytics';
import { addDays } from '../dates';
import { Review } from '../types';
import { doc, skill, topic } from './factory';

const DAY = '2026-10-14'; // a Wednesday
const maths = skill({ id: 'maths', genre: 'reasoning' });

const review = (id: string, rating: Review['rating'], on: string): Review => ({
  id,
  topic_id: 't',
  rating,
  felt_shaky: false,
  // Midday local, so the local day is `on` wherever the tests run.
  rated_at: new Date(`${on}T12:00:00`).toISOString(),
  prev_interval: 5,
  next_interval: 10,
  updated_at: new Date(`${on}T12:00:00`).toISOString(),
});

describe('the memory model', () => {
  test('a review that lands on time catches recall at the target', () => {
    expect(recall(10, 10)).toBeCloseTo(TARGET_RECALL, 5);
    expect(recall(0, 10)).toBe(1);
  });

  test('a longer gap means slower forgetting', () => {
    expect(recall(10, 40)).toBeGreaterThan(recall(10, 10));
  });

  test('a topic only ever logged was practised one gap before it falls due', () => {
    const t = topic({ last_reviewed_at: null, due_on: addDays(DAY, 3), interval_days: 5 });
    expect(lastPractised(t)).toBe(addDays(DAY, -2));
  });

  test('recall falls the longer a topic goes untouched', () => {
    const t = topic({ last_reviewed_at: null, due_on: DAY, interval_days: 10 });
    expect(recallOn(t, DAY)).toBeCloseTo(TARGET_RECALL, 5);
    expect(recallOn(t, addDays(DAY, 30))).toBeLessThan(recallOn(t, DAY));
  });
});

describe('the outlook', () => {
  const d = doc({
    skills: [maths],
    topics: [
      topic({ id: 'a', skill_id: 'maths', interval_days: 5, repetition: 2, due_on: addDays(DAY, 2) }),
      topic({ id: 'b', skill_id: 'maths', interval_days: 2, repetition: 1, due_on: addDays(DAY, -3) }),
    ],
  });

  test('both futures start from the same place', () => {
    const [now] = outlook(d, DAY, [0]);
    expect(now.keepRecall).toBeCloseTo(now.stopRecall, 10);
  });

  test('keeping up holds recall near the target; stopping lets it fall', () => {
    const [, later] = outlook(d, DAY, [0, 180]);
    expect(later.keepRecall).toBeGreaterThan(0.85);
    expect(later.stopRecall).toBeLessThan(0.3);
  });

  test('keeping up moves topics into stronger bands', () => {
    const [now, year] = outlook(d, DAY, [0, 365]);
    const level = (mix: number[]) => mix.reduce((s, n, i) => s + n * (i + 1), 0);
    expect(level(year.keepBands)).toBeGreaterThan(level(now.keepBands));
    expect(year.keepBands.reduce((a, b) => a + b, 0)).toBe(2);
  });

  test('can be narrowed to one skill', () => {
    const other = { ...d, skills: [...d.skills, skill({ id: 'chem' })], topics: [...d.topics, topic({ id: 'c', skill_id: 'chem' })] };
    expect(outlook(other, DAY, [30], 'maths')[0].keepBands.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe('workload', () => {
  test('counts the reviews keeping up would take, week by week, overdue work this week', () => {
    const d = doc({ skills: [maths], topics: [topic({ skill_id: 'maths', interval_days: 1, repetition: 0, due_on: addDays(DAY, -5) })] });
    const weeks = weeklyWorkload(d, DAY, 4);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].week).toBe('2026-10-12');
    expect(weeks[0].reviews).toBeGreaterThanOrEqual(1);
    // The gaps widen, so the weekly cost falls.
    expect(weeks[3].reviews).toBeLessThanOrEqual(weeks[0].reviews);
  });
});

describe('the summary', () => {
  test('counts ratings, ignores "didn’t get to it", and reads the recall rate', () => {
    const d = doc({
      skills: [maths],
      topics: [topic({ id: 't', skill_id: 'maths' })],
      reviews: [review('1', 'ok', DAY), review('2', 'hard', DAY), review('3', 'pushed', DAY), review('4', 'easy', addDays(DAY, -40))],
    });
    const s = summary(d, DAY);
    expect(s.reviews30).toBe(2);
    expect(s.recallRate30).toBe(0.5);
    expect(s.tracked).toBe(1);
  });

  test('a streak counts back from today, and an unfinished today does not break it', () => {
    const d = doc({ reviews: [review('1', 'ok', addDays(DAY, -1)), review('2', 'ok', addDays(DAY, -2)), review('3', 'ok', addDays(DAY, -4))] });
    expect(summary(d, DAY).streak).toBe(2);
    const withToday = { ...d, reviews: [...d.reviews, review('4', 'ok', DAY)] };
    expect(summary(withToday, DAY).streak).toBe(3);
  });

  test('a logged session counts toward the streak too', () => {
    const d = doc({
      log_entries: [{ id: 'l', skill_id: 'maths', topic_id: null, sub_skill: null, studied_on: DAY, flags: [], created_at: DAY, updated_at: DAY }],
    });
    expect(summary(d, DAY).streak).toBe(1);
  });

  test('nothing tracked reads as nothing, not as zero recall', () => {
    expect(summary(doc(), DAY).recallRate30).toBeNull();
    expect(summary(doc(), DAY).recallNow).toBeNull();
  });
});

describe('activity and ratings', () => {
  test('whole weeks, Monday first, ending this week, with the rest of this week marked future', () => {
    const days = activity(doc({ reviews: [review('1', 'ok', DAY)] }), DAY, 2);
    expect(days).toHaveLength(14);
    expect(days[0].day).toBe('2026-10-05');
    expect(days.find((x) => x.day === DAY)?.count).toBe(1);
    expect(days[days.length - 1].future).toBe(true);
  });

  test('the rating mix covers the window and leaves out pushes', () => {
    const d = doc({ reviews: [review('1', 'ok', DAY), review('2', 'failed', DAY), review('3', 'pushed', DAY), review('4', 'ok', addDays(DAY, -60))] });
    expect(ratingMix(d, DAY, 30)).toEqual({ failed: 1, hard: 0, ok: 1, easy: 0 });
  });
});

describe('per skill, and what needs a look', () => {
  const d = doc({
    skills: [maths],
    topics: [
      topic({ id: 'weak', skill_id: 'maths', penalty: 0.7, interval_days: 3, due_on: addDays(DAY, 1) }),
      topic({ id: 'late', skill_id: 'maths', interval_days: 5, due_on: addDays(DAY, -12) }),
      topic({ id: 'fine', skill_id: 'maths', interval_days: 22, due_on: addDays(DAY, 20) }),
    ],
  });

  test('weak points come first, then whatever has slipped furthest; healthy topics are left off', () => {
    const list = needsAttention(d, DAY, 5);
    expect(list.map((a) => a.topic.id)).toEqual(['weak', 'late']);
    expect(list[1].why).toBe('12 days overdue');
  });

  test('each skill gets its bands now and later', () => {
    const [p] = skillProgress(d, DAY, 180);
    expect(p.topics).toBe(3);
    expect(p.bandsNow.reduce((a, b) => a + b, 0)).toBe(3);
    expect(p.bandsLater.reduce((a, b) => a + b, 0)).toBe(3);
  });

  test('says when a topic reaches a band, and nothing if it is already there', () => {
    const t = topic({ skill_id: 'maths', interval_days: 5, repetition: 2, due_on: addDays(DAY, 2) });
    const strong = reachesBand(t, maths, 4, DAY);
    expect(strong && strong > DAY).toBe(true);
    expect(reachesBand(t, maths, 2, DAY)).toBeNull();
  });

  test('band mix counts each band once', () => {
    expect(bandMix([1, 5, 20, 100, 400])).toEqual([1, 1, 1, 1, 1]);
  });
});
