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
      } else if (row.updated_at > theirs.updated_at) {
        byId.set(row.id, row);
        toPush.push(row);
      }
    }

    (merged as Record<string, unknown>)[table] = [...byId.values()];
    push[table] = toPush.map((r) => ({ id: r.id, updated_at: r.updated_at }));
  }

  const localNewer = local.settings.updated_at >= remote.settings.updated_at;
  const settings: Settings = localNewer ? local.settings : { ...local.settings, ...remote.settings };
  merged.settings = settings;

  return { merged, push, pushSettings: localNewer };
}

/** The rows to send, resolved back to the merged copies. */
export function rowsToPush(merged: Doc, push: MergeResult['push'], table: CollectionName): unknown[] {
  const wanted = new Set(push[table].map((r) => r.id));
  return (merged[table] as unknown as { id: string }[]).filter((r) => wanted.has(r.id));
}
