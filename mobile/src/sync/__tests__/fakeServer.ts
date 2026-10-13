import { Doc, emptyDoc } from '../../engine/types';
import { CollectionName, COLLECTIONS } from '../../store/persistence';
import { LocalReplica, metaStore, syncOnce, SyncReport } from '../engine';
import { FeedRow, LocalPatch, WireRow } from '../protocol';
import { PushResult, Remote } from '../remote';

type Stored = Omit<FeedRow, 'updated_at'> & { updated_at: string; user: string };

/**
 * The server, in memory, following the same rules as `sync_push` in
 * supabase/migrations/20261013000000_sync_rows.sql — which
 * supabase/verify/sync_push.sql checks against a real Postgres. If the two
 * ever disagree, these tests are proving the wrong thing.
 */
export class FakeServer {
  private seq = 0;
  readonly rows = new Map<string, Stored>();
  /** PostgREST's max_rows. Lower it to prove paging does not depend on it. */
  maxRows = 1000;
  /** Throws on this many upcoming pushes. */
  failPushes = 0;
  /** Runs inside the next pull or push, while the request is "in flight". */
  duringPull: (() => void) | null = null;
  duringPush: (() => void) | null = null;
  readonly calls = { pull: 0, push: 0 };

  private key = (user: string, c: string, id: string) => `${user}|${c}|${id}`;

  /** Every live row an account holds, as a document. */
  docFor(user: string): Doc {
    const doc = emptyDoc();
    for (const r of this.rows.values()) {
      if (r.user !== user || r.deleted || !r.data) continue;
      if (r.collection === 'settings') doc.settings = r.data as unknown as Doc['settings'];
      else (doc[r.collection] as unknown[]).push(r.data);
    }
    return doc;
  }

  get(user: string, c: string, id: string) {
    return this.rows.get(this.key(user, c, id));
  }

  remote(user: string): Remote {
    return {
      pull: async (since, limit) => {
        this.calls.pull++;
        const hook = this.duringPull;
        this.duringPull = null;
        hook?.();
        return [...this.rows.values()]
          .filter((r) => r.user === user && r.seq > since)
          .sort((a, b) => a.seq - b.seq)
          .slice(0, Math.min(limit, this.maxRows))
          .map(({ user: _, ...r }) => ({ ...r }));
      },

      push: async (changes, since) => {
        this.calls.push++;
        if (this.failPushes > 0) {
          this.failPushes--;
          throw new Error('network went away');
        }
        if (changes.length > 500) throw new Error('at most 500 changes per call');
        const hook = this.duringPush;
        this.duringPush = null;
        hook?.();

        const rejected: FeedRow[] = [];
        let first: number | null = null;
        let last: number | null = null;
        for (const c of changes) {
          const k = this.key(user, c.collection, c.id);
          const cur = this.rows.get(k);
          const at = Date.parse(c.updated_at);
          let wrote = false;
          if (!cur) {
            this.rows.set(k, { ...c, data: c.deleted ? null : c.data, user, seq: ++this.seq });
            wrote = true;
          } else if (cur.deleted) {
            if (!c.deleted) rejected.push(strip(cur));
          } else if (c.deleted) {
            const keep = Math.max(Date.parse(cur.updated_at), at);
            this.rows.set(k, { ...cur, deleted: true, data: null, updated_at: new Date(keep).toISOString(), seq: ++this.seq });
            wrote = true;
          } else if (at > Date.parse(cur.updated_at)) {
            this.rows.set(k, { ...cur, data: c.data, updated_at: c.updated_at, seq: ++this.seq });
            wrote = true;
          } else if (at < Date.parse(cur.updated_at) || JSON.stringify(cur.data) !== JSON.stringify(c.data)) {
            rejected.push(strip(cur));
          }
          if (wrote) {
            first ??= this.seq;
            last = this.seq;
          }
        }

        const behind = [...this.rows.values()].some(
          (r) => r.user === user && r.seq > since && (first === null || r.seq < first),
        );
        const res: PushResult = {
          rejected,
          behind,
          cursor: behind ? since : Math.max(since, last ?? since),
          now: new Date().toISOString(),
        };
        return res;
      },
    };
  }
}

const strip = ({ user: _, ...r }: Stored): FeedRow => ({ ...r });

/**
 * A phone: what is on screen (`doc`), what is saved (`disk`), and sync's
 * bookkeeping. Sync changes the screen through `apply` and the disk only
 * through the patch it returns — so if a patch ever leaves out a change,
 * `disk` stops matching `doc` and `expectSaved` says so.
 */
export class Device {
  doc: Doc;
  disk: Doc;
  readonly meta = new Map<string, string>();
  private clock: number;

  constructor(start = '2026-10-01T09:00:00.000Z', doc: Doc = emptyDoc()) {
    this.clock = Date.parse(start);
    this.doc = doc;
    this.disk = clone(doc);
  }

  /** A timestamp from this device's clock, a second after the last. */
  stamp(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  /** A local edit: lands on screen and on disk at once, as the store does. */
  edit(change: (doc: Doc) => Doc): void {
    this.doc = change(this.doc);
    this.disk = clone(this.doc);
  }

  private erasures = 0;

  /** Erase everything, as Settings does: data and sync's bookkeeping together. */
  erase(): void {
    this.erasures++;
    this.doc = emptyDoc();
    this.disk = emptyDoc();
    this.meta.clear();
  }

  readonly local: LocalReplica = {
    generation: () => this.erasures,
    read: () => this.doc,
    apply: async (change) => {
      const result = change(this.doc);
      if (!result) return;
      this.doc = result.doc;
      this.disk = applyPatch(this.disk, result.patch);
    },
  };

  sync(server: FakeServer, user = 'user-a'): Promise<SyncReport> {
    return syncOnce({
      local: this.local,
      remote: server.remote(user),
      meta: metaStore(
        {
          readMeta: async (k) => this.meta.get(k) ?? null,
          writeMeta: async (k, v) => void this.meta.set(k, v),
        },
        user,
      ),
      now: () => this.stamp(),
      observe: () => undefined,
    });
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function applyPatch(disk: Doc, patch: LocalPatch): Doc {
  const next = clone(disk);
  for (const c of COLLECTIONS) {
    const rows = new Map((next[c] as { id: string }[]).map((r) => [r.id, r]));
    for (const id of patch.removes[c] ?? []) rows.delete(id);
    for (const r of (patch.upserts[c] ?? []) as { id: string }[]) rows.set(r.id, clone(r));
    (next as Record<string, unknown>)[c] = [...rows.values()];
  }
  if (patch.settings) next.settings = clone(patch.settings);
  return next;
}

/** Ids per collection, sorted — for comparing two documents' contents. */
export function ids(doc: Doc): Record<CollectionName, string[]> {
  const out = {} as Record<CollectionName, string[]>;
  for (const c of COLLECTIONS) out[c] = (doc[c] as { id: string }[]).map((r) => r.id).sort();
  return out;
}

export type { WireRow };
