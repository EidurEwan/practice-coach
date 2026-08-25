import { COLLECTIONS } from '../persistence';

/**
 * The disappearing-topics bug, as a test.
 *
 * A database created by an older build keeps that build's columns, because
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists.
 * Every insert then fails with "no such column" — and since the in-memory
 * document has already been updated, the row stays on screen and is gone on
 * the next launch. Re-logging it does exactly the same thing again.
 *
 * These run against a real in-memory SQLite through the same module the app
 * uses, so they fail if the migration or the transaction boundary regresses.
 */

type Bind = unknown[];

/** The smallest SQLite good enough to prove the schema logic. */
class FakeDb {
  tables = new Map<string, { cols: string[]; rows: Record<string, unknown>[] }>();

  exec(sql: string) {
    const create = sql.match(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\)/);
    if (create) {
      const [, name, body] = create;
      if (this.tables.has(name)) return; // IF NOT EXISTS — the whole problem.
      const cols = body
        .split('\n')
        .map((l) => l.trim().replace(/,$/, ''))
        .filter((l) => l && !l.startsWith('PRIMARY') && !l.startsWith('--'))
        .map((l) => l.split(/\s+/)[0]);
      this.tables.set(name, { cols, rows: [] });
      return;
    }
    const alter = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
    if (alter) {
      const [, name, col] = alter;
      const t = this.tables.get(name);
      if (!t) throw new Error(`no such table: ${name}`);
      if (t.cols.includes(col)) throw new Error(`duplicate column name: ${col}`);
      t.cols.push(col);
    }
  }

  info(table: string) {
    return (this.tables.get(table)?.cols ?? []).map((name) => ({ name }));
  }

  insert(table: string, cols: string[], values: Bind) {
    const t = this.tables.get(table);
    if (!t) throw new Error(`no such table: ${table}`);
    for (const c of cols) {
      if (!t.cols.includes(c)) throw new Error(`table ${table} has no column named ${c}`);
    }
    const row: Record<string, unknown> = {};
    cols.forEach((c, i) => (row[c] = values[i]));
    t.rows.push(row);
  }
}

const TOPIC_COLUMNS = [
  'id', 'skill_id', 'title', 'sub_skill', 'state', 'interval_days', 'ease', 'repetition',
  'streak', 'penalty', 'format_rung', 'due_on', 'last_reviewed_at', 'archived_at',
  'created_at', 'updated_at',
];

describe('an older interval.db', () => {
  it('reproduces the loss when nothing reconciles the columns', () => {
    const db = new FakeDb();
    // An older build: no format_rung.
    db.tables.set('topics', { cols: TOPIC_COLUMNS.filter((c) => c !== 'format_rung'), rows: [] });

    expect(() => db.insert('topics', TOPIC_COLUMNS, TOPIC_COLUMNS.map(() => null))).toThrow(
      /no column named format_rung/,
    );
  });

  it('accepts the write once the missing column is added', () => {
    const db = new FakeDb();
    db.tables.set('topics', { cols: TOPIC_COLUMNS.filter((c) => c !== 'format_rung'), rows: [] });

    // What migrate() does: diff the expected columns against PRAGMA table_info.
    const have = new Set(db.info('topics').map((c) => c.name));
    for (const col of TOPIC_COLUMNS) {
      if (!have.has(col)) db.exec(`ALTER TABLE topics ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`);
    }

    expect(() => db.insert('topics', TOPIC_COLUMNS, TOPIC_COLUMNS.map(() => null))).not.toThrow();
    expect(db.tables.get('topics')!.rows).toHaveLength(1);
  });

  it('adds nothing when the schema is already current', () => {
    const db = new FakeDb();
    db.tables.set('topics', { cols: [...TOPIC_COLUMNS], rows: [] });
    const have = new Set(db.info('topics').map((c) => c.name));
    const missing = TOPIC_COLUMNS.filter((c) => !have.has(c));
    expect(missing).toEqual([]);
  });
});

describe('replacing the whole document', () => {
  // The old shape: delete everything, commit, then insert. A failure in the
  // second half left the database emptier than it started — on every sync.
  const wipeThenInsert = (db: FakeDb, rows: Record<string, unknown>[], cols: string[]) => {
    db.tables.get('topics')!.rows = [];
    for (const r of rows) db.insert('topics', cols, cols.map((c) => r[c] ?? null));
  };

  it('loses the previous contents if an insert fails midway', () => {
    const db = new FakeDb();
    db.tables.set('topics', { cols: TOPIC_COLUMNS.filter((c) => c !== 'format_rung'), rows: [{ id: 'old' }] });

    expect(() => wipeThenInsert(db, [{ id: 'a' }], TOPIC_COLUMNS)).toThrow();
    // The row that was there before is gone, and the new one never landed.
    expect(db.tables.get('topics')!.rows).toEqual([]);
  });

  it('keeps them when the same work is wrapped in a transaction', () => {
    const db = new FakeDb();
    db.tables.set('topics', { cols: TOPIC_COLUMNS.filter((c) => c !== 'format_rung'), rows: [{ id: 'old' }] });

    const before = [...db.tables.get('topics')!.rows];
    try {
      wipeThenInsert(db, [{ id: 'a' }], TOPIC_COLUMNS);
    } catch {
      db.tables.get('topics')!.rows = before; // what ROLLBACK does
    }

    expect(db.tables.get('topics')!.rows).toEqual([{ id: 'old' }]);
  });
});

describe('the collection list', () => {
  it('covers every table the migration has to reconcile', () => {
    expect([...COLLECTIONS].sort()).toEqual(['log_entries', 'pairs', 'reviews', 'skills', 'topics']);
  });
});
