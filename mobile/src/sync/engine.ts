import { Doc } from '../engine/types';
import { nowIso, observeTime } from '../store/uid';
import {
  acknowledge,
  applyIncoming,
  freshMeta,
  LocalPatch,
  outgoing,
  parseMeta,
  SyncMeta,
  sweepOrphans,
  WireRow,
} from './protocol';
import { Remote } from './remote';

/** Feed rows per request. Under PostgREST's max_rows, but nothing depends on that. */
export const PAGE_SIZE = 500;
/** Changes per push. The server refuses more than 500. */
export const BATCH_SIZE = 200;

/** The device's side: what is on screen now, and a way to change it. */
export interface LocalReplica {
  read(): Doc;
  /**
   * Runs `change` against the document as it is at that moment and saves the
   * result. Resolves once it is written down; rejects if the write failed.
   */
  apply(change: (live: Doc) => { doc: Doc; patch: LocalPatch } | null): Promise<void>;
  /**
   * Changes whenever the device's data is wiped. A sync that started before
   * then holds a base describing rows that are no longer here; carrying on
   * would upload all of them as deletions.
   */
  generation?(): number;
}

/** The device was erased mid-sync. Not a failure: the next sync starts afresh. */
export class SyncInterrupted extends Error {
  constructor() {
    super('This device was erased while it was syncing.');
    this.name = 'SyncInterrupted';
  }
}

export interface MetaStore {
  load(): Promise<SyncMeta | null>;
  save(meta: SyncMeta): Promise<void>;
}

export type SyncDeps = {
  local: LocalReplica;
  meta: MetaStore;
  remote: Remote;
  /** Stamps tombstones. The device clock by default. */
  now?: () => string;
  /** Hears every timestamp that arrives, so local stamps stay ahead of them. */
  observe?: (at: string) => void;
};

export type SyncReport = { pulled: number; pushed: number; rejected: number };

/**
 * One sync: read the feed, push what changed here, and read again only if
 * another device wrote in the meantime.
 *
 * Nothing here ever replaces the document wholesale. Every merge runs against
 * the document as it is when the merge lands, not a copy taken before the
 * network call — so a rating made while a sync is in flight is not swept
 * away by it, which is what the first version of sync did.
 *
 * The base and cursor are saved only after the rows they describe have been
 * written on the device. If anything fails part-way, the saved meta is older
 * than the data, and the next sync repeats some work; it is never the other
 * way round, which could make rows look deleted.
 */
export async function syncOnce(deps: SyncDeps): Promise<SyncReport> {
  const now = deps.now ?? nowIso;
  const observe = deps.observe ?? observeTime;
  const report: SyncReport = { pulled: 0, pushed: 0, rejected: 0 };
  const generation = deps.local.generation?.();
  const unchanged = () => {
    if (deps.local.generation && deps.local.generation() !== generation) throw new SyncInterrupted();
  };
  const save = async () => {
    unchanged();
    await deps.meta.save(meta);
  };

  let meta = (await deps.meta.load()) ?? freshMeta();

  const merge = (rows: WireRow[]) =>
    deps.local.apply((live) => {
      unchanged();
      const applied = applyIncoming(live, meta.base, rows);
      meta = { ...meta, base: applied.base };
      return applied.changed ? { doc: applied.doc, patch: applied.patch } : null;
    });

  /**
   * Until a page comes back empty, rather than until one comes back short: a
   * server configured with a lower row cap than PAGE_SIZE returns short pages
   * that are not the end, and stopping there would sweep away children whose
   * parents are still to come.
   */
  const pullAll = async () => {
    let any = false;
    for (;;) {
      const page = await deps.remote.pull(meta.cursor, PAGE_SIZE);
      if (!page.length) break;
      await merge(page);
      for (const row of page) observe(row.updated_at);
      meta = { ...meta, cursor: Math.max(meta.cursor, ...page.map((r) => r.seq)) };
      report.pulled += page.length;
      any = true;
    }
    if (any) {
      await deps.local.apply((live) => {
        unchanged();
        return sweepOrphans(live);
      });
    }
    return any;
  };

  const pushAll = async (pending: WireRow[]) => {
    let behind = false;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      unchanged();
      const batch = pending.slice(i, i + BATCH_SIZE);
      const res = await deps.remote.push(batch, meta.cursor);
      meta = { ...meta, base: acknowledge(meta.base, batch) };
      report.pushed += batch.length;
      if (res.now) observe(res.now);
      if (res.rejected.length) {
        report.rejected += res.rejected.length;
        for (const row of res.rejected) observe(row.updated_at);
        await merge(res.rejected);
      }
      if (res.behind) behind = true;
      else meta = { ...meta, cursor: Math.max(meta.cursor, res.cursor) };
    }
    return behind;
  };

  if (await pullAll()) await save();

  // A push that finds another device has written since our read pulls again,
  // and that pull can sweep up orphans whose tombstones then need pushing. It
  // settles in two rounds; the third is a margin, not a loop.
  for (let round = 0; round < 3; round++) {
    unchanged();
    const pending = outgoing(deps.local.read(), meta.base, now());
    if (!pending.length) break;
    const behind = await pushAll(pending);
    if (!behind) break;
    await pullAll();
  }

  await save();
  return report;
}

