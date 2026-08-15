import { addDays } from '../dates';
import { buildAgenda, buildPlan, HORIZONS, redistribute } from '../plan';
import { projectedDates } from '../schedule';
import { doc, skill, topic } from './factory';

const DAY = '2026-08-09';

function world(over: Parameters<typeof doc>[0] = {}) {
  const maths = skill({ id: 'maths', name: 'Maths AA HL', genre: 'reasoning', hue_index: 0 });
  const chem = skill({ id: 'chem', name: 'Chemistry HL', genre: 'conceptual', hue_index: 1 });
  return { maths, chem, base: doc({ skills: [maths, chem], ...over }) };
}

describe('the day is ranked before it is cut', () => {
  test('overdue, then priority weak points, then pre-deadline, then the rest', () => {
    const { maths, chem, base } = world();
    const normal = topic({ id: 'normal', skill_id: maths.id, due_on: DAY });
    const late = topic({ id: 'late', skill_id: maths.id, due_on: addDays(DAY, -3) });
    const weak = topic({ id: 'weak', skill_id: chem.id, due_on: DAY, penalty: 0.7 });
    const d = { ...base, topics: [normal, weak, late] };

    const plan = buildPlan(d, DAY);
    expect(plan.due.map((i) => i.topic.id)).toEqual(['late', 'weak', 'normal']);
    expect(plan.due[0].flag).toBe('overdue');
    expect(plan.due[1].flag).toBe('weak');
    expect(plan.due[2].flag).toBe(null);
  });

  test('the later something is, the further up it sits', () => {
    const { maths, base } = world();
    const a = topic({ id: 'a', skill_id: maths.id, due_on: addDays(DAY, -1) });
    const b = topic({ id: 'b', skill_id: maths.id, due_on: addDays(DAY, -9) });
    const plan = buildPlan({ ...base, topics: [a, b] }, DAY);
    expect(plan.due.map((i) => i.topic.id)).toEqual(['b', 'a']);
    expect(plan.due[0].lateLabel).toBe('9 days late');
  });

  test('the pre-deadline window flips the format to timed', () => {
    const { maths, base } = world();
    const t = topic({ id: 't', skill_id: maths.id, due_on: DAY });
    const d = {
      ...base,
      topics: [t],
      settings: { ...base.settings, exam_date: addDays(DAY, 10), pre_deadline_days: 21 },
    };
    const plan = buildPlan(d, DAY);
    expect(plan.due[0].flags).toContain('deadline');
    expect(plan.due[0].method).toBe('Timed, exam conditions — one sitting.');
  });

  test('an escalated format shows as a plateau and replaces the method line', () => {
    const { maths, base } = world();
    const t = topic({ id: 't', skill_id: maths.id, due_on: DAY, format_rung: 3 });
    const plan = buildPlan({ ...base, topics: [t] }, DAY);
    expect(plan.due[0].flags).toContain('plateau');
    expect(plan.due[0].method).toBe('Unlabelled set — no prompts on the sheet.');
  });

  test('nothing due later than today gets into the day', () => {
    const { maths, base } = world();
    const t = topic({ id: 'future', skill_id: maths.id, due_on: addDays(DAY, 1) });
    expect(buildPlan({ ...base, topics: [t] }, DAY).due).toHaveLength(0);
  });

  test('archived, paused and archived-skill work is not scheduled at all', () => {
    const { maths, base } = world();
    const gone = skill({ id: 'gone', archived_at: '2026-08-01T00:00:00.000Z' });
    const d = {
      ...base,
      skills: [...base.skills, gone],
      topics: [
        topic({ id: 'archived', skill_id: maths.id, due_on: DAY, archived_at: '2026-08-01T00:00:00.000Z' }),
        topic({ id: 'paused', skill_id: maths.id, due_on: DAY, state: 'paused' }),
        topic({ id: 'orphan', skill_id: gone.id, due_on: DAY }),
      ],
    };
    expect(buildPlan(d, DAY).due).toHaveLength(0);
  });
});

