import type { SupabaseClient } from '@supabase/supabase-js';
import { FeedRow, WireRow } from './protocol';
import { syncError } from './sync';

export type PushResult = {
  /** The server's copy of every change it refused. */
  rejected: FeedRow[];
  /** Another device wrote after `since`; the feed still has to be read. */
  behind: boolean;
  /** When not behind: how far the feed can be skipped, past this push's own writes. */
  cursor: number;
  /** The server's clock. */
  now: string | null;
};

/** The two calls sync makes. Kept apart from Supabase so the engine can be tested against a fake. */
export interface Remote {
  /** Up to `limit` feed rows after `since`, in feed order. */
  pull(since: number, limit: number): Promise<FeedRow[]>;
  push(changes: WireRow[], since: number): Promise<PushResult>;
}

/**
 * Bigint columns can arrive as strings depending on how PostgREST is
 * configured; the feed position is compared numerically, so make sure it is
 * a number.
 */
const feedRow = (r: FeedRow): FeedRow => ({ ...r, seq: Number(r.seq) });

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async pull(since, limit) {
      const { data, error } = await client
        .from('sync_rows')
        .select('collection, id, updated_at, deleted, data, seq')
        .eq('user_id', userId)
        .gt('seq', since)
        .order('seq', { ascending: true })
        .limit(limit);
      if (error) throw syncError(error, 'download changes');
      return ((data ?? []) as FeedRow[]).map(feedRow);
    },

    async push(changes, since) {
      const { data, error } = await client.rpc('sync_push', { changes, since });
      if (error) throw syncError(error, 'upload changes');
      const res = (data ?? {}) as Partial<PushResult>;
      return {
        rejected: (res.rejected ?? []).map(feedRow),
        behind: res.behind !== false,
        cursor: Number(res.cursor ?? since),
        now: res.now ?? null,
      };
    },
  };
}
