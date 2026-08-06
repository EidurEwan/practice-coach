// Day-granularity date helpers. Everything in the engine is an ISO "YYYY-MM-DD"
// string; Date objects are only used transiently, always anchored at local noon
// so DST shifts can never move a date across a day boundary.

const MS_DAY = 86400000;

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + Math.round(n));
  return toISO(d);
}

/** Signed day count from `from` to `to`. Negative means `to` is in the past. */
export function diffDays(from, to) {
  return Math.round((parseISO(to) - parseISO(from)) / MS_DAY);
}

export function weekday(iso) {
  return parseISO(iso).toLocaleDateString(undefined, { weekday: 'short' });
}

export function shortDate(iso) {
  return parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "today" / "tomorrow" / "Fri 12 Sep (+5d)" / "Mon 1 Sep (3d overdue)" */
export function humanDate(iso, ref = todayISO()) {
  const delta = diffDays(ref, iso);
  if (delta === 0) return 'today';
  if (delta === 1) return 'tomorrow';
  if (delta === -1) return 'yesterday';
  const label = `${weekday(iso)} ${shortDate(iso)}`;
  return delta < 0 ? `${label} (${-delta}d overdue)` : `${label} (+${delta}d)`;
}
