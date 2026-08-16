/**
 * Genre is the whole engine in one field: it picks the interval curve *and*
 * the practice method. It is detected from the skill's name at creation and
 * can always be overridden by hand.
 */

export type Genre = 'reasoning' | 'conceptual' | 'memorization' | 'language' | 'physical';
export type PhysicalKind = 'closed' | 'open';

export const GENRES: Genre[] = ['reasoning', 'conceptual', 'memorization', 'language', 'physical'];

/**
 * What a topic and a sub-skill look like for each genre, for use as input
 * placeholders. A maths example under a language skill reads as though the app
 * has not noticed what you are studying.
 */
export const GENRE_EXAMPLE: Record<Genre, { topic: string; sub: string }> = {
  reasoning: { topic: 'Integration by parts', sub: 'Choosing u and dv' },
  conceptual: { topic: 'Enzyme inhibition', sub: 'Competitive vs non-competitive' },
  memorization: { topic: 'Krebs cycle steps', sub: 'The decarboxylation stages' },
  language: { topic: 'Irregular preterite', sub: 'The -ir stem changes' },
  physical: { topic: 'Backhand slice', sub: 'Contact point' },
};

export const GENRE_LABEL: Record<Genre, string> = {
  reasoning: 'Reasoning',
  conceptual: 'Conceptual',
  memorization: 'Memorization',
  language: 'Language',
  physical: 'Physical',
};

/** Compressed — reasoning and conceptual work comes back sooner and tighter. */
export const COMPRESSED = [1, 2, 5, 10, 22, 48, 106, 233];
/** Expanding — physical skills need the long tail. */
export const EXPANDING = [1, 3, 7, 16, 35, 70, 154, 339];

/** Past the end of a curve, each rung is 2.2× the one before. */
export const CURVE_GROWTH = 2.2;

export function curveFor(genre: Genre): number[] {
  return genre === 'physical' ? EXPANDING : COMPRESSED;
}

/** Language and memorization carry their own ease rather than a fixed rung. */
export function isPerItem(genre: Genre): boolean {
  return genre === 'language' || genre === 'memorization';
}

export function curveName(genre: Genre): string {
  if (isPerItem(genre)) return 'Per-item SM-2';
  return genre === 'physical' ? 'Expanding curve' : 'Compressed curve';
}

export function curveLabel(genre: Genre): string {
  if (isPerItem(genre)) return 'Per-item SM-2';
  return genre === 'physical'
    ? 'Expanding curve · 1 → 3 → 7 → 16 → 35'
    : 'Compressed curve · 1 → 2 → 5 → 10 → 22';
}

/** The one-line practice method shown wherever the skill appears. */
export function methodFor(genre: Genre, kind?: PhysicalKind | null): string {
  switch (genre) {
    case 'reasoning':
      return 'Never reviewed alone — interleaved with a second topic.';
    case 'conceptual':
      return 'Retrieval, then elaborative interrogation.';
    case 'memorization':
      return 'SRS. It refuses to schedule a fact you have not encoded.';
    case 'language':
      return 'SRS plus one output sentence of your own.';
    case 'physical':
      return kind === 'open'
        ? 'Variable and reactive from day one.'
        : 'Blocked reps first, then randomised.';
  }
}

export function genreBadge(genre: Genre, kind?: PhysicalKind | null): string {
  if (genre === 'physical') return `Physical (${kind ?? 'closed'})`;
  return GENRE_LABEL[genre];
}

/**
 * The practice-format ladder. Three "OK"s running is a plateau, not stability,
 * so the format escalates a rung rather than the schedule repeating itself.
 */
export const FORMAT_LADDER = [
  { name: 'Worked example', line: 'Worked example — solution beside you, then cover it.' },
  { name: 'Guided', line: 'Guided — prompts on the sheet, no answers.' },
  { name: 'Independent', line: 'Independent — from memory first, then check.' },
  { name: 'Unlabelled set', line: 'Unlabelled set — no prompts on the sheet.' },
  { name: 'Timed', line: 'Timed, exam conditions — one sitting.' },
];

export const TOP_OF_LADDER = FORMAT_LADDER.length - 1;

const KEYWORDS: [Genre, string[]][] = [
  ['reasoning', ['maths', 'math', 'mathematics', 'physics', 'proof', 'logic', 'algorithm', 'mechanics', 'aa hl', 'ai hl', 'statistics']],
  ['conceptual', ['chemistry', 'biology', 'economics', 'psychology', 'geography', 'science', 'theory', 'philosophy']],
  ['memorization', ['history', 'anatomy', 'law', 'vocab', 'dates', 'terms', 'pharmacology', 'taxonomy']],
  ['language', ['spanish', 'french', 'german', 'mandarin', 'japanese', 'italian', 'latin', 'language', ' b sl', ' b hl', 'english b']],
  ['physical', ['climbing', 'bouldering', 'piano', 'guitar', 'violin', 'tennis', 'swimming', 'football', 'dance', 'drums', 'sprint', 'lifting']],
];

export type Detection = {
  genre: Genre;
  /** Shown as a badge next to the detected genre, so a guess is never silent. */
  confidence: 'From the name' | 'Blend — check it' | 'Guessed';
};

export function detectGenre(name: string): Detection {
  const n = ` ${name.toLowerCase()} `;
  const hits = KEYWORDS.filter(([, words]) => words.some((w) => n.includes(w)));
  if (!hits.length) return { genre: 'conceptual', confidence: 'Guessed' };
  return { genre: hits[0][0], confidence: hits.length > 1 ? 'Blend — check it' : 'From the name' };
}
