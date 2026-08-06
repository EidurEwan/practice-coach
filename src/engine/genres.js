// Genre detection + the genre -> optimal method map (spec section 2).

export const GENRES = ['language', 'reasoning', 'physical', 'conceptual', 'memorization'];

export const GENRE_LABEL = {
  language: 'Language',
  reasoning: 'Reasoning',
  physical: 'Physical',
  conceptual: 'Conceptual',
  memorization: 'Memorization',
};

/**
 * Default method stack per genre. `formats` is the escalation ladder used by
 * plateau detection — when a topic stalls we move it one rung up.
 */
export const METHOD_MAP = {
  language: {
    primary: [
      'Comprehensible-input immersion',
      'Per-item SRS for vocab & grammar patterns',
      'Low-stakes output practice (speaking / writing)',
    ],
    why: 'Acquisition needs exposure volume; SRS fights forgetting on discrete items; output cements retrieval.',
    perItemSRS: true,
    formats: ['recognition', 'recall', 'production', 'spontaneous output', 'conversation under time pressure'],
  },
  reasoning: {
    primary: [
      'Spaced retrieval practice',
      'Interleaving across topics',
      'Worked-example fading (worked → guided → independent)',
    ],
    why: 'Interleaving builds discrimination between problem types — most exam failure is misidentifying which method a question wants, not forgetting a formula.',
    perItemSRS: false,
    formats: ['worked example', 'guided practice', 'independent problems', 'mixed/unlabelled problem set', 'timed exam conditions'],
  },
  physical: {
    closed: {
      primary: [
        'Blocked practice early to groove the motor pattern',
        'Shift to randomized practice as competence builds',
        'Sleep between sessions',
      ],
      why: 'Blocked repetition builds the base pattern fast; randomizing later prevents autopilot and aids transfer.',
      formats: ['blocked reps', 'serial practice', 'randomized sub-skills', 'pressure / performance conditions'],
    },
    open: {
      primary: [
        'Variable / randomized practice from day one',
        'Reactive drills under unpredictable conditions',
        'Sleep between sessions',
      ],
      why: 'Blocked practice actively hurts open skills — the skill IS the ability to react to variation, so training must be variable from the start.',
      formats: ['variable drill', 'reactive drill', 'unpredictable feed', 'live / competitive conditions'],
    },
    perItemSRS: false,
  },
  conceptual: {
    primary: [
      'Retrieval practice (self-quizzing)',
      'Elaborative interrogation ("why is this true?")',
      'Concept mapping',
      'Spaced review',
    ],
    why: 'Understanding decays into "recognition without recall" without active retrieval.',
    perItemSRS: false,
    formats: ['free recall', 'elaborative interrogation', 'concept map / generation', 'teach it back', 'timed essay conditions'],
  },
  memorization: {
    primary: [
      'Per-item SRS (SM-2 style, individual ease factors)',
      'Mnemonic / chunk encoding at first exposure',
    ],
    why: 'Pure recall tasks respond best to algorithmic spacing, but only if the item was well-encoded to begin with.',
    perItemSRS: true,
    formats: ['cued recall', 'free recall', 'reverse recall', 'timed full-list dump'],
  },
};

export function methodStack(genre, physicalType) {
  if (genre === 'physical') {
    return METHOD_MAP.physical[physicalType === 'open' ? 'open' : 'closed'];
  }
  return METHOD_MAP[genre];
}

/** Genres that carry per-item intervals + ease factors rather than per-topic. */
export function usesPerItemSRS(genre) {
  return genre === 'memorization' || genre === 'language';
}

/** Genres that must never be reviewed in isolation (spec section 3). */
export function requiresInterleaving(genre) {
  return genre === 'reasoning' || genre === 'conceptual';
}

const KEYWORDS = {
  language: [
    'spanish', 'french', 'german', 'japanese', 'mandarin', 'chinese', 'italian', 'korean',
    'arabic', 'portuguese', 'russian', 'hebrew', 'latin', 'dutch', 'swedish', 'norwegian',
    'danish', 'icelandic', 'polish', 'turkish', 'hindi', 'greek', 'welsh', 'irish',
    'language', 'grammar', 'conversation', 'esl', 'tefl',
  ],
  reasoning: [
    'math', 'maths', 'mathematics', 'calculus', 'algebra', 'trigonometry', 'geometry',
    'statistics', 'mechanics', 'physics', 'logic', 'proof', 'programming', 'coding',
    'python', 'javascript', 'rust', 'algorithms', 'leetcode', 'engineering', 'circuits',
    'chess', 'econometrics', 'problem solving',
  ],
  physical: [
    'guitar', 'piano', 'violin', 'drums', 'cello', 'bass', 'saxophone', 'singing', 'voice',
    'tennis', 'basketball', 'football', 'soccer', 'golf', 'boxing', 'sparring', 'judo',
    'jiu-jitsu', 'bjj', 'karate', 'fencing', 'climbing', 'swimming', 'running', 'cycling',
    'dance', 'ballet', 'gymnastics', 'skating', 'skiing', 'snowboard', 'surfing', 'archery',
    'darts', 'pool', 'juggling', 'typing', 'calligraphy', 'improv', 'free throw', 'scales',
  ],
  conceptual: [
    'biology', 'chemistry', 'history', 'geography', 'economics', 'psychology', 'sociology',
    'philosophy', 'politics', 'law', 'medicine', 'physiology', 'ecology', 'geology',
    'astronomy', 'architecture', 'theory', 'systems', 'cell biology', 'genetics',
    'business studies', 'accounting',
  ],
  memorization: [
    'vocab', 'vocabulary', 'flashcard', 'periodic table', 'formula', 'formulas', 'anatomy',
    'dates', 'capitals', 'kanji', 'hiragana', 'katakana', 'alphabet', 'bones', 'muscles',
    'drug', 'terminology', 'definitions', 'quotes', 'lines', 'script', 'table',
  ],
};

// Open skills are reactive; closed skills are self-paced. Used to pick the
// physical sub-type when we can infer it.
const OPEN_SKILL_HINTS = [
  'tennis', 'basketball', 'football', 'soccer', 'boxing', 'sparring', 'judo', 'jiu-jitsu',
  'bjj', 'karate', 'fencing', 'improv', 'badminton', 'squash', 'hockey', 'rugby', 'volleyball',
];

/**
 * Best-effort genre detection from a skill name.
 * Returns { genre, physicalType, blend, confident } — `blend` lists other
 * genres that also matched so the UI can flag mixed subjects (spec: "Most real
 * subjects are a blend — flag this and combine methods").
 */
export function detectGenre(name) {
  const text = String(name || '').toLowerCase();
  const scores = {};

  for (const genre of GENRES) {
    let score = 0;
    for (const kw of KEYWORDS[genre]) {
      if (text.includes(kw)) score += kw.includes(' ') ? 2 : 1;
    }
    if (score > 0) scores[genre] = score;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { genre: null, physicalType: null, blend: [], confident: false };
  }

  const [genre, top] = ranked[0];
  const blend = ranked.slice(1).filter(([, s]) => s >= top * 0.5).map(([g]) => g);

  let physicalType = null;
  if (genre === 'physical') {
    physicalType = OPEN_SKILL_HINTS.some((k) => text.includes(k)) ? 'open' : 'closed';
  }

  return { genre, physicalType, blend, confident: ranked.length === 1 || top > ranked[1][1] };
}
