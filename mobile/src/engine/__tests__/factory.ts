import { Genre, PhysicalKind } from '../genres';
import { EASE_DEFAULT } from '../schedule';
import { Doc, Skill, Topic, DEFAULT_SETTINGS } from '../types';

let n = 0;
const id = (p: string) => `${p}-${++n}`;
const NOW = '2026-08-09T09:00:00.000Z';

export function skill(over: Partial<Skill> = {}): Skill {
  return {
    id: id('skill'),
    name: 'Maths AA HL',
    genre: 'reasoning' as Genre,
    physical_kind: null as PhysicalKind | null,
    hue_index: 0,
    archived_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

export function topic(over: Partial<Topic> = {}): Topic {
  return {
    id: id('topic'),
    skill_id: 'skill-1',
    title: 'Integration by parts',
    sub_skill: null,
    state: 'learning',
    interval_days: 5,
    ease: EASE_DEFAULT,
    repetition: 2,
    streak: 0,
    penalty: 1,
    format_rung: 0,
    due_on: '2026-08-09',
    last_reviewed_at: null,
    archived_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

export function doc(over: Partial<Doc> = {}): Doc {
  return {
    skills: [],
    topics: [],
    reviews: [],
    log_entries: [],
    pairs: [],
    settings: { ...DEFAULT_SETTINGS },
    ...over,
  };
}
