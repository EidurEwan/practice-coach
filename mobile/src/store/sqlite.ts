import * as SQLite from 'expo-sqlite';
import { DEFAULT_SETTINGS, Doc, LogEntry, Pair, Review, Settings, Skill, Topic } from '../engine/types';
import { CollectionName, COLLECTIONS, Collections, Persistence } from './persistence';

const DB_NAME = 'interval.db';

/** Mirrors the Supabase tables, minus `user_id` — on the phone there is one user. */
const SCHEMA = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  genre TEXT NOT NULL,
  physical_kind TEXT,
  hue_index INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY NOT NULL,
  skill_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sub_skill TEXT,
  state TEXT NOT NULL,
  interval_days REAL NOT NULL,
  ease REAL NOT NULL,
  repetition INTEGER NOT NULL,
  streak INTEGER NOT NULL,
  penalty REAL NOT NULL,
  format_rung INTEGER NOT NULL,
  due_on TEXT NOT NULL,
  last_reviewed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS topics_due ON topics (due_on);
CREATE INDEX IF NOT EXISTS topics_skill ON topics (skill_id);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY NOT NULL,
  topic_id TEXT NOT NULL,
  rating TEXT NOT NULL,
  felt_shaky INTEGER NOT NULL,
  rated_at TEXT NOT NULL,
  prev_interval REAL NOT NULL,
  next_interval REAL NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_topic ON reviews (topic_id);

