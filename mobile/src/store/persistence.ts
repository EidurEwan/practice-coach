import { Doc, LogEntry, Pair, Review, Settings, Skill, Topic } from '../engine/types';

export type Collections = {
  skills: Skill[];
  topics: Topic[];
  reviews: Review[];
  log_entries: LogEntry[];
  pairs: Pair[];
};

export type CollectionName = keyof Collections;

export const COLLECTIONS: CollectionName[] = ['skills', 'topics', 'reviews', 'log_entries', 'pairs'];

/**
 * The local store is the source of truth. Supabase is a replica of it, so
 * every write lands here first and the app never waits on a network call.
 */
export interface Persistence {
  load(): Promise<Doc>;
  upsert<K extends CollectionName>(table: K, rows: Collections[K]): Promise<void>;
  remove(table: CollectionName, ids: string[]): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
  /** Replaces everything — used by import and by deleting a skill. */
  replace(doc: Doc): Promise<void>;
  /** Wipes the document and every meta value with it. */
  reset(): Promise<void>;
  /**
   * Bookkeeping that belongs to the data beside it — sync's record of what
   * the server holds. It lives in the same store on purpose: if the document
   * is lost or reset, this goes with it, and sync starts over by downloading
   * rather than concluding that every row was deleted here.
   */
  readMeta(key: string): Promise<string | null>;
  writeMeta(key: string, value: string): Promise<void>;
}
