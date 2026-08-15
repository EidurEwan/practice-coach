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
    async load() {
      return read();
    },

    async upsert<K extends CollectionName>(table: K, rows: Collections[K]) {
      const doc = await read();
      const byId = new Map<string, { id: string }>((doc[table] as { id: string }[]).map((r) => [r.id, r]));
      for (const row of rows as { id: string }[]) byId.set(row.id, row);
      await write({ ...doc, [table]: [...byId.values()] } as Doc);
    },

    async remove(table: CollectionName, ids: string[]) {
      const doc = await read();
      const gone = new Set(ids);
      await write({ ...doc, [table]: (doc[table] as { id: string }[]).filter((r) => !gone.has(r.id)) } as Doc);
    },

    async saveSettings(settings: Settings) {
      await write({ ...(await read()), settings });
    },

    async replace(doc: Doc) {
      await write(doc);
    },

    async reset() {
      cache = null;
      await AsyncStorage.removeItem(KEY);
    },
  };
}
