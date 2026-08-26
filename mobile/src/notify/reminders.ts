import { Doc } from '../engine/types';
import { Day, addDays, parseDay } from '../engine/dates';
import { buildPlan } from '../engine/plan';

/**
 * Reminders are a device setting, not an account one.
 *
 * What time you want to be nudged depends on the phone in your pocket, not on
 * who you are — and a second device should not start buzzing because the first
 * one asked to. Keeping them out of the synced document also means no new
 * columns on a server that cannot be migrated from here.
 */
export type ReminderPrefs = {
  enabled: boolean;
  /** 24-hour "HH:MM", local time. */
  time: string;
};

export const DEFAULT_REMINDERS: ReminderPrefs = { enabled: false, time: '08:00' };

export type PlannedReminder = {
  at: Date;
  day: Day;
  due: number;
  title: string;
  body: string;
};

export function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map((n) => parseInt(n, 10));
  const hour = Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 8;
  const minute = Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0;
  return { hour, minute };
}

/** "08:00" → "8:00 am", for the settings row. */
export function timeLabel(time: string): string {
  const { hour, minute } = parseTime(time);
  const suffix = hour < 12 ? 'am' : 'pm';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/**
 * What to schedule over the next few days, from the schedule as it stands.
 *
 * Deliberately pure, so the decisions worth getting right — how many things a
 * day really has, and whether to say anything at all — can be tested without a
 * notification service anywhere near them.
 *
 * Two rules it exists to enforce:
 *
 *  - **Never nag about nothing.** A day with nothing due is skipped outright.
 *    An app that buzzes to tell you it has no work for you is one you turn off.
 *  - **Never claim a number it cannot keep.** The count comes from the same
 *    `buildPlan` the screen uses, and the whole set is rebuilt whenever the
 *    schedule changes, so what the notification says is what you will find.
 */
export function plannedReminders(
  doc: Doc,
  prefs: ReminderPrefs,
  from: Day,
  days = 7,
  now: Date = new Date(),
): PlannedReminder[] {
  if (!prefs.enabled) return [];

  const { hour, minute } = parseTime(prefs.time);
  const out: PlannedReminder[] = [];

  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const at = parseDay(day);
    at.setHours(hour, minute, 0, 0);

    // A time that has already gone is not a reminder.
    if (at.getTime() <= now.getTime()) continue;

    const due = buildPlan(doc, day).due.length;
    if (due === 0) continue;

    out.push({
      at,
      day,
      due,
      title: 'Interval',
      body: due === 1 ? '1 thing to go over today.' : `${due} things to go over today.`,
    });
  }

  return out;
}
