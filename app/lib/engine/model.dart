/// Data model: skills (tracks), items (topics or SRS cards), review log.
///
/// The JSON shape is deliberately identical to the web app's, so an export from
/// one imports into the other without translation.
library;

import 'curve.dart';
import 'dates.dart';
import 'genres.dart';

int _counter = 0;
String newId([String prefix = 'x']) {
  _counter += 1;
  final stamp = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
  return '${prefix}_${stamp}_${_counter.toRadixString(36)}';
}

/// 2: reviews live only in [Store.reviews]. They used to be written twice, once
/// there and once into an item's own history, which wasted about a third of the
/// payload and left two copies of one fact for a sync to disagree about.
const storeVersion = 2;

class Settings {
  Settings({
    this.dailyCapacityItems = 6,
    this.preDeadlineWindowDays = 21,
    this.onboarded = false,
    this.theme = 'system',
  });

  int dailyCapacityItems;
  int preDeadlineWindowDays;
  bool onboarded;
  String theme;

  factory Settings.fromJson(Map<String, dynamic> j) => Settings(
        // Load used to be measured in minutes. How long practice takes is the
        // user's call, so the cap counts things due; old settings convert at
        // roughly one item per eight minutes rather than losing the preference.
        dailyCapacityItems: (j['dailyCapacityItems'] as num?)?.toInt() ??
            (j['dailyCapacityMinutes'] != null
                ? ((j['dailyCapacityMinutes'] as num) / 8).round().clamp(2, 1000)
                : 6),
        preDeadlineWindowDays: (j['preDeadlineWindowDays'] as num?)?.toInt() ?? 21,
        onboarded: j['onboarded'] as bool? ?? false,
        theme: j['theme'] as String? ?? 'system',
      );

  Map<String, dynamic> toJson() => {
        'dailyCapacityItems': dailyCapacityItems,
        'preDeadlineWindowDays': preDeadlineWindowDays,
        'onboarded': onboarded,
        'theme': theme,
      };
}

class Diagnostic {
  Diagnostic({
    required this.calibration,
    required this.verdict,
    required this.takenAt,
  });
  final double calibration;
  final String verdict;
  final String takenAt;

  /// A constant of the algorithm rather than per-diagnostic data, but carried
  /// in the JSON because the web app's shape has it.
  int get referenceStabilityDays => referenceStabilityDaysConst;

  factory Diagnostic.fromJson(Map<String, dynamic> j) => Diagnostic(
        calibration: (j['calibration'] as num?)?.toDouble() ?? 1,
        verdict: j['verdict'] as String? ?? '',
        takenAt: j['takenAt'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'calibration': calibration,
        'verdict': verdict,
        'takenAt': takenAt,
        'referenceStabilityDays': referenceStabilityDays,
      };
}

class Skill {
  Skill({
    required this.id,
    required this.name,
    required this.genre,
    this.physicalType,
    this.blend = const [],
    this.level = '',
    this.targetDate,
    this.calibration = 1,
    this.diagnostic,
    this.archived = false,
    this.suspended,
    required this.createdAt,
  });

  final String id;
  String name;
  String genre;
  String? physicalType;
  List<String> blend;
  String level;
  String? targetDate;
  double calibration;
  Diagnostic? diagnostic;

  /// Out of the way but not destroyed. Deleting is a separate, deliberate act
  /// and can only reach something already archived.
  bool archived;

  /// null follows the target date; true is paused by hand; false is an explicit
  /// "keep going" that beats the date.
  bool? suspended;

  String createdAt;

  factory Skill.create({
    required String name,
    required String genre,
    String? physicalType,
    List<String> blend = const [],
    String level = '',
    String? targetDate,
    double calibration = 1,
    Diagnostic? diagnostic,
    String? createdAt,
  }) =>
      Skill(
        id: newId('sk'),
        name: name.trim(),
        genre: genre,
        physicalType: genre == 'physical' ? (physicalType ?? 'closed') : null,
        blend: blend,
        level: level,
        targetDate: targetDate,
        calibration: calibration,
        diagnostic: diagnostic,
        createdAt: createdAt ?? todayIso(),
      );

