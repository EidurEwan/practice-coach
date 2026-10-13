import { DEFAULT_SETTINGS, Doc, Settings } from '../engine/types';
import { withDefaults } from '../store/format';
import { CollectionName, COLLECTIONS, Collections } from '../store/persistence';

/**
 * The sync rules, with no network and no storage in them.
 *
 * Three copies of every row matter during a sync: the one on this device, the
 * one on the server, and the **base** — the server's version as of this
 * device's last successful sync. Comparing the device against the base is
 * what tells an edit made here from one that arrived from elsewhere, and a
 * row that is in the base but no longer on the device was deleted here.
 * Without the base a deletion is indistinguishable from a row this device
 * simply has not downloaded yet, which is how the first version of sync kept
 * putting deleted work back.
 *
 * The base stores only each row's timestamp, as milliseconds. Everything in
 * this file is pure, so every rule can be tested without a server.
 */

/** Everything the server stores is in one of these. */
export type Collection = CollectionName | 'settings';
export const SYNCED: Collection[] = [...COLLECTIONS, 'settings'];

/** Settings are one record per account; this is its id. */
export const SETTINGS_ID = 'settings';

/** One row as it travels to and from the server. */
export type WireRow = {
  collection: Collection;
  id: string;
  updated_at: string;
  deleted: boolean;
  /** The record exactly as the device stores it. Null on a tombstone. */
  data: Record<string, unknown> | null;
};

/** A row read from the server's feed, with its position in it. */
export type FeedRow = WireRow & { seq: number };

/** The server's timestamp for each row, as of the last sync: id → ms. */
export type Base = Record<Collection, Record<string, number>>;

export type SyncMeta = {
  version: 1;
  /** Everything in the feed up to here has been applied on this device. */
  cursor: number;
  base: Base;
};

/** What a merge changed on the device, for the store to write down. */
export type LocalPatch = {
  upserts: Partial<Collections>;
  removes: Partial<Record<CollectionName, string[]>>;
  settings: Settings | null;
};

export const emptyBase = (): Base => ({
  skills: {},
  topics: {},
  reviews: {},
  log_entries: {},
  pairs: {},
  settings: {},
});

export const freshMeta = (): SyncMeta => ({ version: 1, cursor: 0, base: emptyBase() });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Reads saved meta back, or null if it is missing or not something this
 * build wrote. Null is always safe: an empty base means nothing looks deleted,
 * so the worst a lost base costs is downloading everything again.
 */
export function parseMeta(raw: string | null): SyncMeta | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObject(v) || v.version !== 1 || typeof v.cursor !== 'number' || !isObject(v.base)) return null;
    const base = emptyBase();
    for (const c of SYNCED) {
      const known = v.base[c];
      if (isObject(known)) base[c] = known as Record<string, number>;
    }
    return { version: 1, cursor: v.cursor, base };
  } catch {
    return null;
  }
}

/**
 * A row's timestamp in ms. Something unparseable counts as the epoch, so it
 * still compares consistently instead of looking changed on every sync.
 */
export function stampOf(at: unknown): number {
  const t = typeof at === 'string' ? Date.parse(at) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

const iso = (ms: number) => new Date(ms).toISOString();

type Stamped = { id: string; updated_at: string };

/**
 * Everything this device has that the server does not: rows edited or created
 * since the base, then tombstones for rows in the base that are gone from the
 * device. Parents come before children, which is the only order a server with
 * foreign keys would accept and costs nothing here.
 *
 * `now` stamps the tombstones. The server never lets a tombstone move a row's
 * timestamp backwards, so a slow clock here cannot hurt.
 */
export function outgoing(doc: Doc, base: Base, now: string): WireRow[] {
  const changed: WireRow[] = [];
  const deleted: WireRow[] = [];

  for (const c of COLLECTIONS) {
    const known = base[c];
    const here = new Set<string>();
    for (const row of doc[c] as unknown as Stamped[]) {
      here.add(row.id);
      const at = stampOf(row.updated_at);
      if (known[row.id] !== at) {
        changed.push({ collection: c, id: row.id, updated_at: iso(at), deleted: false, data: { ...row } });
      }
    }
    for (const id of Object.keys(known)) {
      if (!here.has(id)) deleted.push({ collection: c, id, updated_at: now, deleted: true, data: null });
    }
  }

  const at = stampOf(doc.settings.updated_at);
  if (base.settings[SETTINGS_ID] !== at) {
    changed.push({
      collection: 'settings',
      id: SETTINGS_ID,
      updated_at: iso(at),
      deleted: false,
      data: { ...doc.settings },
    });
  }

  return [...changed, ...deleted];
}

/** Records that the server has taken these changes. */
export function acknowledge(base: Base, sent: WireRow[]): Base {
  const next = cloneTouched(base, sent);
  for (const row of sent) {
    if (row.deleted) delete next[row.collection][row.id];
    else next[row.collection][row.id] = stampOf(row.updated_at);
  }
  return next;
}

function cloneTouched(base: Base, rows: { collection: Collection }[]): Base {
  const next = { ...base };
  const done = new Set<Collection>();
  for (const { collection } of rows) {
    if (done.has(collection) || !(collection in next)) continue;
    done.add(collection);
    next[collection] = { ...next[collection] };
  }
  return next;
}

/**
 * Equal in content, whatever the key order. Postgres stores documents as
 * jsonb, which reorders keys, so a row comes back from the server spelled
 * differently from how it was sent even when nothing about it changed.
 */
export function sameRow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameRow(v, b[i]));
  }
  if (!isObject(a) || !isObject(b)) return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameRow(a[k], b[k]));
}

export type Applied = { doc: Doc; base: Base; patch: LocalPatch; changed: number };

