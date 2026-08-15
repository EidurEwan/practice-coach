import { Band } from '../engine/bands';
import { Flag } from '../engine/plan';
import { Rating } from '../engine/types';
import { Palette } from './tokens';

/** Band colour lives here, not in the engine — the engine only knows the tone. */
export function bandColor(band: Band, c: Palette): string {
  switch (band.tone) {
    case 'red':
      return c.red;
    case 'amb':
      return c.amb;
    case 'grn':
      return c.grn;
    case 'acc':
      return c.acc;
  }
}

/** Flag badges: red for late or failing, amber for caution. */
export function flagColors(flag: Flag, c: Palette): { fg: string; bg: string } {
  switch (flag) {
    case 'overdue':
    case 'weak':
      return { fg: c.red, bg: c.redT };
    case 'plateau':
    case 'deadline':
      return { fg: c.amb, bg: c.ambT };
  }
}

/**
 * A rating's colour is its consequence, never a judgement of the person:
 * green for a longer interval, amber for shorter, red for a reset.
 */
export function ratingColors(rating: Rating, c: Palette): { fg: string; bg: string } {
  switch (rating) {
    case 'failed':
      return { fg: c.red, bg: c.redT };
    case 'hard':
      return { fg: c.amb, bg: c.ambT };
    case 'ok':
      return { fg: c.tx, bg: c.sunk };
    case 'easy':
      return { fg: c.grn, bg: c.grnT };
    case 'pushed':
      return { fg: c.fnt, bg: 'transparent' };
  }
}

export const RATING_LABEL: Record<Rating, string> = {
  failed: 'Failed',
  hard: 'Hard',
  ok: 'OK',
  easy: 'Easy',
  pushed: 'Pushed back',
};

export const RATING_HELP: Record<Rating, string> = {
  failed: 'Could not do it',
  hard: 'Got there, slowly',
  ok: 'As expected',
  easy: 'No hesitation',
  pushed: "Didn't get to it",
};