CREATE TABLE IF NOT EXISTS log_entries (
  id TEXT PRIMARY KEY NOT NULL,
  skill_id TEXT NOT NULL,
  topic_id TEXT,
  sub_skill TEXT,
  studied_on TEXT NOT NULL,
  flags TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pairs (
  id TEXT PRIMARY KEY NOT NULL,
  topic_a TEXT NOT NULL,
  topic_b TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

const COLUMNS: Record<CollectionName, string[]> = {
  skills: ['id', 'name', 'genre', 'physical_kind', 'hue_index', 'archived_at', 'created_at', 'updated_at'],
  topics: [
    'id', 'skill_id', 'title', 'sub_skill', 'state', 'interval_days', 'ease', 'repetition',
    'streak', 'penalty', 'format_rung', 'due_on', 'last_reviewed_at', 'archived_at', 'created_at', 'updated_at',
  ],
  reviews: ['id', 'topic_id', 'rating', 'felt_shaky', 'rated_at', 'prev_interval', 'next_interval', 'updated_at'],
  log_entries: ['id', 'skill_id', 'topic_id', 'sub_skill', 'studied_on', 'flags', 'created_at', 'updated_at'],
  pairs: ['id', 'topic_a', 'topic_b', 'created_at', 'updated_at'],
};

/**
 * How to add each column to a table that predates it.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists, so
 * a database written by an older build keeps that build's columns forever.
 * Every insert then fails with "no such column", and because the in-memory doc
 * has already been updated the row looks saved until the app is restarted.
 *
 * SQLite needs a non-null default to add a NOT NULL column to a table with
 * rows in it, so each one carries the default the schema gives it.
 */
const COLUMN_DDL: Record<CollectionName, Record<string, string>> = {
  skills: {
    id: 'TEXT', name: 'TEXT', genre: 'TEXT', physical_kind: 'TEXT',
    hue_index: 'INTEGER NOT NULL DEFAULT 0', archived_at: 'TEXT',
    created_at: 'TEXT', updated_at: 'TEXT',
  },
  topics: {
    id: 'TEXT', skill_id: 'TEXT', title: 'TEXT', sub_skill: 'TEXT',
    state: "TEXT NOT NULL DEFAULT 'new'",
    interval_days: 'REAL NOT NULL DEFAULT 1',
    ease: 'REAL NOT NULL DEFAULT 2.5',
    repetition: 'INTEGER NOT NULL DEFAULT 0',
    streak: 'INTEGER NOT NULL DEFAULT 0',
    penalty: 'REAL NOT NULL DEFAULT 1',
    format_rung: 'INTEGER NOT NULL DEFAULT 0',
    due_on: "TEXT NOT NULL DEFAULT ''",
    last_reviewed_at: 'TEXT', archived_at: 'TEXT',
    created_at: 'TEXT', updated_at: 'TEXT',
  },
  reviews: {
    id: 'TEXT', topic_id: 'TEXT', rating: 'TEXT',
    felt_shaky: 'INTEGER NOT NULL DEFAULT 0',
    rated_at: 'TEXT', prev_interval: 'REAL NOT NULL DEFAULT 0',
    next_interval: 'REAL NOT NULL DEFAULT 0', updated_at: 'TEXT',
  },
  log_entries: {
    id: 'TEXT', skill_id: 'TEXT', topic_id: 'TEXT', sub_skill: 'TEXT',
    studied_on: "TEXT NOT NULL DEFAULT ''",
    flags: "TEXT NOT NULL DEFAULT '[]'",
    created_at: 'TEXT', updated_at: 'TEXT',
  },
  pairs: {
    id: 'TEXT', topic_a: 'TEXT', topic_b: 'TEXT', created_at: 'TEXT', updated_at: 'TEXT',
  },
};

/**
 * Brings an existing database up to the current schema. Returns the columns it
 * had to add, so a silent repair is still visible in the logs.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const added: string[] = [];
  for (const table of COLLECTIONS) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!info.length) continue; // Freshly created by SCHEMA; nothing to reconcile.
    const have = new Set(info.map((c) => c.name));
    for (const col of COLUMNS[table]) {
      if (have.has(col)) continue;
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${col} ${COLUMN_DDL[table][col]}`);
      added.push(`${table}.${col}`);
    }
  }
  return added;
}

type Row = Record<string, unknown>;

/** SQLite has no booleans and no arrays; these two are the only conversions. */
function toRow(table: CollectionName, record: Row): unknown[] {
  return COLUMNS[table].map((col) => {
    const v = record[col];
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (Array.isArray(v)) return JSON.stringify(v);
    return v === undefined ? null : v;
  });
}

function fromRow(table: CollectionName, row: Row): Row {
  if (table === 'reviews') return { ...row, felt_shaky: !!row.felt_shaky };
  if (table === 'log_entries') return { ...row, flags: JSON.parse(String(row.flags ?? '[]')) };
  return row;
}

export async function sqlitePersistence(): Promise<Persistence> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(SCHEMA);

  const added = await migrate(db);
  if (added.length) console.warn(`interval.db was missing ${added.length} column(s), added: ${added.join(', ')}`);

  /**
   * One write at a time. A single log can fan out into three writes that are
   * not awaited by the caller, and two transactions overlapping on the same
   * connection fail with "cannot rollback - no transaction is active" — which
   * loses whichever write came second.
   */
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };

  const upsert = <K extends CollectionName>(table: K, rows: Collections[K]) =>
    serial(async () => {
      if (!rows.length) return;
      const cols = COLUMNS[table];
      const placeholders = `(${cols.map(() => '?').join(', ')})`;
      const setters = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders}
                   ON CONFLICT(id) DO UPDATE SET ${setters}`;
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const row of rows as unknown as Row[]) {
          await tx.runAsync(sql, toRow(table, row) as SQLite.SQLiteBindValue[]);
        }
      });
    });

  const saveSettings = (settings: Settings) =>
    serial(async () => {
      await db.runAsync(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ['settings', JSON.stringify(settings)],
      );
    });

  return {
    async load(): Promise<Doc> {
      const out: Record<string, unknown[]> = {};
      for (const table of COLLECTIONS) {
        const rows = await db.getAllAsync<Row>(`SELECT * FROM ${table}`);
        out[table] = rows.map((r) => fromRow(table, r));
      }
      const saved = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = ?',
        ['settings'],
      );
      return {
        skills: out.skills as Skill[],
        topics: out.topics as Topic[],
        reviews: out.reviews as Review[],
        log_entries: out.log_entries as LogEntry[],
        pairs: out.pairs as Pair[],
        settings: saved ? { ...DEFAULT_SETTINGS, ...(JSON.parse(saved.value) as Settings) } : { ...DEFAULT_SETTINGS },
      };
    },

    upsert,

    remove(table: CollectionName, ids: string[]) {
      return serial(async () => {
        if (!ids.length) return;
        const holes = ids.map(() => '?').join(', ');
        await db.runAsync(`DELETE FROM ${table} WHERE id IN (${holes})`, ids);
      });
    },

    saveSettings,

    /**
     * Swap the whole document in one transaction.
     *
     * This used to delete every table, commit, and only then re-insert. A
     * failure anywhere in the second half — one bad column, one bad row — left
     * the database emptier than it started, with no way back, and it runs on
     * every sync. Deleting and re-inserting inside a single exclusive
     * transaction means a failure rolls back to the previous contents instead.
     */
    async replace(doc: Doc) {
      await serial(async () => {
        await db.withExclusiveTransactionAsync(async (tx) => {
          for (const table of COLLECTIONS) await tx.runAsync(`DELETE FROM ${table}`);

          for (const table of COLLECTIONS) {
            const rows = doc[table] as unknown as Row[];
            if (!rows.length) continue;
            const cols = COLUMNS[table];
            const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
            for (const row of rows) {
              await tx.runAsync(sql, toRow(table, row) as SQLite.SQLiteBindValue[]);
            }
          }
        });
      });
      await saveSettings(doc.settings);
    },

    reset() {
      return serial(async () => {
        await db.withExclusiveTransactionAsync(async (tx) => {
          for (const table of COLLECTIONS) await tx.runAsync(`DELETE FROM ${table}`);
          await tx.runAsync('DELETE FROM app_settings');
        });
      });
    },
  };
}