describe('capacity and backlog', () => {
  const { maths, base } = world();
  const many = Array.from({ length: 12 }, (_, i) =>
    topic({ id: `t${i}`, skill_id: maths.id, due_on: addDays(DAY, -i) }),
  );
  const d = { ...base, topics: many, settings: { ...base.settings, daily_capacity: 5 } };

  test('only the day\'s capacity is shown; the rest folds behind it', () => {
    const plan = buildPlan(d, DAY);
    expect(plan.focus).toHaveLength(5);
    expect(plan.backlog).toHaveLength(7);
    expect(plan.over).toBe(7);
  });

  test('the focus set is the front of the ranked list, not a separate triage', () => {
    const plan = buildPlan(d, DAY);
    expect(plan.focus.map((i) => i.topic.id)).toEqual(plan.due.slice(0, 5).map((i) => i.topic.id));
  });

  test('a day inside capacity is never over', () => {
    const plan = buildPlan({ ...d, settings: { ...d.settings, daily_capacity: 20 } }, DAY);
    expect(plan.over).toBe(0);
    expect(plan.backlog).toHaveLength(0);
  });
});

describe('redistribute', () => {
  test('moves the movable overflow to the next day with room', () => {
    const { maths, base } = world();
    const topics = [
      topic({ id: 'late', skill_id: maths.id, due_on: addDays(DAY, -2) }),
      topic({ id: 'weak', skill_id: maths.id, due_on: DAY, penalty: 0.7 }),
      topic({ id: 'a', skill_id: maths.id, due_on: DAY }),
      topic({ id: 'b', skill_id: maths.id, due_on: DAY }),
    ];
    const d = { ...base, topics, settings: { ...base.settings, daily_capacity: 2 } };
    const moves = redistribute(d, DAY);
    expect(moves.map((m) => m.id).sort()).toEqual(['a', 'b']);
    expect(moves.every((m) => m.due_on === addDays(DAY, 1))).toBe(true);
  });

  test('overdue work and weak points stay put', () => {
    const { maths, base } = world();
    const topics = [
      topic({ id: 'late', skill_id: maths.id, due_on: addDays(DAY, -2) }),
      topic({ id: 'weak', skill_id: maths.id, due_on: addDays(DAY, -1), penalty: 0.7 }),
    ];
    const d = { ...base, topics, settings: { ...base.settings, daily_capacity: 1 } };
    expect(redistribute(d, DAY)).toEqual([]);
  });

  test('it steps over days that are already full', () => {
    const { maths, base } = world();
    const topics = [
      topic({ id: 'a', skill_id: maths.id, due_on: DAY }),
      topic({ id: 'b', skill_id: maths.id, due_on: DAY }),
      topic({ id: 'tomorrow', skill_id: maths.id, due_on: addDays(DAY, 1) }),
    ];
    const d = { ...base, topics, settings: { ...base.settings, daily_capacity: 1 } };
    const moves = redistribute(d, DAY);
    expect(moves).toEqual([{ id: 'b', due_on: addDays(DAY, 2) }]);
  });
});

describe('confusable pairs', () => {
  test('two things you mix up are never in the same day while either is shaky', () => {
    const { chem, base } = world();
    const kc = topic({ id: 'kc', skill_id: chem.id, title: 'Kc and Kp', due_on: DAY, interval_days: 5 });
    const le = topic({ id: 'le', skill_id: chem.id, title: "Le Chatelier", due_on: DAY, interval_days: 5 });
    const d = {
      ...base,
      topics: [kc, le],
      pairs: [{ id: 'p', topic_a: 'kc', topic_b: 'le', created_at: '', updated_at: '' }],
    };
    const plan = buildPlan(d, DAY);
    expect(plan.focus).toHaveLength(1);
    expect(plan.backlog).toHaveLength(1);
    expect(plan.backlog[0].heldApartFrom?.id).toBe(plan.focus[0].topic.id);
    expect(plan.backlog[0].reasons.join(' ')).toContain('Held apart from');
  });

  test('once both are stable they are allowed to collide', () => {
    const { chem, base } = world();
    const a = topic({ id: 'a', skill_id: chem.id, due_on: DAY, interval_days: 48 });
    const b = topic({ id: 'b', skill_id: chem.id, due_on: DAY, interval_days: 106 });
    const d = {
      ...base,
      topics: [a, b],
      pairs: [{ id: 'p', topic_a: 'a', topic_b: 'b', created_at: '', updated_at: '' }],
    };
    expect(buildPlan(d, DAY).focus).toHaveLength(2);
  });
});

