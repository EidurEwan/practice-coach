import { doc, skill, topic } from '../../engine/__tests__/factory';
import { DEFAULT_SETTINGS } from '../../engine/types';
import {
  acknowledge,
  applyIncoming,
  emptyBase,
  outgoing,
  parseMeta,
  sameRow,
  stampOf,
  sweepOrphans,
  WireRow,
} from '../protocol';

const T0 = '2026-10-01T09:00:00.000Z';
const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-01T11:00:00.000Z';
const NOW = '2026-10-01T12:00:00.000Z';

const wire = (over: Partial<WireRow> & Pick<WireRow, 'collection' | 'id'>): WireRow => ({
  updated_at: T1,
  deleted: false,
  data: null,
  ...over,
});

describe('what goes up', () => {
  test('rows new since the last sync, and only those', () => {
    const base = emptyBase();
    base.skills.old = stampOf(T0);
    const d = doc({ skills: [skill({ id: 'old', updated_at: T0 }), skill({ id: 'new', updated_at: T1 })] });
    expect(outgoing(d, base, NOW).filter((r) => r.collection === 'skills').map((r) => r.id)).toEqual(['new']);
  });

  test('an edited row, recognised whatever the server wrote its time as', () => {
    const base = emptyBase();
    base.topics.t = stampOf('2026-10-01T09:00:00+00:00');
    const same = doc({ topics: [topic({ id: 't', updated_at: T0 })] });
    const edited = doc({ topics: [topic({ id: 't', updated_at: T1 })] });
    expect(outgoing(same, base, NOW).filter((r) => r.collection === 'topics')).toEqual([]);
    expect(outgoing(edited, base, NOW).map((r) => r.id)).toContain('t');
  });

  test('a row in the base and gone from the device goes up as a deletion', () => {
    const base = emptyBase();
    base.reviews.undone = stampOf(T0);
    const out = outgoing(doc(), base, NOW);
    expect(out).toContainEqual({ collection: 'reviews', id: 'undone', updated_at: NOW, deleted: true, data: null });
  });

  test('parents before children, deletions last', () => {
    const base = emptyBase();
    base.pairs.gone = 1;
    const d = doc({ skills: [skill({ id: 's' })], topics: [topic({ id: 't', skill_id: 's' })] });
    const order = outgoing(d, base, NOW).map((r) => `${r.collection}:${r.deleted ? 'x' : '+'}`);
    expect(order).toEqual(['skills:+', 'topics:+', 'settings:+', 'pairs:x']);
  });

  test('settings go up when they change', () => {
    const base = emptyBase();
    const d = doc();
    expect(outgoing(d, base, NOW).map((r) => r.collection)).toEqual(['settings']);
    expect(outgoing(d, acknowledge(base, outgoing(d, base, NOW)), NOW)).toEqual([]);
  });

  test('an unreadable timestamp is sent once, not on every sync', () => {
    const d = doc({ skills: [skill({ id: 's', updated_at: 'garbage' })] });
    const first = outgoing(d, emptyBase(), NOW);
    expect(first.find((r) => r.id === 's')?.updated_at).toBe('1970-01-01T00:00:00.000Z');
    expect(outgoing(d, acknowledge(emptyBase(), first), NOW)).toEqual([]);
  });
});

