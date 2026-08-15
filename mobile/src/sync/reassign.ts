import { Doc } from '../engine/types';
import { uid } from '../store/uid';

/**
 * Gives every local row a fresh id, keeping the references between them.
 *
 * Row ids are global but ownership is per-user, so a phone that has already
 * uploaded to one account cannot upload the same ids to a second one — the
 * server refuses the write because those rows belong to somebody else, and
 * sync fails for good. When the account changes, the work on this phone
 * becomes the new account's own copy rather than a doomed update of the old
 * account's rows.
 */
export function reassignIds(doc: Doc, mint: () => string = uid): Doc {
  const fresh = new Map<string, string>();
  const remap = (id: string): string => {
    const found = fresh.get(id);
    if (found) return found;
    const next = mint();
    fresh.set(id, next);
    return next;
  };

  // Skills and topics first, so the references below resolve to the same ids.
  const skills = doc.skills.map((s) => ({ ...s, id: remap(s.id) }));
  const topics = doc.topics.map((t) => ({ ...t, id: remap(t.id), skill_id: remap(t.skill_id) }));

  return {
    skills,
    topics,
    reviews: doc.reviews.map((r) => ({ ...r, id: remap(r.id), topic_id: remap(r.topic_id) })),
    log_entries: doc.log_entries.map((e) => ({
      ...e,
      id: remap(e.id),
      skill_id: remap(e.skill_id),
      topic_id: e.topic_id ? remap(e.topic_id) : null,
    })),
    pairs: doc.pairs.map((p) => ({
      ...p,
      id: remap(p.id),
      topic_a: remap(p.topic_a),
      topic_b: remap(p.topic_b),
    })),
    settings: doc.settings,
  };
}
