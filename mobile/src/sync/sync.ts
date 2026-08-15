import { DEFAULT_SETTINGS, Doc, emptyDoc, Settings } from '../engine/types';
import { CollectionName, COLLECTIONS } from '../store/persistence';
import { mergeDocs, rowsToPush } from './merge';
import { supabase } from './supabase';

export type SyncState = {
  status: 'off' | 'idle' | 'syncing' | 'error';
  at: string | null;
  error: string | null;
};

/**
 * Supabase rejects with a plain `{ message, details, hint, code }` object, not
 * an Error — so anything that assumes `.message` on an Error shows
 * "[object Object]" and the user is told nothing they can act on.
 */
export function syncError(cause: unknown, doing: string): Error {
  const o = (cause ?? {}) as { message?: string; details?: string; hint?: string; code?: string };
  const detail = o.message || o.details || o.hint || (cause instanceof Error ? cause.message : '') || String(cause);
  const code = o.code ? ` (${o.code})` : '';
  return new Error(`Could not ${doing}: ${detail}${code}`);
}

/**
 * The server refusing a write because the rows belong to another account —
 * which is the one failure the client can repair by itself, by making the
 * local work into this account's own copy.
 */
export function isOwnershipError(cause: unknown): boolean {
  const o = (cause ?? {}) as { message?: string; code?: string };
  const text = `${o.code ?? ''} ${o.message ?? ''} ${cause instanceof Error ? cause.message : ''}`;
  return text.includes('42501') || text.toLowerCase().includes('row-level security');
}

const strip = <T extends object>(row: T): T => {
  const { user_id, ...rest } = row as T & { user_id?: string };
  return rest as T;
};

async function pull(userId: string): Promise<Doc> {
  const doc = emptyDoc();
  for (const table of COLLECTIONS) {
    const { data, error } = await supabase!.from(table).select('*').eq('user_id', userId);
    if (error) throw syncError(error, `read ${table.replace('_', ' ')}`);
    (doc as Record<string, unknown>)[table] = (data ?? []).map(strip);
  }
  const { data: settings, error } = await supabase!
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw syncError(error, 'read your settings');
  doc.settings = settings
    ? ({ ...DEFAULT_SETTINGS, ...strip(settings as Settings) } as Settings)
    : { ...DEFAULT_SETTINGS, updated_at: '1970-01-01T00:00:00.000Z' };
  return doc;
}

/**
 * Pull, merge, push. The local store stays the source of truth throughout —
 * if the network half fails, the phone is still correct and the next sync
 * picks up where this one stopped.
 */
export async function syncNow(local: Doc, userId: string): Promise<Doc> {
  if (!supabase) throw new Error('No Supabase project configured');

  const remote = await pull(userId);
  const { merged, push, pushSettings } = mergeDocs(local, remote);

  for (const table of COLLECTIONS as CollectionName[]) {
    const rows = rowsToPush(merged, push, table).map((r) => ({ ...(r as object), user_id: userId }));
    if (!rows.length) continue;
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw syncError(error, `upload ${table.replace('_', ' ')}`);
  }

  if (pushSettings) {
    const { error } = await supabase
      .from('settings')
      .upsert({ ...merged.settings, user_id: userId }, { onConflict: 'user_id' });
    if (error) throw syncError(error, 'upload your settings');
  }

  return merged;
}

/** Counts for the Settings sync line: "4 skills, 31 topics, 268 ratings". */
export function syncSummary(doc: Doc): string {
  const skills = doc.skills.filter((s) => !s.archived_at).length;
  const topics = doc.topics.filter((t) => !t.archived_at).length;
  const reviews = doc.reviews.length;
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${part(skills, 'skill', 'skills')}, ${part(topics, 'topic', 'topics')}, ${part(reviews, 'rating', 'ratings')}. Merges by timestamp when two devices disagree.`;
}
