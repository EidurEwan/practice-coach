import 'package:flutter_test/flutter_test.dart';
import 'package:practice_coach/engine/model.dart';

void main() {
  test('a pasted syllabus becomes topics, numbering and all', () {
    final parsed = parseBulkInput([
      '1. Proof by induction',
      '2) Vectors | scalar product',
      '- Differentiation from first principles',
      '• Integration by parts',
      '1.1 Binomial expansion',
      '3.2.1 Hypothesis testing',
      '',
      'Complex numbers',
    ].join('\n'));

    expect(parsed.map((p) => p.title).toList(), [
      'Proof by induction',
      'Vectors',
      'Differentiation from first principles',
      'Integration by parts',
      'Binomial expansion',
      'Hypothesis testing',
      'Complex numbers',
    ]);
    expect(parsed[1].subSkill, 'scalar product');
    expect(parsed[0].subSkill, isNull);
  });

  test('a bare leading number is part of the title, not a list marker', () {
    final parsed = parseBulkInput('3 sets of reps\n5 a-side positioning');
    expect(parsed.map((p) => p.title).toList(), ['3 sets of reps', '5 a-side positioning']);
  });

  test('per-item decks parse cue, answer and encoding', () {
    final parsed = parseBulkInput(
      'el boligrafo | the pen | bowl of graph paper\nla mochila | the backpack\njust a cue',
      perItem: true,
    );
    expect(parsed[0].title, 'el boligrafo — the pen');
    expect(parsed[0].cue, 'el boligrafo');
    expect(parsed[0].answer, 'the pen');
    expect(parsed[0].encoding, 'bowl of graph paper');
    expect(parsed[1].encoding, isNull);
    expect(parsed[2].title, 'just a cue');
    expect(parsed[2].answer, isNull);
  });

  test('empty and whitespace-only input yields nothing', () {
    expect(parseBulkInput(''), isEmpty);
    expect(parseBulkInput('\n  \n\t\n'), isEmpty);
    expect(parseBulkInput('  |  |  ', perItem: true), isEmpty);
  });

  test('the JSON shape round-trips, so a web export imports unchanged', () {
    final skill = Skill.create(name: 'AQA A-Level Maths', genre: 'reasoning', createdAt: '2026-01-05');
    final item = Item.create(skill, const ItemInput(title: 'Proofs', firstExposure: '2026-01-05'));
    final store = Store(skills: [skill], items: [item]);

    final json = store.toJson();
    expect(json['version'], 2);
    expect((json['skills'] as List).first['genre'], 'reasoning');

    final back = Skill.fromJson(Map<String, dynamic>.from((json['skills'] as List).first as Map));
    expect(back.id, skill.id);
    expect(back.name, 'AQA A-Level Maths');
    expect(back.archived, isFalse);

    final backItem = Item.fromJson(Map<String, dynamic>.from((json['items'] as List).first as Map));
    expect(backItem.dueDate, item.dueDate);
    expect(backItem.kind, 'topic');
    expect(backItem.ease, item.ease);
  });

  test('a v1 skill with no archived or suspended field reads as active', () {
    final legacy = Skill.fromJson({
      'id': 'sk_1', 'name': 'Spanish', 'genre': 'language',
      'calibration': 1, 'createdAt': '2026-01-05',
    });
    expect(legacy.archived, isFalse);
    expect(legacy.suspended, isNull);
  });

  test('capacity in minutes converts rather than being dropped', () {
    final s = Settings.fromJson({'dailyCapacityMinutes': 48});
    expect(s.dailyCapacityItems, 6);
  });
}
