/// Genre detection + the genre -> optimal method map (spec section 2).
library;

const genres = ['language', 'reasoning', 'physical', 'conceptual', 'memorization'];

const genreLabel = {
  'language': 'Language',
  'reasoning': 'Reasoning',
  'physical': 'Physical',
  'conceptual': 'Conceptual',
  'memorization': 'Memorization',
};

/// Default method stack per genre. [formats] is the escalation ladder used by
/// plateau detection — when a topic stalls we move it one rung up.
class MethodStack {
  const MethodStack({required this.primary, required this.why, required this.formats});
  final List<String> primary;
  final String why;
  final List<String> formats;
}

const _language = MethodStack(
  primary: [
    'Comprehensible-input immersion',
    'Per-item SRS for vocab & grammar patterns',
    'Low-stakes output practice (speaking / writing)',
  ],
  why: 'Acquisition needs exposure volume; SRS fights forgetting on discrete items; output cements retrieval.',
  formats: ['recognition', 'recall', 'production', 'spontaneous output', 'conversation under time pressure'],
);

const _reasoning = MethodStack(
  primary: [
    'Spaced retrieval practice',
    'Interleaving across topics',
    'Worked-example fading (worked → guided → independent)',
  ],
  why: 'Interleaving builds discrimination between problem types — most exam failure is misidentifying which method a question wants, not forgetting a formula.',
  formats: ['worked example', 'guided practice', 'independent problems', 'mixed/unlabelled problem set', 'timed exam conditions'],
);

const _physicalClosed = MethodStack(
  primary: [
    'Blocked practice early to groove the motor pattern',
    'Shift to randomized practice as competence builds',
    'Sleep between sessions',
  ],
  why: 'Blocked repetition builds the base pattern fast; randomizing later prevents autopilot and aids transfer.',
  formats: ['blocked reps', 'serial practice', 'randomized sub-skills', 'pressure / performance conditions'],
);

const _physicalOpen = MethodStack(
  primary: [
    'Variable / randomized practice from day one',
    'Reactive drills under unpredictable conditions',
    'Sleep between sessions',
  ],
  why: 'Blocked practice actively hurts open skills — the skill IS the ability to react to variation, so training must be variable from the start.',
  formats: ['variable drill', 'reactive drill', 'unpredictable feed', 'live / competitive conditions'],
);

const _conceptual = MethodStack(
  primary: [
    'Retrieval practice (self-quizzing)',
    'Elaborative interrogation ("why is this true?")',
    'Concept mapping',
    'Spaced review',
  ],
  why: 'Understanding decays into "recognition without recall" without active retrieval.',
  formats: ['free recall', 'elaborative interrogation', 'concept map / generation', 'teach it back', 'timed essay conditions'],
);

const _memorization = MethodStack(
  primary: [
    'Per-item SRS (SM-2 style, individual ease factors)',
    'Mnemonic / chunk encoding at first exposure',
  ],
  why: 'Pure recall tasks respond best to algorithmic spacing, but only if the item was well-encoded to begin with.',
  formats: ['cued recall', 'free recall', 'reverse recall', 'timed full-list dump'],
);

MethodStack methodStack(String genre, String? physicalType) {
  switch (genre) {
    case 'language':
      return _language;
    case 'reasoning':
      return _reasoning;
    case 'physical':
      return physicalType == 'open' ? _physicalOpen : _physicalClosed;
    case 'conceptual':
      return _conceptual;
    default:
      return _memorization;
  }
}

/// Genres that carry per-item intervals + ease factors rather than per-topic.
bool usesPerItemSrs(String genre) => genre == 'memorization' || genre == 'language';

/// Genres that must never be reviewed in isolation (spec section 3).
bool requiresInterleaving(String genre) => genre == 'reasoning' || genre == 'conceptual';

