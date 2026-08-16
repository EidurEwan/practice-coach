import { Band, BandTone } from '../engine/bands';
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

/**
 * A band as a foreground and its tint, for chips and badges. `fnt` is not a
 * band — it is the muted state a paused skill uses — but it belongs on the
 * same switch so no caller has to invent a fallback. Callers that map only
 * some tones and default the rest end up painting Fragile and Learning in the
 * accent, which is the opposite of what the band table says.
 */
export function bandColors(tone: BandTone | 'fnt', c: Palette): { fg: string; bg: string } {
  switch (tone) {
    case 'red':
      return { fg: c.red, bg: c.redT };
    case 'amb':
      return { fg: c.amb, bg: c.ambT };
    case 'grn':
      return { fg: c.grn, bg: c.grnT };
    case 'acc':
      return { fg: c.acc, bg: c.accT };
    case 'fnt':
      return { fg: c.fnt, bg: c.sunk };
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
