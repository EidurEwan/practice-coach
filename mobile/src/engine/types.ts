import { Day } from './dates';
import { Genre, PhysicalKind } from './genres';

export type Rating = 'failed' | 'hard' | 'ok' | 'easy' | 'pushed';
export type TopicState = 'new' | 'learning' | 'stable' | 'paused';
export type ThemeChoice = 'system' | 'light' | 'dark';

export type Skill = {
  id: string;
  name: string;
  genre: Genre;
  physical_kind: PhysicalKind | null;
  /** Position in the skill-hue cycle. Fixed at creation so a colour never moves. */
  hue_index: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Topic = {
  id: string;
  skill_id: string;
  title: string;
  sub_skill: string | null;
  state: TopicState;
  interval_days: number;
  /** Only per-item genres move this; curve genres leave it at its default. */
  ease: number;
  /** Rung on the genre's curve. */
  repetition: number;
  /**
   * Consecutive ratings in one direction: +n for OKs (three is a plateau),
   * −n for hard/failed (three is a priority weak point). Easy clears it.
   */
  streak: number;
  /** Permanent interval multiplier from weak points. 1 → 0.7 → 0.49 → 0.4 floor. */
  penalty: number;
  /** Index into FORMAT_LADDER. Escalates one rung per plateau. */
  format_rung: number;
  due_on: Day;
  last_reviewed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Review = {
  id: string;
  topic_id: string;
  rating: Rating;
  felt_shaky: boolean;
  rated_at: string;
  prev_interval: number;
  next_interval: number;
  updated_at: string;
};

export type LogEntry = {
  id: string;
  skill_id: string;
  topic_id: string | null;
  sub_skill: string | null;
  studied_on: Day;
  flags: string[];
  created_at: string;
  updated_at: string;
};

/** Two things you mix up, held apart while either is shaky. */
export type Pair = {
  id: string;
  topic_a: string;
  topic_b: string;
  created_at: string;
  updated_at: string;
};

export type Settings = {
  daily_capacity: number;
  theme: ThemeChoice;
  pre_deadline_days: number;
  exam_date: Day | null;
  onboarded: boolean;
  updated_at: string;
};

export type Doc = {
  skills: Skill[];
  topics: Topic[];
  reviews: Review[];
  log_entries: LogEntry[];
  pairs: Pair[];
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = {
  daily_capacity: 8,
  theme: 'system',
  pre_deadline_days: 21,
  exam_date: null,
  onboarded: false,
  updated_at: '1970-01-01T00:00:00.000Z',
};

export function emptyDoc(): Doc {
  return { skills: [], topics: [], reviews: [], log_entries: [], pairs: [], settings: { ...DEFAULT_SETTINGS } };
}