describe('what comes down', () => {
  test('a newer row from the server replaces the one here', () => {
    const live = doc({ topics: [topic({ id: 't', title: 'mine', updated_at: T0 })] });
    const theirs = topic({ id: 't', title: 'theirs', updated_at: T1 });
    const r = applyIncoming(live, emptyBase(), [wire({ collection: 'topics', id: 't', updated_at: T1, data: theirs })]);
    expect(r.doc.topics[0].title).toBe('theirs');
    expect(r.patch.upserts.topics).toEqual([theirs]);
    expect(r.base.topics.t).toBe(stampOf(T1));
  });

  test('an older row from the server leaves a newer one here alone, to be pushed', () => {
    const live = doc({ topics: [topic({ id: 't', title: 'mine', updated_at: T2 })] });
    const r = applyIncoming(live, emptyBase(), [
      wire({ collection: 'topics', id: 't', updated_at: T1, data: topic({ id: 't', title: 'theirs', updated_at: T1 }) }),
    ]);
    expect(r.doc.topics[0].title).toBe('mine');
    expect(r.changed).toBe(0);
    expect(outgoing(r.doc, r.base, NOW).map((x) => x.id)).toContain('t');
  });

  test('a tie goes to the server, as it does on the server', () => {
    const live = doc({ topics: [topic({ id: 't', title: 'mine', updated_at: T1 })] });
    const r = applyIncoming(live, emptyBase(), [
      wire({ collection: 'topics', id: 't', updated_at: T1, data: topic({ id: 't', title: 'theirs', updated_at: T1 }) }),
    ]);
    expect(r.doc.topics[0].title).toBe('theirs');
  });

  test('the same row back from the server, keys reordered, is not a change', () => {
    const mine = topic({ id: 't', updated_at: T1 });
    const reordered = Object.fromEntries(Object.entries(mine).reverse());
    const r = applyIncoming(doc({ topics: [mine] }), emptyBase(), [
      wire({ collection: 'topics', id: 't', updated_at: '2026-10-01T10:00:00+00:00', data: reordered }),
    ]);
    expect(r.changed).toBe(0);
    expect(r.patch.upserts).toEqual({});
  });

  test('a tombstone deletes the row here, even one edited since', () => {
    const live = doc({ reviews: [], topics: [topic({ id: 't', updated_at: T2 })] });
    const base = emptyBase();
    base.topics.t = stampOf(T0);
    const r = applyIncoming(live, base, [wire({ collection: 'topics', id: 't', deleted: true })]);
    expect(r.doc.topics).toEqual([]);
    expect(r.patch.removes.topics).toEqual(['t']);
    expect(r.base.topics).toEqual({});
  });

  test('a row deleted here and not yet pushed is not brought back', () => {
    const base = emptyBase();
    base.skills.s = stampOf(T0);
    const r = applyIncoming(doc(), base, [
      wire({ collection: 'skills', id: 's', updated_at: T1, data: skill({ id: 's', updated_at: T1 }) }),
    ]);
    expect(r.doc.skills).toEqual([]);
    expect(outgoing(r.doc, r.base, NOW)).toContainEqual(expect.objectContaining({ id: 's', deleted: true }));
  });

  test('rows of a kind this build does not know are left alone', () => {
    const r = applyIncoming(doc(), emptyBase(), [
      wire({ collection: 'flashcards' as never, id: 'f', data: { id: 'f' } }),
    ]);
    expect(r.changed).toBe(0);
    expect(r.base).toEqual(emptyBase());
  });

  test('a row whose document does not match its id is ignored', () => {
    const r = applyIncoming(doc(), emptyBase(), [wire({ collection: 'skills', id: 's', data: { id: 'other' } })]);
    expect(r.doc.skills).toEqual([]);
    expect(r.base.skills).toEqual({});
  });

  test('the first time an account is seen, its settings win however old', () => {
    const live = doc({ settings: { ...DEFAULT_SETTINGS, daily_capacity: 8, onboarded: true, updated_at: T2 } });
    const theirs = { ...DEFAULT_SETTINGS, daily_capacity: 12, onboarded: true, updated_at: T0 };
    const r = applyIncoming(live, emptyBase(), [wire({ collection: 'settings', id: 'settings', updated_at: T0, data: theirs })]);
    expect(r.doc.settings.daily_capacity).toBe(12);
    expect(r.patch.settings).toEqual(theirs);
    expect(outgoing(r.doc, r.base, NOW)).toEqual([]);
  });

  test('after that, settings follow the later timestamp', () => {
    const base = emptyBase();
    base.settings.settings = stampOf(T0);
    const live = doc({ settings: { ...DEFAULT_SETTINGS, daily_capacity: 8, updated_at: T2 } });
    const theirs = { ...DEFAULT_SETTINGS, daily_capacity: 12, updated_at: T1 };
    const r = applyIncoming(live, base, [wire({ collection: 'settings', id: 'settings', updated_at: T1, data: theirs })]);
    expect(r.doc.settings.daily_capacity).toBe(8);
  });

  test('settings missing a field this build added get its default', () => {
    const { exam_date: _, ...older } = { ...DEFAULT_SETTINGS, daily_capacity: 4, updated_at: T1 };
    const r = applyIncoming(doc(), emptyBase(), [wire({ collection: 'settings', id: 'settings', data: older })]);
    expect(r.doc.settings.exam_date).toBeNull();
    expect(r.doc.settings.daily_capacity).toBe(4);
  });

  test('the base passed in is not modified', () => {
    const base = emptyBase();
    applyIncoming(doc(), base, [wire({ collection: 'skills', id: 's', data: skill({ id: 's' }) })]);
    acknowledge(base, [wire({ collection: 'skills', id: 's' })]);
    expect(base).toEqual(emptyBase());
  });
});

describe('orphans', () => {
  test('rows whose parent is gone are swept, and nothing else', () => {
    const at = T0;
    const live = doc({
      skills: [skill({ id: 'kept' })],
      topics: [topic({ id: 'ok', skill_id: 'kept' }), topic({ id: 'stray', skill_id: 'gone' })],
      reviews: [
        { id: 'r-ok', topic_id: 'ok', rating: 'ok', felt_shaky: false, rated_at: at, prev_interval: 1, next_interval: 3, updated_at: at },
        { id: 'r-stray', topic_id: 'stray', rating: 'ok', felt_shaky: false, rated_at: at, prev_interval: 1, next_interval: 3, updated_at: at },
      ],
      pairs: [{ id: 'p', topic_a: 'ok', topic_b: 'stray', created_at: at, updated_at: at }],
      log_entries: [
        { id: 'l-ok', skill_id: 'kept', topic_id: null, sub_skill: null, studied_on: '2026-10-01', flags: [], created_at: at, updated_at: at },
        { id: 'l-stray', skill_id: 'gone', topic_id: null, sub_skill: null, studied_on: '2026-10-01', flags: [], created_at: at, updated_at: at },
      ],
    });
    const r = sweepOrphans(live)!;
    expect(r.patch.removes).toEqual({ topics: ['stray'], reviews: ['r-stray'], pairs: ['p'], log_entries: ['l-stray'] });
    expect(r.doc.topics.map((t) => t.id)).toEqual(['ok']);
  });

  test('a tidy document is left as it is', () => {
    expect(sweepOrphans(doc({ skills: [skill({ id: 's' })], topics: [topic({ skill_id: 's' })] }))).toBeNull();
  });
});

describe('saved bookkeeping', () => {
  test('reads back what was written', () => {
    const meta = { version: 1 as const, cursor: 42, base: { ...emptyBase(), skills: { s: 1 } } };
    expect(parseMeta(JSON.stringify(meta))).toEqual(meta);
  });

  test('anything else reads as nothing, which is always safe', () => {
    for (const raw of [null, '', 'not json', '[]', '{"version":2,"cursor":1,"base":{}}', '{"version":1}']) {
      expect(parseMeta(raw)).toBeNull();
    }
  });
});

test('row equality ignores key order and absent fields', () => {
  expect(sameRow({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
  expect(sameRow({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  expect(sameRow({ a: 1 }, { a: 2 })).toBe(false);
  expect(sameRow({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
});
