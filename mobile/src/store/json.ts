import AsyncStorage from '@react-native-async-storage/async-storage';
import { Doc, Settings } from '../engine/types';
import { CURRENT_VERSION, normaliseDoc, parseDocument, serialiseDocument } from './format';
import { CollectionName, Collections, Persistence } from './persistence';

/** Where version 2 lives. */
const KEY = 'interval:v2';
/** Where version 1 lived. Read once, then removed after a successful save. */
const LEGACY_KEY = 'interval:v1';
/** Text that would not parse is kept here rather than thrown away. */
const QUARANTINE_KEY = 'interval:unreadable';

/**
 * The whole-document store: the browser's, and the fallback anywhere SQLite
 * will not open.
 *
 * Three things it has to get right, each learned the hard way:
 *
 *  - **One write at a time.** Every operation is a read-modify-write of the
 *    whole document, and the store above fires several without awaiting them —
 *    logging one topic writes the topic, the log entry and any pairs in the
 *    same tick. Run together, each reads before the others have written, they
 *    all build on the same stale copy, and whichever lands last erases the
 *    rest. That is what made logged topics vanish on reload while still
 *    showing on screen.
 *  - **Old files still open.** A document written by an earlier build is read,
 *    migrated in memory, and rewritten in the current format the next time
 *    anything is saved. The old key is only removed once the new one is safely
 *    written, so a crash in between costs nothing.
 *  - **Unreadable is not empty.** Text that will not parse is moved aside
 *    rather than overwritten, and the failure is raised. Coming up blank and
 *    then saving over it is how a recoverable file becomes a lost one.
 */
export function jsonPersistence(): Persistence {
  let cache: Doc | null = null;
  /** Set when the document came from the version 1 key and is still there. */
  let legacyToClear = false;

  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };

  const readFrom = async (key: string): Promise<Doc | null> => {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;

    try {
      const { doc, migrated } = parseDocument(raw);
      if (migrated) console.warn(`interval: migrating a saved document to version ${CURRENT_VERSION}`);
      return doc;
    } catch (e) {
      // Keep the bytes. They are the only copy, and a person who exports them
      // may still get their work back by hand.
      await AsyncStorage.setItem(`${QUARANTINE_KEY}:${Date.now()}`, raw);
      throw new Error(
        `The saved schedule could not be read, so it has been set aside rather than overwritten (${
          e instanceof Error ? e.message : String(e)
        }).`,
      );
    }
  };

  const read = async (): Promise<Doc> => {
    if (cache) return cache;

    const current = await readFrom(KEY);
    if (current) {
      cache = current;
      return cache;
    }

    const legacy = await readFrom(LEGACY_KEY);
    if (legacy) {
      legacyToClear = true;
      cache = legacy;
      return cache;
    }

    cache = normaliseDoc(null);
    return cache;
  };

  const write = async (doc: Doc) => {
    cache = doc;
    await AsyncStorage.setItem(KEY, serialiseDocument(doc));

    // Only now is the old copy redundant.
    if (legacyToClear) {
      legacyToClear = false;
      await AsyncStorage.removeItem(LEGACY_KEY);
    }
  };

  const modify = (change: (doc: Doc) => Doc) =>
    serial(async () => {
      await write(change(await read()));
    });

  return {
    load() {
      return serial(read);
    },

    upsert<K extends CollectionName>(table: K, rows: Collections[K]) {
      return modify((doc) => {
        const byId = new Map<string, { id: string }>((doc[table] as { id: string }[]).map((r) => [r.id, r]));
        for (const row of rows as { id: string }[]) byId.set(row.id, row);
        return { ...doc, [table]: [...byId.values()] } as Doc;
      });
    },

    remove(table: CollectionName, ids: string[]) {
      const gone = new Set(ids);
      return modify(
        (doc) => ({ ...doc, [table]: (doc[table] as { id: string }[]).filter((r) => !gone.has(r.id)) }) as Doc,
      );
    },

    saveSettings(settings: Settings) {
      return modify((doc) => ({ ...doc, settings }));
    },

    replace(doc: Doc) {
      return serial(() => write(normaliseDoc(doc)));
    },

    reset() {
      return serial(async () => {
        cache = null;
        legacyToClear = false;
        await AsyncStorage.multiRemove([KEY, LEGACY_KEY]);
      });
    },
  };
}
