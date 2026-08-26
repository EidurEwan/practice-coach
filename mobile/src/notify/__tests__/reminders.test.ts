import { doc, skill, topic } from '../../engine/__tests__/factory';
import { buildPlan } from '../../engine/plan';
import { DEFAULT_REMINDERS, plannedReminders, parseTime, timeLabel } from '../reminders';

const DAY = '2026-08-16';
const at = (d: string, h = 6) => new Date(`${d}T0${h}:00:00`);

const on = { ...DEFAULT_REMINDERS, enabled: true, time: '08:00' };

describe('plannedReminders', () => {
  it('says nothing at all when reminders are off', () => {
    const s = skill();
    const d = doc({ skills: [s], topics: [topic({ skill_id: s.id, due_on: DAY })] });
    expect(plannedReminders(d, DEFAULT_REMINDERS, DAY, 7, at(DAY))).toEqual([]);
  });

  it('never nags about a day with nothing due', () => {
    const s = skill();
    // Due far outside the window.
    const d = doc({ skills: [s], topics: [topic({ skill_id: s.id, due_on: '2026-12-01' })] });
    expect(plannedReminders(d, on, DAY, 7, at(DAY))).toEqual([]);
  });

  it('counts what the day actually holds, and says so', () => {
    const s = skill();
    const d = doc({
      skills: [s],
      topics: [
        topic({ skill_id: s.id, due_on: DAY }),
        topic({ skill_id: s.id, due_on: DAY }),
      ],
    });
    const [first] = plannedReminders(d, on, DAY, 1, at(DAY));

    expect(first.due).toBe(2);
    expect(first.body).toBe('2 things to go over today.');
    // The number matches what the screen will show for that day.
    expect(first.due).toBe(buildPlan(d, DAY).due.length);
  });

  it('gets the singular right', () => {
    const s = skill();
    const d = doc({ skills: [s], topics: [topic({ skill_id: s.id, due_on: DAY })] });
    expect(plannedReminders(d, on, DAY, 1, at(DAY))[0].body).toBe('1 thing to go over today.');
  });

  it('fires at the chosen time, in local time', () => {
    const s = skill();
    const d = doc({ skills: [s], topics: [topic({ skill_id: s.id, due_on: DAY })] });
    const [first] = plannedReminders(d, { enabled: true, time: '19:30' }, DAY, 1, at(DAY));
    expect(first.at.getHours()).toBe(19);
    expect(first.at.getMinutes()).toBe(30);
  });

  it('skips a time that has already gone today', () => {
    const s = skill();
    const d = doc({ skills: [s], topics: [topic({ skill_id: s.id, due_on: DAY })] });
    // It is already 10am; an 08:00 reminder for today is not a reminder.
    const late = new Date(`${DAY}T10:00:00`);
    expect(plannedReminders(d, on, DAY, 1, late)).toEqual([]);
  });

  it('carries an overdue topic into every day it is still owed', () => {
    const s = skill();
    const d = doc({ skills: [s], topics: [topic({ skill_id: s.id, due_on: '2026-08-10' })] });
    const planned = plannedReminders(d, on, DAY, 3, at(DAY));
    // Overdue does not go away by itself, so each day still has it.
    expect(planned.map((p) => p.due)).toEqual([1, 1, 1]);
  });
});

describe('time handling', () => {
  it('reads a 24-hour time', () => {
    expect(parseTime('07:05')).toEqual({ hour: 7, minute: 5 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('clamps nonsense rather than scheduling into the void', () => {
    expect(parseTime('99:99')).toEqual({ hour: 23, minute: 59 });
    expect(parseTime('nonsense')).toEqual({ hour: 8, minute: 0 });
  });

  it('shows a time the way a person writes one', () => {
    expect(timeLabel('08:00')).toBe('8:00 am');
    expect(timeLabel('00:30')).toBe('12:30 am');
    expect(timeLabel('12:00')).toBe('12:00 pm');
    expect(timeLabel('19:30')).toBe('7:30 pm');
  });
});
