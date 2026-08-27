import AsyncStorage from '@react-native-async-storage/async-storage';
import { jsonPersistence } from '../json';
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
      __reset: () => {
        store = {};
      },
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
