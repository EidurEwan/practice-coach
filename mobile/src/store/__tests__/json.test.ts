import AsyncStorage from '@react-native-async-storage/async-storage';
import { jsonPersistence } from '../json';
import { parseDocument } from '../format';
import { skill, topic } from '../../engine/__tests__/factory';

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        // A real write is not instant. Yielding here is what lets a second
        // read-modify-write slip in on a stale copy — which is the whole bug.
        await new Promise((r) => setTimeout(r, 0));
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
      multiRemove: jest.fn(async (keys: string[]) => {
        for (const k of keys) delete store[k];
      }),
      __reset: () => {
        store = {};
      },
      __keys: () => store,
    },
  };
});

const reset = () => (AsyncStorage as unknown as { __reset: () => void }).__reset();

describe('the JSON store under concurrent writes', () => {
  beforeEach(reset);

  /**
   * `logStudy` writes the topic, the log entry and any pairs without awaiting
   * any of them — three read-modify-write cycles on one document, started in
   * the same tick. If they each read before the others write, the last one to
   * finish wins and the rest are silently gone.
   */
  it('keeps every collection when three writes are fired at once', async () => {
    const p = jsonPersistence();
    const s = skill();
    const t = topic({ skill_id: s.id, title: 'Le Chatelier' });
    const entry = {
      id: 'log-1',
      skill_id: s.id,
      topic_id: t.id,
      sub_skill: null,
      studied_on: '2026-08-27',
      flags: [],
      created_at: '2026-08-27T09:00:00.000Z',
      updated_at: '2026-08-27T09:00:00.000Z',
    };

    // Exactly how the store issues them: no awaits between.
    const writes = [p.upsert('skills', [s]), p.upsert('topics', [t]), p.upsert('log_entries', [entry])];
    await Promise.all(writes);

    // Read through a fresh instance, so nothing is served from memory.
    const reloaded = await jsonPersistence().load();
    expect(reloaded.skills).toHaveLength(1);
    expect(reloaded.topics).toHaveLength(1);
    expect(reloaded.log_entries).toHaveLength(1);
    expect(reloaded.topics[0].title).toBe('Le Chatelier');
  });

  it('never leaves a log entry pointing at a topic that is gone', async () => {
    const p = jsonPersistence();
    const s = skill();
    const t = topic({ skill_id: s.id });
    await Promise.all([
      p.upsert('topics', [t]),
      p.upsert('log_entries', [
        {
          id: 'log-2',
          skill_id: s.id,
          topic_id: t.id,
          sub_skill: null,
          studied_on: '2026-08-27',
          flags: [],
          created_at: '2026-08-27T09:00:00.000Z',
          updated_at: '2026-08-27T09:00:00.000Z',
        },
      ]),
    ]);

    const reloaded = await jsonPersistence().load();
    const ids = new Set(reloaded.topics.map((x) => x.id));
    for (const e of reloaded.log_entries) {
      expect(ids.has(e.topic_id!)).toBe(true);
    }
  });

  it('erases everything, and stays erased on the next read', async () => {
    const p = jsonPersistence();
    const s = skill();
    await p.upsert('skills', [s]);
    await p.upsert('topics', [topic({ skill_id: s.id })]);

    await p.reset();

    expect((await p.load()).skills).toHaveLength(0);
    const reloaded = await jsonPersistence().load();
    expect(reloaded.skills).toHaveLength(0);
    expect(reloaded.topics).toHaveLength(0);
  });
});


const raw = (k: string) => (AsyncStorage.getItem as unknown as (k: string) => Promise<string | null>)(k);

describe('opening what an earlier build saved', () => {
  beforeEach(reset);

  it('reads a version 1 document and hands it over whole', async () => {
    const s = skill({ name: 'Chemistry' });
    const t = topic({ skill_id: s.id, title: 'Le Chatelier' });
    // Exactly how the old build wrote it: the bare document, at the old key.
    await AsyncStorage.setItem(
      'interval:v1',
      JSON.stringify({ skills: [s], topics: [t], reviews: [], log_entries: [], pairs: [], settings: { daily_capacity: 12, theme: 'dark', pre_deadline_days: 21, exam_date: null, onboarded: true, updated_at: '2026-08-01T00:00:00.000Z' } }),
    );

    const loaded = await jsonPersistence().load();

    expect(loaded.skills[0].name).toBe('Chemistry');
    expect(loaded.topics[0].title).toBe('Le Chatelier');
    expect(loaded.settings.daily_capacity).toBe(12);
    expect(loaded.settings.theme).toBe('dark');
  });

  it('leaves the old copy alone until the new one is written', async () => {
    const s = skill();
    await AsyncStorage.setItem('interval:v1', JSON.stringify({ skills: [s], topics: [], reviews: [], log_entries: [], pairs: [], settings: {} }));

    const p = jsonPersistence();
    await p.load();

    // Nothing saved yet: a crash here must still leave the original readable.
    expect(await raw('interval:v1')).not.toBeNull();
    expect(await raw('interval:v2')).toBeNull();
  });

  it('upgrades in place on the next save, and only then drops the old key', async () => {
    const s = skill({ name: 'Chemistry' });
    await AsyncStorage.setItem('interval:v1', JSON.stringify({ skills: [s], topics: [], reviews: [], log_entries: [], pairs: [], settings: {} }));

    const p = jsonPersistence();
    await p.load();
    await p.upsert('topics', [topic({ skill_id: s.id, title: 'Titration' })]);

    expect(await raw('interval:v1')).toBeNull();

    const stored = await raw('interval:v2');
    expect(stored).not.toBeNull();
    const { doc: after, from } = parseDocument(stored!);
    expect(from).toBe(2);
    // The old work and the new write are both there.
    expect(after.skills[0].name).toBe('Chemistry');
    expect(after.topics[0].title).toBe('Titration');
  });

  it('prefers the current key when both exist', async () => {
    await AsyncStorage.setItem('interval:v1', JSON.stringify({ skills: [skill({ name: 'stale' })], settings: {} }));
    await AsyncStorage.setItem('interval:v2', JSON.stringify({ format: 'interval', version: 2, savedAt: '2026-08-27T00:00:00.000Z', doc: { skills: [skill({ name: 'current' })], topics: [], reviews: [], log_entries: [], pairs: [], settings: {} } }));

    expect((await jsonPersistence().load()).skills[0].name).toBe('current');
  });

  it('sets unreadable text aside instead of writing over it', async () => {
    await AsyncStorage.setItem('interval:v2', '{ this is not json');

    await expect(jsonPersistence().load()).rejects.toThrow(/could not be read/i);

    // The bytes are still somewhere they can be recovered from.
    const keys = Object.keys((AsyncStorage as unknown as { __keys: () => string[] }).__keys());
    expect(keys.some((k) => k.startsWith('interval:unreadable'))).toBe(true);
  });
});
