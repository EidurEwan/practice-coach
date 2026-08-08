/// Interval maths: expanding-spacing curves, SM-2, and forgetting-rate
/// calibration.
library;

import 'dart:math' as math;

import 'dates.dart';
import 'genres.dart';

/// Days after first exposure, roughly x2.2 each step (spec section 3).
const baseCurve = [1, 3, 7, 16, 35, 70, 154, 339];

/// Reasoning & conceptual topics get compressed early intervals.
const tightCurve = [1, 2, 5, 10, 22, 48, 106, 233];

const growth = 2.2;

const ratings = ['easy', 'ok', 'hard', 'failed'];

/// Confidence adjustment applied to the next interval (spec section 3).
const ratingMultiplier = {'easy': 1.3, 'ok': 1.0, 'hard': 0.6, 'failed': 0.0};

/// Rating -> SM-2 quality score.
const ratingQ = {'easy': 5, 'ok': 4, 'hard': 3, 'failed': 1};

const easeMin = 1.3;
const easeMax = 3.0;
const easeDefault = 2.5;

/// Permanent shrink applied when a topic is rated hard/failed 3x running.
const weakPointPenalty = 0.7;
const penaltyFloor = 0.4;

/// Assumed stability (days) of a single un-reviewed exposure for an average
/// learner, under R(d) = exp(-d / S). The reference point the forgetting-rate
/// diagnostic is scored against.
const referenceStabilityDaysConst = 7;

const calibrationMin = 0.6;
const calibrationMax = 1.5;

double clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));

List<int> curveFor(String genre) =>
    genre == 'reasoning' || genre == 'conceptual' ? tightCurve : baseCurve;

/// Interval for step [rep], extrapolating past the end of the table by xgrowth.
double curveStep(List<int> curve, int rep) {
  if (rep < curve.length) return curve[rep].toDouble();
  var v = curve.last.toDouble();
  for (var i = curve.length; i <= rep; i += 1) {
    v *= growth;
  }
  return v;
}

/// The scheduling state an interval update reads and writes.
class CurveState {
  const CurveState({
    required this.repetition,
    required this.intervalDays,
    required this.ease,
    this.difficultyPenalty = 1,
  });
  final int repetition;
  final int intervalDays;
  final double ease;
  final double difficultyPenalty;
}

class DiagnosticAnswer {
  const DiagnosticAnswer({required this.daysSince, required this.score});
  final num? daysSince;
  final num? score;
}

/// Turn diagnostic answers into an interval scale factor. Below 1 compresses
/// intervals (fast forgetter), above 1 stretches them.
double calibrationFromDiagnostic(List<DiagnosticAnswer> answers) {
  final usable = answers
      .where((a) => a.score != null && a.daysSince != null
          && a.score!.isFinite && a.daysSince!.isFinite)
      .toList();
  if (usable.isEmpty) return 1;

  final factors = usable.map((a) {
    final days = math.max(1.0, a.daysSince!.toDouble());
    final retention = clamp(a.score!.toDouble(), 0.05, 0.95);
    final observedStability = -days / math.log(retention);
    // sqrt damps the response so one shaky answer cannot blow up the schedule.
    return math.sqrt(observedStability / referenceStabilityDaysConst);
  }).toList();

  final mean = factors.reduce((a, b) => a + b) / factors.length;
  return double.parse(clamp(mean, calibrationMin, calibrationMax).toStringAsFixed(2));
}

/// Expanding-curve update, used for topic-level tracks
/// (reasoning / conceptual / physical).
CurveState curveUpdate(CurveState state, String rating,
    {required String genre, double calibration = 1}) {
  final curve = curveFor(genre);
  final penalty = state.difficultyPenalty;

  if (rating == 'failed') {
    return CurveState(
      repetition: 0,
      intervalDays: 1,
      ease: clamp(state.ease - 0.2, easeMin, easeMax),
    );
  }

  final easeDelta = rating == 'easy' ? 0.1 : (rating == 'hard' ? -0.15 : 0.0);
  final ease = clamp(state.ease + easeDelta, easeMin, easeMax);
  final repetition = state.repetition + 1;

  final raw = curveStep(curve, repetition) *
      calibration *
      (ease / easeDefault) *
      ratingMultiplier[rating]! *
      penalty;

  // Minimum one day = minimum one sleep cycle before any repeat.
  return CurveState(
    repetition: repetition,
    intervalDays: math.max(1, raw.round()),
    ease: ease,
  );
}