describe('interleaving', () => {
  test('a reasoning topic is never scheduled alone', () => {
    const { maths, base } = world();
    const a = topic({ id: 'a', skill_id: maths.id, title: 'Integration by parts', due_on: DAY });
    const b = topic({ id: 'b', skill_id: maths.id, title: 'Related rates', due_on: DAY });
    const plan = buildPlan({ ...base, topics: [a, b] }, DAY);
    expect(plan.due[0].partner?.id).toBe('b');
    expect(plan.due[0].method).toContain('Interleaved with Related rates');
    expect(plan.due[0].reasons.join(' ')).toContain('never scheduled alone');
  });

  test('with only one topic in the skill, the partner comes from another skill', () => {
    const { maths, chem, base } = world();
    const a = topic({ id: 'a', skill_id: maths.id, due_on: DAY });
    const other = topic({ id: 'other', skill_id: chem.id, title: 'Le Chatelier', due_on: addDays(DAY, 30) });
    const plan = buildPlan({ ...base, topics: [a, other] }, DAY);
    expect(plan.due[0].partner?.id).toBe('other');
    expect(plan.due[0].reasons.join(' ')).toContain('another skill');
  });

  test('other genres are not interleaved', () => {
    const { chem, base } = world();
    const a = topic({ id: 'a', skill_id: chem.id, due_on: DAY });
    const b = topic({ id: 'b', skill_id: chem.id, due_on: DAY });
    expect(buildPlan({ ...base, topics: [a, b] }, DAY).due[0].partner).toBe(null);
  });
});

describe('why this?', () => {
  test('every flag the engine raised is stated in words', () => {
    const { chem, base } = world();
    const t = topic({
      id: 't',
      skill_id: chem.id,
      due_on: addDays(DAY, -2),
      penalty: 0.7,
      format_rung: 2,
      sub_skill: 'pressure changes',
    });
    const d = { ...base, topics: [t], settings: { ...base.settings, exam_date: addDays(DAY, 5) } };
    const reasons = buildPlan(d, DAY).due[0].reasons.join('\n');
    expect(reasons).toContain('Due 2 days ago');
    expect(reasons).toContain('×0.7 penalty');
    expect(reasons).toContain('pressure changes');
    expect(reasons).toContain('plateau');
    expect(reasons).toContain('before the exam');
    expect(reasons).toContain('Compressed curve');
  });

  test('a per-item deck says it counts as one thing', () => {
    const { base } = world();
    const spanish = skill({ id: 'es', name: 'Spanish B SL', genre: 'language', hue_index: 3 });
    const t = topic({ id: 't', skill_id: spanish.id, due_on: DAY });
    const d = { ...base, skills: [...base.skills, spanish], topics: [t] };
    expect(buildPlan(d, DAY).due[0].reasons.join('\n')).toContain('one thing, not one per card');
  });
});

describe('the agenda', () => {
  const { maths, base } = world();
  const t = topic({ id: 't', skill_id: maths.id, due_on: addDays(DAY, 1), interval_days: 5, repetition: 2 });
  const d = { ...base, topics: [t] };

  test('only the next review is committed; the rest are marked projected', () => {
    const groups = buildAgenda(d, DAY, '2w', null, projectedDates);
    const rows = groups.flatMap((g) => g.rows);
    expect(rows[0].chip).toBe('next');
    expect(rows[0].committed).toBe(true);
    expect(rows.slice(1).every((r) => !r.committed)).toBe(true);
    expect(rows[1]?.chip).toBe('2nd');
  });

  test('overdue work is shown against today, marked overdue', () => {
    const late = topic({ id: 'late', skill_id: maths.id, due_on: addDays(DAY, -4) });
    const groups = buildAgenda({ ...base, topics: [late] }, DAY, '2w', null, projectedDates);
    expect(groups[0].key).toBe(DAY);
    expect(groups[0].rows[0].chip).toBe('overdue');
  });

  test('the skill filter narrows the whole tab', () => {
    const other = topic({ id: 'o', skill_id: 'chem', due_on: addDays(DAY, 1) });
    const both = { ...d, topics: [t, other] };
    const filtered = buildAgenda(both, DAY, '2w', 'chem', projectedDates);
    expect(filtered.flatMap((g) => g.rows).every((r) => r.skill.id === 'chem')).toBe(true);
  });

  test('widening the horizon rolls days into months and years', () => {
    expect(HORIZONS.map((h) => h.key)).toEqual(['2w', '3m', '1y', '5y']);
    expect(buildAgenda(d, DAY, '2w', null, projectedDates)[0].key).toHaveLength(10);
    expect(buildAgenda(d, DAY, '1y', null, projectedDates)[0].key).toHaveLength(7);
    expect(buildAgenda(d, DAY, '5y', null, projectedDates)[0].key).toHaveLength(4);
  });

  test('nothing past the horizon is listed', () => {
    const groups = buildAgenda(d, DAY, '2w', null, projectedDates);
    expect(groups.every((g) => g.key <= addDays(DAY, 14))).toBe(true);
  });
});