  factory Skill.fromJson(Map<String, dynamic> j) => Skill(
        id: j['id'] as String,
        name: j['name'] as String? ?? '',
        genre: j['genre'] as String? ?? 'conceptual',
        physicalType: j['physicalType'] as String?,
        blend: (j['blend'] as List?)?.cast<String>() ?? const [],
        level: j['level'] as String? ?? '',
        targetDate: j['targetDate'] as String?,
        calibration: (j['calibration'] as num?)?.toDouble() ?? 1,
        diagnostic: j['diagnostic'] == null
            ? null
            : Diagnostic.fromJson(Map<String, dynamic>.from(j['diagnostic'] as Map)),
        archived: j['archived'] as bool? ?? false,
        suspended: j['suspended'] as bool?,
        createdAt: j['createdAt'] as String? ?? todayIso(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'genre': genre,
        'physicalType': physicalType,
        'blend': blend,
        'level': level,
        'targetDate': targetDate,
        'calibration': calibration,
        'diagnostic': diagnostic?.toJson(),
        'archived': archived,
        'suspended': suspended,
        'createdAt': createdAt,
      };
}

class Item {
  Item({
    required this.id,
    required this.skillId,
    required this.title,
    required this.kind,
    this.subSkill,
    this.encoding,
    this.cue,
    this.answer,
    this.notes,
    required this.firstExposure,
    required this.createdAt,
    this.repetition = 0,
    required this.intervalDays,
    this.ease = easeDefault,
    this.difficultyPenalty = 1,
    required this.dueDate,
    this.lastReviewed,
    this.streakOK = 0,
    this.streakBad = 0,
    this.cleanStreak = 0,
    this.weakFlag = false,
    this.priorityWeak = false,
    this.plateauFlag = false,
    this.formatIndex = 0,
    this.blockedSessions = 0,
    this.archived = false,
  });

  final String id;
  final String skillId;
  String title;

  /// 'topic' for topic-level tracks; 'item' for per-item SRS where each card
  /// carries its own ease factor.
  final String kind;

  String? subSkill;
  String? encoding;
  String? cue;
  String? answer;
  String? notes;

  String firstExposure;
  String createdAt;

  // Scheduling state
  int repetition;
  int intervalDays;
  double ease;
  double difficultyPenalty;
  String dueDate;
  String? lastReviewed;

  // Rating streaks driving plateau / weak-point detection
  int streakOK;
  int streakBad;
  int cleanStreak;
  bool weakFlag;
  bool priorityWeak;
  bool plateauFlag;

  int formatIndex;
  int blockedSessions;
  bool archived;

  factory Item.create(Skill skill, ItemInput input) {
    final exposure = input.firstExposure ?? todayIso();
    final interval = firstInterval(skill.genre, skill.calibration);
    return Item(
      id: newId('it'),
      skillId: skill.id,
      title: input.title.trim(),
      kind: usesPerItemSrs(skill.genre) ? 'item' : 'topic',
      subSkill: _clean(input.subSkill),
      encoding: _clean(input.encoding),
      cue: _clean(input.cue),
      answer: _clean(input.answer),
      notes: _clean(input.notes),
      firstExposure: exposure,
      createdAt: exposure,
      intervalDays: interval,
      dueDate: addDays(exposure, interval),
      weakFlag: input.shaky,
    );
  }

  CurveState get state => CurveState(
        repetition: repetition,
        intervalDays: intervalDays,
        ease: ease,
        difficultyPenalty: difficultyPenalty,
      );

