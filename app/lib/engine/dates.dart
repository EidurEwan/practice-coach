/// Day-granularity date helpers. Everything in the engine is an ISO
/// "YYYY-MM-DD" string; DateTime is only used transiently, always anchored at
/// local noon so DST shifts can never move a date across a day boundary.
library;

String toIso(DateTime date) {
  final m = date.month.toString().padLeft(2, '0');
  final d = date.day.toString().padLeft(2, '0');
  return '${date.year}-$m-$d';
}

String todayIso() => toIso(DateTime.now());

DateTime parseIso(String iso) {
  final parts = iso.split('-').map(int.parse).toList();
  return DateTime(parts[0], parts[1], parts[2], 12);
}

String addDays(String iso, num n) {
  final d = parseIso(iso);
  return toIso(DateTime(d.year, d.month, d.day + n.round(), 12));
}

/// Signed day count from [from] to [to]. Negative means [to] is in the past.
int diffDays(String from, String to) {
  // Both ends sit at local noon, so the difference is always within a couple of
  // hours of a whole number of days even across a DST boundary.
  return (parseIso(to).difference(parseIso(from)).inHours / 24).round();
}

// The JS original delegated to toLocaleDateString. Dart's equivalent needs the
// intl package and a loaded locale; these are fixed English names instead, which
// is what the deployed app renders for en-GB and keeps the tests deterministic.
const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String weekday(String iso) => _weekdays[parseIso(iso).weekday - 1];

String shortDate(String iso) {
  final d = parseIso(iso);
  return '${d.day} ${_months[d.month - 1]}';
}

/// "today" / "tomorrow" / "Fri 12 Sep (+5d)" / "Mon 1 Sep (3d overdue)"
String humanDate(String iso, [String? ref]) {
  final delta = diffDays(ref ?? todayIso(), iso);
  if (delta == 0) return 'today';
  if (delta == 1) return 'tomorrow';
  if (delta == -1) return 'yesterday';
  final label = '${weekday(iso)} ${shortDate(iso)}';
  return delta < 0 ? '$label (${-delta}d overdue)' : '$label (+${delta}d)';
}
