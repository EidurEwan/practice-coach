import { Doc, emptyDoc } from '../../engine/types';
import { skill, topic } from '../../engine/__tests__/factory';
import { reassignIds } from '../reassign';

function world(): Doc {
  const s = skill({ id: 'skill-a' });
  const t1 = topic({ id: 'topic-1', skill_id: s.id });
  const t2 = topic({ id: 'topic-2', skill_id: s.id });
  return {
    ...emptyDoc(),
    skills: [s],
    topics: [t1, t2],
    reviews: [
      {
        id: 'review-1',
        topic_id: t1.id,
        rating: 'ok' as const,
        felt_shaky: false,
        rated_at: '2026-08-12T00:00:00.000Z',
        prev_interval: 5,
        next_interval: 10,
        updated_at: '2026-08-12T00:00:00.000Z',
      },
    ],
    log_entries: [
      {
        id: 'log-1',
        skill_id: s.id,
        topic_id: t1.id,
        sub_skill: null,
        studied_on: '2026-08-12',
        flags: [],
        created_at: '2026-08-12T00:00:00.000Z',
        updated_at: '2026-08-12T00:00:00.000Z',
      },
    ],
    pairs: [{ id: 'pair-1', topic_a: t1.id, topic_b: t2.id, created_at: '', updated_at: '' }],
  };
}

describe('signing into a different account on the same phone', () => {
  test('every id is replaced', () => {
    const before = world();
    const after = reassignIds(before);

    const ids = (d: Doc) => [
      ...d.skills.map((x) => x.id),
      ...d.topics.map((x) => x.id),
      ...d.reviews.map((x) => x.id),
      ...d.log_entries.map((x) => x.id),
      ...d.pairs.map((x) => x.id),
    ];
    expect(ids(after).some((id) => ids(before).includes(id))).toBe(false);
    expect(new Set(ids(after)).size).toBe(ids(before).length);
  });

  test('the references between rows still point at the same things', () => {
    const after = reassignIds(world());
    const skillId = after.skills[0].id;

    expect(after.topics.every((t) => t.skill_id === skillId)).toBe(true);
    expect(after.reviews[0].topic_id).toBe(after.topics[0].id);
    expect(after.log_entries[0].skill_id).toBe(skillId);
    expect(after.log_entries[0].topic_id).toBe(after.topics[0].id);
    expect(after.pairs[0].topic_a).toBe(after.topics[0].id);
    expect(after.pairs[0].topic_b).toBe(after.topics[1].id);
  });

  test('nothing else about the work changes', () => {
    const before = world();
    const after = reassignIds(before);

    expect(after.topics.map((t) => [t.title, t.due_on, t.interval_days])).toEqual(
      before.topics.map((t) => [t.title, t.due_on, t.interval_days]),
    );
    expect(after.settings).toEqual(before.settings);
    expect(after.reviews[0].rating).toBe('ok');
  });

  test('a log entry with no topic keeps its null', () => {
    const doc = world();
    doc.log_entries[0].topic_id = null;
    expect(reassignIds(doc).log_entries[0].topic_id).toBeNull();
  });

  test('an empty document survives', () => {
    expect(reassignIds(emptyDoc())).toEqual(emptyDoc());
  });
});
