import { Doc } from '../engine/types';

/**
 * What the screens are told about sync. The machinery lives elsewhere:
 * `protocol.ts` holds the rules, `engine.ts` runs them, `remote.ts` talks to
 * the server, and `auth.tsx` decides when.
 */

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

/** Counts for the Settings sync line: "4 skills, 31 topics, 268 ratings". */
export function syncSummary(doc: Doc): string {
  const skills = doc.skills.filter((s) => !s.archived_at).length;
  const topics = doc.topics.filter((t) => !t.archived_at).length;
  const reviews = doc.reviews.length;
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${part(skills, 'skill', 'skills')}, ${part(topics, 'topic', 'topics')}, ${part(reviews, 'rating', 'ratings')}. Merges by timestamp when two devices disagree.`;
}