/**
 * Merges rows from the server into the device's document.
 *
 * Per row:
 *  - a tombstone deletes the row here, whatever happened to it locally. A
 *    deletion is final, on the server and here alike.
 *  - a row deleted here but not yet uploaded stays deleted; its tombstone
 *    goes up on the next push.
 *  - otherwise the later timestamp wins, and a tie goes to the server — the
 *    same rule the server applies, so both sides settle on one copy.
 *
 * Settings follow the same rule with one exception: the first time this
 * device syncs with an account, the account's settings win outright. A phone
 * signing in has only onboarding's defaults, stamped a minute ago; they would
 * otherwise beat a capacity and exam date set months ago on another device.
 *
 * Rows from a collection this build does not know are left alone, and not
 * recorded in the base, so a newer build's data is never deleted by an older
 * one.
 */
export function applyIncoming(live: Doc, base: Base, rows: WireRow[]): Applied {
  const nextBase = cloneTouched(base, rows);
  const tables = new Map<CollectionName, Map<string, Stamped>>();
  const table = (c: CollectionName) => {
    let t = tables.get(c);
    if (!t) {
      t = new Map((live[c] as unknown as Stamped[]).map((r) => [r.id, r]));
      tables.set(c, t);
    }
    return t;
  };

  const upserts = new Map<CollectionName, Map<string, Stamped>>();
  const removes = new Map<CollectionName, Set<string>>();
  let settings: Settings | null = null;
  let changed = 0;

  for (const row of rows) {
    const remoteAt = stampOf(row.updated_at);

    if (row.collection === 'settings') {
      if (row.deleted || !isObject(row.data)) continue;
      const known = nextBase.settings[SETTINGS_ID];
      const current = settings ?? live.settings;
      nextBase.settings[SETTINGS_ID] = remoteAt;
      if (known !== undefined && stampOf(current.updated_at) > remoteAt) continue;
      const theirs = { ...DEFAULT_SETTINGS, ...(row.data as Partial<Settings>) } as Settings;
      if (!sameRow(theirs, current)) {
        settings = theirs;
        changed++;
      }
      continue;
    }

    if (!(COLLECTIONS as string[]).includes(row.collection)) continue;
    const c = row.collection as CollectionName;
    const rows_ = table(c);
    const mine = rows_.get(row.id);

    if (row.deleted) {
      delete nextBase[c][row.id];
      if (mine) {
        rows_.delete(row.id);
        upserts.get(c)?.delete(row.id);
        if (!removes.has(c)) removes.set(c, new Set());
        removes.get(c)!.add(row.id);
        changed++;
      }
      continue;
    }

    if (!isObject(row.data) || row.data.id !== row.id) continue;

    if (!mine && row.id in nextBase[c]) {
      // Deleted here, not yet uploaded. The deletion wins.
      nextBase[c][row.id] = remoteAt;
      continue;
    }

    nextBase[c][row.id] = remoteAt;
    if (mine && stampOf(mine.updated_at) > remoteAt) continue;

    const theirs = withDefaults(c, row.data) as unknown as Stamped;
    if (mine && sameRow(mine, theirs)) continue;
    rows_.set(row.id, theirs);
    removes.get(c)?.delete(row.id);
    if (!upserts.has(c)) upserts.set(c, new Map());
    upserts.get(c)!.set(row.id, theirs);
    changed++;
  }

  const doc: Doc = { ...live };
  for (const [c, rows_] of tables) (doc as Record<string, unknown>)[c] = [...rows_.values()];
  if (settings) doc.settings = settings;

  const patch: LocalPatch = { upserts: {}, removes: {}, settings };
  for (const [c, m] of upserts) if (m.size) (patch.upserts as Record<string, unknown>)[c] = [...m.values()];
  for (const [c, s] of removes) if (s.size) patch.removes[c] = [...s];

  return { doc, base: nextBase, patch, changed };
}

/**
 * Removes rows whose parent is gone: topics without their skill, ratings and
 * pairs without their topics, log entries without their skill.
 *
 * Deleting a skill on one phone deletes everything under it there, and those
 * deletions travel as tombstones. What they cannot reach is a topic another
 * phone added to that skill while offline — it arrives after the skill has
 * gone, and nothing anywhere would list it. Sweeping after every download
 * removes it here, and because it is in the base, its tombstone goes up on the
 * next push and the other phone drops it too. It is the server's old
 * `on delete cascade`, carried out where the data actually lives.
 *
 * Run it only once the whole feed has been read: a page can hold a topic
 * whose skill is on the next one.
 */
export function sweepOrphans(live: Doc): { doc: Doc; patch: LocalPatch } | null {
  const skills = new Set(live.skills.map((s) => s.id));
  const topics = live.topics.filter((t) => skills.has(t.skill_id));
  const topicIds = new Set(topics.map((t) => t.id));
  const reviews = live.reviews.filter((r) => topicIds.has(r.topic_id));
  const pairs = live.pairs.filter((p) => topicIds.has(p.topic_a) && topicIds.has(p.topic_b));
  const log_entries = live.log_entries.filter((e) => skills.has(e.skill_id));

  const removes: LocalPatch['removes'] = {};
  const gone = <T extends { id: string }>(name: CollectionName, before: T[], after: T[]) => {
    if (before.length === after.length) return;
    const kept = new Set(after.map((r) => r.id));
    removes[name] = before.filter((r) => !kept.has(r.id)).map((r) => r.id);
  };
  gone('topics', live.topics, topics);
  gone('reviews', live.reviews, reviews);
  gone('pairs', live.pairs, pairs);
  gone('log_entries', live.log_entries, log_entries);

  if (!Object.keys(removes).length) return null;
  return {
    doc: { ...live, topics, reviews, pairs, log_entries },
    patch: { upserts: {}, removes, settings: null },
  };
}
