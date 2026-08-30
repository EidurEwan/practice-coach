import { Doc } from '../../engine/types';
import { doc, skill, topic } from '../../engine/__tests__/factory';

/**
 * The cascade a skill deletion performs, as a pure function of the document.
 *
 * Kept in step with `deleteSkill` in the store: leaving any of these behind
 * strands them, because nothing lists a topic whose skill is gone — it would
 * be invisible and undeletable, and its ratings would keep counting toward a
 * history nobody can see.
 */
function withoutSkill(d: Doc, id: string): Doc {
  const topicIds = new Set(d.topics.filter((x) => x.skill_id === id).map((x) => x.id));
  return {
    ...d,
    skills: d.skills.filter((s) => s.id !== id),
    topics: d.topics.filter((x) => x.skill_id !== id),
    reviews: d.reviews.filter((r) => !topicIds.has(r.topic_id)),
    log_entries: d.log_entries.filter((e) => e.skill_id !== id),
    pairs: d.pairs.filter((p) => !topicIds.has(p.topic_a) && !topicIds.has(p.topic_b)),
  };
}

const review = (topicId: string, id: string) => ({
  id, topic_id: topicId, rating: 'ok' as const, felt_shaky: false,
  rated_at: '2026-08-27T09:00:00.000Z', prev_interval: 2, next_interval: 5,
  updated_at: '2026-08-27T09:00:00.000Z',
});

const logEntry = (skillId: string, topicId: string, id: string) => ({
  id, skill_id: skillId, topic_id: topicId, sub_skill: null,
  studied_on: '2026-08-27', flags: [],
  created_at: '2026-08-27T09:00:00.000Z', updated_at: '2026-08-27T09:00:00.000Z',
});

describe('deleting a skill', () => {
  const build = () => {
    const doomed = skill({ name: 'Chemistry' });
    const kept = skill({ name: 'Maths' });
    const a = topic({ skill_id: doomed.id, title: 'Le Chatelier' });
    const b = topic({ skill_id: doomed.id, title: 'Titration' });
    const safe = topic({ skill_id: kept.id, title: 'Integration by parts' });

    return {
      doomed, kept, a, b, safe,
      d: doc({
        skills: [doomed, kept],
        topics: [a, b, safe],
        reviews: [review(a.id, 'r1'), review(b.id, 'r2'), review(safe.id, 'r3')],
        log_entries: [logEntry(doomed.id, a.id, 'l1'), logEntry(kept.id, safe.id, 'l2')],
        pairs: [
          { id: 'p1', topic_a: a.id, topic_b: b.id, created_at: '2026-08-27T09:00:00.000Z', updated_at: '2026-08-27T09:00:00.000Z' },
          { id: 'p2', topic_a: safe.id, topic_b: safe.id, created_at: '2026-08-27T09:00:00.000Z', updated_at: '2026-08-27T09:00:00.000Z' },
        ],
      }),
    };
  };

  it('takes its topics with it', () => {
    const { d, doomed } = build();
    const after = withoutSkill(d, doomed.id);
    expect(after.skills.map((s) => s.name)).toEqual(['Maths']);
    expect(after.topics.map((x) => x.title)).toEqual(['Integration by parts']);
  });

  it('takes the ratings of those topics, and no others', () => {
    const { d, doomed } = build();
    const after = withoutSkill(d, doomed.id);
    expect(after.reviews.map((r) => r.id)).toEqual(['r3']);
  });

  it('takes its logged sessions, and no others', () => {
    const { d, doomed } = build();
    expect(withoutSkill(d, doomed.id).log_entries.map((e) => e.id)).toEqual(['l2']);
  });

  it('takes any pairing that touched one of its topics', () => {
    const { d, doomed } = build();
    expect(withoutSkill(d, doomed.id).pairs.map((p) => p.id)).toEqual(['p2']);
  });

  it('leaves nothing pointing at something that is gone', () => {
    const { d, doomed } = build();
    const after = withoutSkill(d, doomed.id);

    const skillIds = new Set(after.skills.map((s) => s.id));
    const topicIds = new Set(after.topics.map((x) => x.id));

    for (const x of after.topics) expect(skillIds.has(x.skill_id)).toBe(true);
    for (const r of after.reviews) expect(topicIds.has(r.topic_id)).toBe(true);
    for (const e of after.log_entries) expect(skillIds.has(e.skill_id)).toBe(true);
    for (const p of after.pairs) {
      expect(topicIds.has(p.topic_a)).toBe(true);
      expect(topicIds.has(p.topic_b)).toBe(true);
    }
  });

  it('changes nothing when the skill is not there', () => {
    const { d } = build();
    expect(withoutSkill(d, 'no-such-skill')).toEqual(d);
  });
});
