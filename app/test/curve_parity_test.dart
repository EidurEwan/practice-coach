import 'package:flutter_test/flutter_test.dart';
import 'package:practice_coach/engine/curve.dart';
import 'package:practice_coach/engine/dates.dart';
import 'package:practice_coach/engine/genres.dart';

void main() {
  test('dates are day-exact across a DST boundary', () {
    expect(addDays('2026-03-28', 2), '2026-03-30');
    expect(diffDays('2026-03-28', '2026-03-30'), 2);
    expect(diffDays('2026-03-30', '2026-03-28'), -2);
    expect(addDays('2026-12-31', 1), '2027-01-01');
  });

  test('genre detection maps names and infers open vs closed', () {
    expect(detectGenre('AQA A-Level Maths').genre, 'reasoning');
    expect(detectGenre('Spanish').genre, 'language');
    expect(detectGenre('Periodic table').genre, 'memorization');
    expect(detectGenre('Cell Biology').genre, 'conceptual');
    expect(detectGenre('Tennis return').physicalType, 'open');
    expect(detectGenre('Guitar scales').physicalType, 'closed');
    expect(detectGenre('Underwater basket weaving').genre, isNull);
  });

  test('base curve follows 1 -> 3 -> 7 -> 16 -> 35 on straight OK', () {
    var state = const CurveState(repetition: 0, intervalDays: 1, ease: 2.5);
    final seen = <int>[];
    for (var i = 0; i < 5; i += 1) {
      final n = curveUpdate(state, 'ok', genre: 'memorization');
      state = CurveState(repetition: n.repetition, intervalDays: n.intervalDays, ease: n.ease);
      seen.add(state.intervalDays);
    }
    expect(seen, baseCurve.sublist(1, 6));
  });

  test('reasoning uses the compressed 1 -> 2 -> 5 -> 10 curve', () {
    var state = const CurveState(repetition: 0, intervalDays: 1, ease: 2.5);
    final seen = <int>[];
    for (var i = 0; i < 4; i += 1) {
      final n = curveUpdate(state, 'ok', genre: 'reasoning');
      state = CurveState(repetition: n.repetition, intervalDays: n.intervalDays, ease: n.ease);
      seen.add(state.intervalDays);
    }
    expect(seen, tightCurve.sublist(1, 5));
  });

  test('easy stretches, hard shrinks, failed resets to 1', () {
    const base = CurveState(repetition: 2, intervalDays: 7, ease: 2.5);
    final ok = curveUpdate(base, 'ok', genre: 'conceptual');
    final easy = curveUpdate(base, 'easy', genre: 'conceptual');
    final hard = curveUpdate(base, 'hard', genre: 'conceptual');
    final failed = curveUpdate(base, 'failed', genre: 'conceptual');
    expect(easy.intervalDays, greaterThan(ok.intervalDays));
    expect(hard.intervalDays, lessThan(ok.intervalDays));
    expect(failed.intervalDays, 1);
    expect(failed.repetition, 0);
    expect(failed.ease, lessThan(base.ease));
  });

  test('SM-2 gives each item its own ease factor', () {
    const start = CurveState(repetition: 0, intervalDays: 1, ease: 2.5);
    var easyItem = start;
    var hardItem = start;
    for (var i = 0; i < 3; i += 1) {
      final e = sm2Update(easyItem, 'easy');
      final h = sm2Update(hardItem, 'hard');
      easyItem = CurveState(repetition: e.repetition, intervalDays: e.intervalDays, ease: e.ease);
      hardItem = CurveState(repetition: h.repetition, intervalDays: h.intervalDays, ease: h.ease);
    }
    expect(easyItem.ease, greaterThan(2.5));
    expect(hardItem.ease, lessThan(2.5));
    expect(easyItem.intervalDays, greaterThan(hardItem.intervalDays));

    final lapsed = sm2Update(
      const CurveState(repetition: 5, intervalDays: 40, ease: 2.5), 'failed');
    expect(lapsed.intervalDays, 1);
    expect(lapsed.repetition, 0);
  });

  test('never schedules a repeat sooner than one sleep cycle', () {
    const punished = CurveState(repetition: 0, intervalDays: 1, ease: 1.3, difficultyPenalty: 0.4);
    final next = curveUpdate(punished, 'hard', genre: 'reasoning', calibration: 0.6);
    expect(next.intervalDays, greaterThanOrEqualTo(1));
  });

  test('diagnostic compresses for fast forgetters and stretches for retainers', () {
    final fast = calibrationFromDiagnostic(const [
      DiagnosticAnswer(daysSince: 3, score: 0.2),
      DiagnosticAnswer(daysSince: 3, score: 0),
    ]);
    final average = calibrationFromDiagnostic(const [DiagnosticAnswer(daysSince: 3, score: 0.65)]);
    final strong = calibrationFromDiagnostic(const [
      DiagnosticAnswer(daysSince: 7, score: 1),
      DiagnosticAnswer(daysSince: 5, score: 1),
    ]);
    expect(fast, lessThan(0.9));
    expect(average, greaterThan(0.9));
    expect(average, lessThan(1.15));
    expect(strong, greaterThan(1.2));
    expect(calibrationFromDiagnostic(const []), 1);
  });
}

// (model tests appended by the port)