/// Strict per-item SM-2, used for memorization and language items so each item
/// carries its own ease factor rather than averaging across a topic.
CurveState sm2Update(CurveState state, String rating, {double calibration = 1}) {
  final q = ratingQ[rating]!;
  final penalty = state.difficultyPenalty;

  final delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  final ease = clamp(state.ease + delta, easeMin, easeMax);

  if (q < 3) return CurveState(repetition: 0, intervalDays: 1, ease: ease);

  final repetition = state.repetition + 1;
  double interval;
  if (repetition == 1) {
    interval = 1;
  } else if (repetition == 2) {
    interval = 6;
  } else {
    interval = state.intervalDays * ease;
  }

  interval *= calibration * ratingMultiplier[rating]! * penalty;

  return CurveState(
    repetition: repetition,
    intervalDays: math.max(1, interval.round()),
    ease: ease,
  );
}

/// Dispatch to the right algorithm for the track.
CurveState nextState(CurveState state, String rating,
    {required String genre, double calibration = 1}) {
  return usesPerItemSrs(genre)
      ? sm2Update(state, rating, calibration: calibration)
      : curveUpdate(state, rating, genre: genre, calibration: calibration);
}

/// First interval after initial exposure, before any review has happened.
int firstInterval(String genre, [double calibration = 1]) {
  return math.max(1, (curveStep(curveFor(genre), 0) * calibration).round());
}

class ProjectedReview {
  const ProjectedReview({required this.date, required this.repetition});
  final String date;
  final int repetition;
}

/// Project every review falling on or before [untilIso], assuming each one is
/// rated "OK". Returns the repetition count as it will stand at each review, so
/// effort can be estimated per step.
///
/// This is a forecast, not a schedule: a single "failed" collapses the chain
/// back to a 1-day interval, and an "easy" stretches it. Only the first entry
/// is an actually-committed due date.
///
/// [from] projects overdue items from there rather than from the date missed.
List<ProjectedReview> projectUntil(
  CurveState start,
  String dueDate,
  String genre,
  double calibration,
  String untilIso, {
  String? from,
  int maxSteps = 200,
}) {
  var state = start;
  var cursor = (from != null && dueDate.compareTo(from) < 0) ? from : dueDate;

  final out = <ProjectedReview>[];
  while (cursor.compareTo(untilIso) <= 0 && out.length < maxSteps) {
    out.add(ProjectedReview(date: cursor, repetition: state.repetition));
    final next = nextState(state, 'ok', genre: genre, calibration: calibration);
    state = CurveState(
      repetition: next.repetition,
      intervalDays: next.intervalDays,
      ease: next.ease,
      difficultyPenalty: state.difficultyPenalty,
    );
    cursor = addDays(cursor, state.intervalDays);
  }
  return out;
}

/// Project the next [count] review dates assuming every future rating is "OK".
/// Used for the "upcoming schedule" line of the practice card.
List<String> projectSchedule(
  CurveState start,
  String dueDate,
  String genre,
  double calibration, [
  int count = 5,
]) {
  var state = start;
  var cursor = dueDate;
  final out = <String>[cursor];

  for (var i = 1; i < count; i += 1) {
    final next = nextState(state, 'ok', genre: genre, calibration: calibration);
    state = CurveState(
      repetition: next.repetition,
      intervalDays: next.intervalDays,
      ease: next.ease,
      difficultyPenalty: state.difficultyPenalty,
    );
    cursor = addDays(cursor, state.intervalDays);
    out.add(cursor);
  }
  return out;
}
