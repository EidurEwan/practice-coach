import { Skill } from '../engine/types';

/**
 * Small decisions the store makes, kept outside React so they can be tested
 * on their own.
 */

/**
 * The colour slot for a new skill: one past the highest in use, archived
 * skills included. Counting the skills instead reused a colour as soon as one
 * had been deleted, so two subjects shared a hue.
 */
export function nextHue(skills: Skill[]): number {
  return skills.reduce((m, s) => Math.max(m, s.hue_index + 1), 0);
}

/** A blank sub-skill on a re-log means "not this time", not "forget the one I named". */
export function keptSubSkill(typed: string | null | undefined, existing: string | null): string | null {
  return typed?.trim() || existing;
}