  factory Item.fromJson(Map<String, dynamic> j) => Item(
        id: j['id'] as String,
        skillId: j['skillId'] as String,
        title: j['title'] as String? ?? '',
        kind: j['kind'] as String? ?? 'topic',
        subSkill: j['subSkill'] as String?,
        encoding: j['encoding'] as String?,
        cue: j['cue'] as String?,
        answer: j['answer'] as String?,
        notes: j['notes'] as String?,
        firstExposure: j['firstExposure'] as String? ?? todayIso(),
        createdAt: j['createdAt'] as String? ?? todayIso(),
        repetition: (j['repetition'] as num?)?.toInt() ?? 0,
        intervalDays: (j['intervalDays'] as num?)?.toInt() ?? 1,
        ease: (j['ease'] as num?)?.toDouble() ?? easeDefault,
        difficultyPenalty: (j['difficultyPenalty'] as num?)?.toDouble() ?? 1,
        dueDate: j['dueDate'] as String? ?? todayIso(),
        lastReviewed: j['lastReviewed'] as String?,
        streakOK: (j['streakOK'] as num?)?.toInt() ?? 0,
        streakBad: (j['streakBad'] as num?)?.toInt() ?? 0,
        cleanStreak: (j['cleanStreak'] as num?)?.toInt() ?? 0,
        weakFlag: j['weakFlag'] as bool? ?? false,
        priorityWeak: j['priorityWeak'] as bool? ?? false,
        plateauFlag: j['plateauFlag'] as bool? ?? false,
        formatIndex: (j['formatIndex'] as num?)?.toInt() ?? 0,
        blockedSessions: (j['blockedSessions'] as num?)?.toInt() ?? 0,
        archived: j['archived'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'skillId': skillId,
        'title': title,
        'kind': kind,
        'subSkill': subSkill,
        'encoding': encoding,
        'cue': cue,
        'answer': answer,
        'notes': notes,
        'firstExposure': firstExposure,
        'createdAt': createdAt,
        'repetition': repetition,
        'intervalDays': intervalDays,
        'ease': ease,
        'difficultyPenalty': difficultyPenalty,
        'dueDate': dueDate,
        'lastReviewed': lastReviewed,
        'streakOK': streakOK,
        'streakBad': streakBad,
        'cleanStreak': cleanStreak,
        'weakFlag': weakFlag,
        'priorityWeak': priorityWeak,
        'plateauFlag': plateauFlag,
        'formatIndex': formatIndex,
        'blockedSessions': blockedSessions,
        'archived': archived,
      };
}

String? _clean(String? v) {
  final t = v?.trim();
  return (t == null || t.isEmpty) ? null : t;
}

/// What the UI hands to [logNewItem].
class ItemInput {
  const ItemInput({
    required this.title,
    this.subSkill,
    this.encoding,
    this.cue,
    this.answer,
    this.notes,
    this.shaky = false,
    this.confusableWith = const [],
    this.firstExposure,
  });
  final String title;
  final String? subSkill;
  final String? encoding;
  final String? cue;
  final String? answer;
  final String? notes;
  final bool shaky;
  final List<String> confusableWith;
  final String? firstExposure;
}

class Review {
  Review({
    required this.id,
    required this.itemId,
    required this.skillId,
    required this.date,
    required this.rating,
    this.recallAttempt = '',
    required this.intervalBefore,
    required this.intervalAfter,
    required this.ease,
    required this.format,
  });

  final String id;
  final String itemId;
  final String skillId;
  final String date;
  final String rating;
  final String recallAttempt;
  final int intervalBefore;
  final int intervalAfter;
  final double ease;
  final String format;

  factory Review.fromJson(Map<String, dynamic> j) => Review(
        id: j['id'] as String? ?? newId('rv'),
        itemId: j['itemId'] as String,
        skillId: j['skillId'] as String,
        date: j['date'] as String? ?? '',
        rating: j['rating'] as String? ?? 'ok',
        recallAttempt: j['recallAttempt'] as String? ?? '',
        intervalBefore: (j['intervalBefore'] as num?)?.toInt() ?? 0,
        intervalAfter: (j['intervalAfter'] as num?)?.toInt() ?? 0,
        ease: (j['ease'] as num?)?.toDouble() ?? easeDefault,
        format: j['format'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'itemId': itemId,
        'skillId': skillId,
        'date': date,
        'rating': rating,
        'recallAttempt': recallAttempt,
        'intervalBefore': intervalBefore,
        'intervalAfter': intervalAfter,
        'ease': ease,
        'format': format,
      };
}

class Confusable {
  Confusable({required this.id, required this.a, required this.b, this.note = ''});
  final String id;
  final String a;
  final String b;
  final String note;

  factory Confusable.fromJson(Map<String, dynamic> j) => Confusable(
        id: j['id'] as String? ?? newId('cp'),
        a: j['a'] as String,
        b: j['b'] as String,
        note: j['note'] as String? ?? '',
      );

  Map<String, dynamic> toJson() => {'id': id, 'a': a, 'b': b, 'note': note};
}

class Store {
  Store({
    this.version = storeVersion,
    Settings? settings,
    List<Skill>? skills,
    List<Item>? items,
    List<Review>? reviews,
    List<Confusable>? confusables,
  })  : settings = settings ?? Settings(),
        skills = skills ?? [],
        items = items ?? [],
        reviews = reviews ?? [],
        confusables = confusables ?? [];

  int version;
  Settings settings;
  List<Skill> skills;
  List<Item> items;
  List<Review> reviews;
  List<Confusable> confusables;