const _keywords = {
  'language': [
    'spanish', 'french', 'german', 'japanese', 'mandarin', 'chinese', 'italian', 'korean',
    'arabic', 'portuguese', 'russian', 'hebrew', 'latin', 'dutch', 'swedish', 'norwegian',
    'danish', 'icelandic', 'polish', 'turkish', 'hindi', 'greek', 'welsh', 'irish',
    'language', 'grammar', 'conversation', 'esl', 'tefl',
  ],
  'reasoning': [
    'math', 'maths', 'mathematics', 'calculus', 'algebra', 'trigonometry', 'geometry',
    'statistics', 'mechanics', 'physics', 'logic', 'proof', 'programming', 'coding',
    'python', 'javascript', 'rust', 'algorithms', 'leetcode', 'engineering', 'circuits',
    'chess', 'econometrics', 'problem solving',
  ],
  'physical': [
    'guitar', 'piano', 'violin', 'drums', 'cello', 'bass', 'saxophone', 'singing', 'voice',
    'tennis', 'basketball', 'football', 'soccer', 'golf', 'boxing', 'sparring', 'judo',
    'jiu-jitsu', 'bjj', 'karate', 'fencing', 'climbing', 'swimming', 'running', 'cycling',
    'dance', 'ballet', 'gymnastics', 'skating', 'skiing', 'snowboard', 'surfing', 'archery',
    'darts', 'pool', 'juggling', 'typing', 'calligraphy', 'improv', 'free throw', 'scales',
  ],
  'conceptual': [
    'biology', 'chemistry', 'history', 'geography', 'economics', 'psychology', 'sociology',
    'philosophy', 'politics', 'law', 'medicine', 'physiology', 'ecology', 'geology',
    'astronomy', 'architecture', 'theory', 'systems', 'cell biology', 'genetics',
    'business studies', 'accounting',
  ],
  'memorization': [
    'vocab', 'vocabulary', 'flashcard', 'periodic table', 'formula', 'formulas', 'anatomy',
    'dates', 'capitals', 'kanji', 'hiragana', 'katakana', 'alphabet', 'bones', 'muscles',
    'drug', 'terminology', 'definitions', 'quotes', 'lines', 'script', 'table',
  ],
};

// Open skills are reactive; closed skills are self-paced. Used to pick the
// physical sub-type when we can infer it.
const _openSkillHints = [
  'tennis', 'basketball', 'football', 'soccer', 'boxing', 'sparring', 'judo', 'jiu-jitsu',
  'bjj', 'karate', 'fencing', 'improv', 'badminton', 'squash', 'hockey', 'rugby', 'volleyball',
];

class Detection {
  const Detection({this.genre, this.physicalType, this.blend = const [], this.confident = false});
  final String? genre;
  final String? physicalType;
  final List<String> blend;
  final bool confident;
}

/// Best-effort genre detection from a skill name. [blend] lists other genres
/// that also matched, so the UI can flag mixed subjects (spec: "Most real
/// subjects are a blend — flag this and combine methods").
Detection detectGenre(String? name) {
  final text = (name ?? '').toLowerCase();
  final scores = <String, int>{};

  for (final genre in genres) {
    var score = 0;
    for (final kw in _keywords[genre]!) {
      if (text.contains(kw)) score += kw.contains(' ') ? 2 : 1;
    }
    if (score > 0) scores[genre] = score;
  }

  final ranked = scores.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
  if (ranked.isEmpty) return const Detection();

  final top = ranked.first.value;
  final blend = ranked
      .skip(1)
      .where((e) => e.value >= top * 0.5)
      .map((e) => e.key)
      .toList();

  final genre = ranked.first.key;
  String? physicalType;
  if (genre == 'physical') {
    physicalType = _openSkillHints.any(text.contains) ? 'open' : 'closed';
  }

  return Detection(
    genre: genre,
    physicalType: physicalType,
    blend: blend,
    confident: ranked.length == 1 || top > ranked[1].value,
  );
}
