/**
 * Proficiency is never stored — it is read live off the topic's current
 * interval, so it cannot drift out of step with the schedule it describes.
 */

export type BandTone = 'red' | 'amb' | 'acc' | 'grn';

export type Band = {
  label: string;
  level: 1 | 2 | 3 | 4 | 5;
  tone: BandTone;
};

// Red, amber, accent, green: four steps rather than three, so Fragile and
// Learning do not read as the same problem.
const BANDS: { under: number; band: Band }[] = [
  { under: 3, band: { label: 'Fragile', level: 1, tone: 'red' } },
  { under: 10, band: { label: 'Learning', level: 2, tone: 'amb' } },
  { under: 35, band: { label: 'Familiar', level: 3, tone: 'acc' } },
  { under: 154, band: { label: 'Strong', level: 4, tone: 'grn' } },
  { under: Infinity, band: { label: 'Retained', level: 5, tone: 'grn' } },
];

export function bandFor(intervalDays: number): Band {
  return (BANDS.find((b) => intervalDays < b.under) ?? BANDS[BANDS.length - 1]).band;
}

/** "22d gap" up to a month, then "3mo gap" — the shape of the schedule, not a score. */
export function gapLabel(intervalDays: number): string {
  return intervalDays >= 30 ? `${Math.round(intervalDays / 30)}mo gap` : `${Math.round(intervalDays)}d gap`;
}

export type Pip = { filled: boolean; width: number };

export function pipsFor(band: Band): Pip[] {
  return [1, 2, 3, 4, 5].map((i) => ({ filled: i <= band.level, width: i <= band.level ? 7 : 5 }));
}