  Map<String, dynamic> toJson() => {
        'version': version,
        'settings': settings.toJson(),
        'skills': skills.map((s) => s.toJson()).toList(),
        'items': items.map((i) => i.toJson()).toList(),
        'reviews': reviews.map((r) => r.toJson()).toList(),
        'confusables': confusables.map((c) => c.toJson()).toList(),
      };
}

// --------------------------------------------------------------------- status

/// Derived status — never stored, always recomputed from streaks.
String itemStatus(Item item) {
  if (item.archived) return 'archived';
  if (item.priorityWeak) return 'priority-weak';
  if (item.weakFlag) return 'weak';
  if (item.plateauFlag) return 'plateau';
  return 'active';
}

const statusLabel = {
  'priority-weak': 'Priority weak point',
  'weak': 'Weak',
  'plateau': 'Plateau',
  'active': 'On track',
  'archived': 'Archived',
};

// --------------------------------------------------------------------- reviews

/// Every review of one item, oldest first. [Store.reviews] is the only record.
List<Review> reviewsFor(Store store, String itemId) =>
    store.reviews.where((r) => r.itemId == itemId).toList();

Review? lastReview(Store store, String itemId) {
  final all = reviewsFor(store, itemId);
  return all.isEmpty ? null : all.last;
}

/// How many reviews each item has, in one pass. A table of a hundred topics
/// asking the question a hundred times would scan the whole log each time.
Map<String, int> reviewCounts(Store store) {
  final counts = <String, int>{};
  for (final r in store.reviews) {
    counts[r.itemId] = (counts[r.itemId] ?? 0) + 1;
  }
  return counts;
}

/// Reviews that did not end in failure — a rough proxy for "independently solid".
int stability(Store store, Item item) =>
    reviewsFor(store, item.id).where((r) => r.rating != 'failed').length;

// ----------------------------------------------------------------- confusables

Confusable? linkConfusable(Store store, String aId, String bId, [String note = '']) {
  if (aId == bId) return null;
  for (final c in store.confusables) {
    if ((c.a == aId && c.b == bId) || (c.a == bId && c.b == aId)) return c;
  }
  final pair = Confusable(id: newId('cp'), a: aId, b: bId, note: note);
  store.confusables.add(pair);
  return pair;
}

List<Item> confusablePartners(Store store, String itemId) {
  final ids = store.confusables
      .where((c) => c.a == itemId || c.b == itemId)
      .map((c) => c.a == itemId ? c.b : c.a)
      .toSet();
  return store.items.where((i) => ids.contains(i.id)).toList();
}

Skill? getSkill(Store store, String skillId) {
  for (final s in store.skills) {
    if (s.id == skillId) return s;
  }
  return null;
}

List<Item> itemsForSkill(Store store, String skillId) =>
    store.items.where((i) => i.skillId == skillId && !i.archived).toList();

// ---------------------------------------------------------------- bulk entry

// A syllabus pasted out of a PDF or an exam-board spec arrives numbered, so the
// marker is stripped. Deliberately strict: a bare leading number is left alone,
// because "3 sets of reps" is a title, not a list item.
final _listMarker = RegExp(r'^\s*(?:[-*•–—]|\d+(?:\.\d+)+\.?|\d+[.)])\s+');

/// One item per line. Topic tracks take "title | sub-skill"; per-item decks take
/// "cue | answer | encoding".
///
/// This exists because entering a subject one form submission at a time was the
/// activation wall — forty topics meant forty round trips before the app did
/// anything useful.
List<ItemInput> parseBulkInput(String? text, {bool perItem = false}) {
  final out = <ItemInput>[];
  for (final raw in (text ?? '').split('\n')) {
    final line = raw.replaceFirst(_listMarker, '').trim();
    if (line.isEmpty) continue;
    final parts = line.split('|').map((p) => p.trim()).toList();

    if (!perItem) {
      final title = parts[0];
      if (title.isEmpty) continue;
      out.add(ItemInput(
        title: title,
        subSkill: parts.length > 1 && parts[1].isNotEmpty ? parts[1] : null,
      ));
      continue;
    }

    final cue = parts[0];
    final answer = parts.length > 1 && parts[1].isNotEmpty ? parts[1] : null;
    final encoding = parts.length > 2 && parts[2].isNotEmpty ? parts[2] : null;
    final title = answer != null ? '$cue — $answer' : cue;
    if (title.isEmpty) continue;
    out.add(ItemInput(title: title, cue: cue, answer: answer, encoding: encoding));
  }
  return out;
}
