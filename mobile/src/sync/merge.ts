import { Doc, Settings } from '../engine/types';
import { CollectionName, COLLECTIONS } from '../store/persistence';

export type MergeResult = {
  merged: Doc;
  /** Rows the server has not got, or has an older copy of. */
  push: Record<CollectionName, { id: string; updated_at: string }[]>;
  pushSettings: boolean;
};

type Stamped = { id: string; updated_at: string };

/**
 * Is `a` a later moment than `b`?
 *
 * The two sides do not agree on how to spell a timestamp: Postgres returns
 * `2026-08-13T00:18:28.27632+00:00` and the device writes
 * `2026-08-13T00:18:28.276Z` for the very same instant. ISO-8601 happens to
 * sort lexicographically while both are UTC, so comparing the strings mostly
 * works — but it stops being true the moment an offset other than +00:00 shows
 * up, and "mostly" is the wrong standard for the rule that decides which copy
 * of your work survives. Compare the instants instead, and fall back to the
 * strings only if something unparseable arrives.
 */
export function isNewer(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a > b;
  return ta > tb;
}

/**
 * The rule shown in the UI: ratings merge by timestamp, latest wins. Applied
 * per row rather than per document, so two devices that were both offline keep
 * everything either of them did.
 */
export function mergeDocs(local: Doc, remote: Doc): MergeResult {
  const merged = { ...local } as Doc;
  const push = {} as MergeResult['push'];

  for (const table of COLLECTIONS) {
    const localRows = local[table] as unknown as Stamped[];
    const remoteRows = remote[table] as unknown as Stamped[];
    const byId = new Map<string, Stamped>();
    const toPush: Stamped[] = [];

    for (const row of remoteRows) byId.set(row.id, row);
    for (const row of localRows) {
      const theirs = byId.get(row.id);
      if (!theirs) {
        byId.set(row.id, row);
        toPush.push(row);
      } else if (isNewer(row.updated_at, theirs.updated_at)) {
        byId.set(row.id, row);
        toPush.push(row);
      }
    }

    (merged as Record<string, unknown>)[table] = [...byId.values()];
    push[table] = toPush.map((r) => ({ id: r.id, updated_at: r.updated_at }));
  }

  const localNewer = !isNewer(remote.settings.updated_at, local.settings.updated_at);
  const settings: Settings = localNewer ? local.settings : { ...local.settings, ...remote.settings };
  merged.settings = settings;

  return { merged, push, pushSettings: localNewer };
}

/** The rows to send, resolved back to the merged copies. */
export function rowsToPush(merged: Doc, push: MergeResult['push'], table: CollectionName): unknown[] {
  const wanted = new Set(push[table].map((r) => r.id));
  return (merged[table] as unknown as { id: string }[]).filter((r) => wanted.has(r.id));
}
