/**
 * Every scheduled date in the app is a plain local calendar day, `YYYY-MM-DD`.
 * Intervals are counted in sleeps, so anything with a clock in it (UTC offsets,
 * DST) would move a review by a day at the wrong hour of the night.
 */

export type Day = string;

const MS = 86400000;

export function toDay(d: Date): Day {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(now: Date = new Date()): Day {
  return toDay(now);
}

/** Midday local, so adding days can never cross a DST boundary into yesterday. */
export function parseDay(day: Day): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(day: Day, n: number): Day {
  const d = parseDay(day);
  d.setDate(d.getDate() + Math.round(n));
  return toDay(d);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / MS);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sunday 9 August" — the line under the Today title. */
export function formatLong(day: Day): string {
  const d = parseDay(day);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Sun 9 Aug" — agenda headers and the backdating stepper. */
export function formatShort(day: Day): string {
  const d = parseDay(day);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "Fri 21 May 2027" — dates far enough out that the year is doing work. */
export function formatWithYear(day: Day, now: Date = new Date()): string {
  const d = parseDay(day);
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${formatShort(day)}${year}`;
}

/** "Mon 10 Aug", but "Today"/"Tomorrow" when it is one of those. */
export function formatAgendaDate(day: Day, from: Day): string {
  const n = daysBetween(from, day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return formatShort(day);
}

export function monthLabel(day: Day): string {
  const d = parseDay(day);
  return `${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** "today" / "yesterday" / "3 days ago" / "2 weeks ago" / "5 months ago". */
export function relativePast(n: number): string {
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

/** "back tomorrow" / "back in 5 days" — a rating's consequence, in words. */
export function backIn(days: number): string {
  const n = Math.max(1, Math.round(days));
  if (n === 1) return 'back tomorrow';
  return `back in ${n} days`;
}

/** "tomorrow" / "in 5 days" / "in 3 weeks" / "in 4 months". */
export function inWords(days: number): string {
  const n = Math.round(days);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n < 21) return `in ${n} days`;
  if (n < 60) return `in ${Math.round(n / 7)} weeks`;
  if (n < 365) return `in ${Math.round(n / 30)} months`;
  return `in ${(n / 365).toFixed(n % 365 === 0 ? 0 : 1)} years`;
}

/** "4 days late" / "yesterday" — how far behind a backlog item is. */
export function lateWords(daysLate: number): string {
  if (daysLate <= 0) return 'due today';
  if (daysLate === 1) return 'yesterday';
  return `${daysLate} days late`;
}
