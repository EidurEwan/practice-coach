import AsyncStorage from '@react-native-async-storage/async-storage';
import { Doc, emptyDoc, Settings } from '../engine/types';
import { CollectionName, Collections, Persistence } from './persistence';

const KEY = 'interval:v1';

/**
 * A whole-document store, used where SQLite is not available (web preview, and
 * as the fallback if the database will not open). Same contract, same shape —
 * the app above it cannot tell the difference.
 */
export function jsonPersistence(): Persistence {
  let cache: Doc | null = null;

  /**
   * One write at a time.
   *
   * Every operation here is a read-modify-write of the whole document, and the
   * store fires several without awaiting them — logging one topic writes the
   * topic, the log entry and any pairs in the same tick. Started together,
   * each reads before the others have written, so all of them build on the
   * same stale copy and whichever finishes last silently erases the rest.
   *
   * That is what made logged topics vanish on reload while still showing on
   * screen: the in-memory document was right and the saved one had dropped a
   * collection. Queuing means each read sees the write before it.
   */
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };

  const read = async (): Promise<Doc> => {
    if (cache) return cache;
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? { ...emptyDoc(), ...(JSON.parse(raw) as Doc) } : emptyDoc();
    return cache;
  };

  const write = async (doc: Doc) => {
    cache = doc;
    await AsyncStorage.setItem(KEY, JSON.stringify(doc));
  };

  return {
    load() {
      return serial(read);
    },

    upsert<K extends CollectionName>(table: K, rows: Collections[K]) {
      return serial(async () => {
        const doc = await read();
        const byId = new Map<string, { id: string }>((doc[table] as { id: string }[]).map((r) => [r.id, r]));
        for (const row of rows as { id: string }[]) byId.set(row.id, row);
        await write({ ...doc, [table]: [...byId.values()] } as Doc);
      });
    },

    remove(table: CollectionName, ids: string[]) {
      return serial(async () => {
        const doc = await read();
        const gone = new Set(ids);
        await write({ ...doc, [table]: (doc[table] as { id: string }[]).filter((r) => !gone.has(r.id)) } as Doc);
      });
    },

    saveSettings(settings: Settings) {
      return serial(async () => {
        await write({ ...(await read()), settings });
      });
    },

    replace(doc: Doc) {
      return serial(() => write(doc));
    },

    reset() {
      return serial(async () => {
        cache = null;
        await AsyncStorage.removeItem(KEY);
      });
    },
  };
}