/** Sync's bookkeeping for one account, kept beside the data it describes. */
export function metaStore(
  io: { readMeta(key: string): Promise<string | null>; writeMeta(key: string, value: string): Promise<void> },
  userId: string,
): MetaStore {
  const key = `sync:${userId}`;
  return {
    load: async () => parseMeta(await io.readMeta(key)),
    save: (meta) => io.writeMeta(key, JSON.stringify(meta)),
  };
}

export type RunnerEvents = {
  onStart(): void;
  onSuccess(report: SyncReport): void;
  onError(error: unknown, retryInMs: number): void;
};

/** How long to wait after the 1st, 2nd, 3rd… consecutive failure. */
export const BACKOFF_MS = [5_000, 15_000, 60_000, 5 * 60_000];

/**
 * Decides when syncs happen: one at a time, requests folded together, and
 * failures retried on their own with growing gaps.
 *
 * The first version dropped any request that arrived while a sync was
 * running, so a rating made mid-sync waited until the app next came to the
 * front. Here it runs straight after.
 */
export class SyncRunner {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private due = Infinity;
  private running = false;
  private again = false;
  private failures = 0;
  private stopped = false;

  constructor(
    private readonly cycle: () => Promise<SyncReport>,
    private readonly events: RunnerEvents,
    private readonly backoff: number[] = BACKOFF_MS,
  ) {}

  /**
   * Asks for a sync within `delayMs`. A request never pushes back one already
   * due sooner, so a steady stream of edits still syncs every `delayMs`
   * instead of never.
   */
  request(delayMs = 0): void {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    const at = Date.now() + delayMs;
    if (this.timer && at >= this.due) return;
    this.clear();
    this.due = at;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.due = Infinity;
      void this.run();
    }, delayMs);
  }

  stop(): void {
    this.stopped = true;
    this.clear();
  }

  private clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.due = Infinity;
  }

  private async run() {
    if (this.stopped || this.running) return;
    this.running = true;
    this.again = false;
    this.events.onStart();

    let retryIn = 0;
    try {
      const report = await this.cycle();
      this.failures = 0;
      if (!this.stopped) this.events.onSuccess(report);
    } catch (e) {
      if (e instanceof SyncInterrupted) {
        this.running = false;
        this.request(0);
        return;
      }
      this.failures++;
      retryIn = this.backoff[Math.min(this.failures, this.backoff.length) - 1];
      if (!this.stopped) this.events.onError(e, retryIn);
    } finally {
      this.running = false;
    }

    // After a failure the retry is already the next attempt; an edit made
    // during it should not turn the backoff into a tight loop.
    if (retryIn) this.request(retryIn);
    else if (this.again) this.request(0);
  }
}
