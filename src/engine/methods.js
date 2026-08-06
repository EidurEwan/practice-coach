// Turns an item's genre + state into a concrete instruction: what to actually
// do this session, and how much of the daily load it accounts for.

import { methodStack, usesPerItemSRS } from './genres.js';
import { itemStatus } from './model.js';

const BLOCKED_SESSION_LIMIT = 2; // closed skills: blocked for the first 1-2 sessions

/** The escalation ladder rung this item is currently on. */
export function currentFormat(item, skill) {
  const stack = methodStack(skill.genre, skill.physicalType);
  const formats = stack.formats;
  return formats[Math.min(item.formatIndex, formats.length - 1)];
}

export function canEscalateFormat(item, skill) {
  const stack = methodStack(skill.genre, skill.physicalType);
  return item.formatIndex < stack.formats.length - 1;
}

/**
 * @param {object} ctx
 * @param {boolean} ctx.preDeadline - target date within the pre-deadline window
 * @param {{title:string}|null} ctx.interleaveWith - partner topic for this session
 * @param {number} ctx.itemCount - for batched SRS blocks
 */
export function practiceMethod(item, skill, ctx = {}) {
  const { preDeadline = false, interleaveWith = null, itemCount = 1 } = ctx;
  const status = itemStatus(item);
  const format = currentFormat(item, skill);
  const partner = interleaveWith ? interleaveWith.title : null;

  // Pre-deadline mode overrides the normal ladder: context-matched practice.
  if (preDeadline) {
    return {
      label: 'Timed, exam-format',
      detail: preDeadlineDetail(skill, item, partner),
    };
  }

  switch (skill.genre) {
    case 'reasoning':
      return {
        label: item.repetition === 0 ? 'Worked-example fading' : 'Interleaved retrieval',
        detail:
          item.repetition === 0
            ? `Worked example -> guided attempt -> one independent problem on ${item.subSkill || item.title}.` +
              (partner ? ` Finish with 1 question from ${partner} so it is never practised alone.` : '')
            : `${format}: 3 unlabelled questions on ${item.subSkill || item.title}` +
              (partner ? ` mixed with 2 from ${partner} — shuffled, so you have to identify the method first.` : ' — shuffle them so you must identify the method first.'),
      };

    case 'conceptual':
      return {
        label: 'Retrieval + elaboration',
        detail:
          `Blind free recall of ${item.title}, then elaborative interrogation: why is each part true? ` +
          (partner ? `Then map one link between ${item.title} and ${partner}.` : 'Then map it against a topic you already know.'),
      };

    case 'physical': {
      if (skill.physicalType === 'open') {
        return {
          label: 'Variable / reactive drill',
          detail:
            `Randomize conditions from the start: vary tempo, angle, distance and feed order every rep of ${item.title}. ` +
            'No two consecutive reps the same. Reactive cue, not self-paced.',
        };
      }
      const blocked = item.blockedSessions < BLOCKED_SESSION_LIMIT;
      return {
        label: blocked ? 'Blocked practice' : 'Randomized practice',
        detail: blocked
          ? `Groove the pattern: 3 sets of the same ${item.subSkill || item.title} rep, identical conditions. Session ${item.blockedSessions + 1} of ${BLOCKED_SESSION_LIMIT} blocked.`
          : `Mix ${item.title} with other sub-skills in random order — never two of the same in a row. ${partner ? `Interleave with ${partner}.` : ''}`.trim(),
      };
    }

    case 'language':
      return {
        label: 'SRS + output',
        detail:
          `${itemCount > 1 ? `${itemCount} due items: ` : ''}blind recall each card, then use every item you got right in one spoken or written sentence of your own. ` +
          'Pair with 10 min of comprehensible input (listening/reading) where you can spot them in context.',
      };

    case 'memorization':
      return {
        label: `SRS — ${format}`,
        detail:
          `${itemCount > 1 ? `${itemCount} due items: ` : ''}cue first, answer from memory before revealing. ` +
          (item.encoding
            ? `If one fails, re-run its encoding ("${truncate(item.encoding, 60)}") rather than re-reading the raw fact.`
            : 'Anything that fails needs a mnemonic or chunk before it goes back in the deck.'),
      };

    default:
      return { label: 'Retrieval practice', detail: `Blind recall of ${item.title}, then check.` };
  }
}

function preDeadlineDetail(skill, item, partner) {
  switch (skill.genre) {
    case 'reasoning':
      return `Full past-paper conditions: 4 questions in 25 min, clock running, no notes. Include ${item.subSkill || item.title}${partner ? ` and ${partner}` : ''} unlabelled so you must pick the method.`;
    case 'conceptual':
      return `Write a timed answer on ${item.title} — exam wording, exam time limit, no notes. Mark it against the spec afterwards.`;
    case 'physical':
      return `Run ${item.title} in performance conditions: same warm-up, same kit, same order, one attempt only. No re-dos.`;
    case 'language':
      return `Test conditions: recall under time pressure, then produce the item in a full sentence unaided — spoken if the exam has an oral.`;
    case 'memorization':
      return `Timed full dump: write everything you can recall of ${item.title} in 3 minutes, then check gaps against the list.`;
    default:
      return `Practise ${item.title} in the exact format the assessment will use, under time.`;
  }
}

/**
 * A real retrieval attempt, not a confidence question — the user has to produce
 * something before they are allowed to rate (spec section 3 & 6.4).
 */
export function recallPrompt(item, skill) {
  if (usesPerItemSRS(skill.genre) && item.cue) {
    return `Cue: "${item.cue}" — write the answer from memory before revealing.`;
  }
  switch (skill.genre) {
    case 'reasoning':
      return `No notes: state the method for ${item.subSkill || item.title}, then write one worked example end to end.`;
    case 'conceptual':
      return `No notes: write everything you can recall about ${item.title}, then answer "why is this true?" for the main claim.`;
    case 'physical':
      return `Before you move: describe the key cue for ${item.title} from memory, then do 3 cold reps and note what actually happened.`;
    case 'language':
      return `Produce ${item.title} from memory — meaning, form, and one sentence of your own using it.`;
    case 'memorization':
      return `From memory, write out ${item.title}. No peeking at the list first.`;
    default:
      return `From memory, write out everything you know about ${item.title}.`;
  }
}

/** Prompt shown at first exposure for memorization items (spec section 5). */
export const ENCODING_OPTIONS = [
  { id: 'mnemonic', label: 'Mnemonic', hint: 'A vivid phrase or image that maps to the item' },
  { id: 'acronym', label: 'Acronym', hint: 'First letters into a pronounceable word' },
  { id: 'story', label: 'Story link', hint: 'Chain the items into one absurd narrative' },
  { id: 'loci', label: 'Method of loci', hint: 'Place each item at a spot along a familiar route' },
  { id: 'chunk', label: 'Chunk grouping', hint: 'Break the list into 3-4 meaningful groups' },
];

/**
 * Load is counted in items, not minutes. How long a topic takes is the user's
 * business — it depends on the material, the day, and them — so the app counts
 * what it actually knows: how many things are due. A per-item SRS deck counts
 * as one block of work rather than one unit per card, since it is reviewed as
 * a single pass.
 */
export function workUnits(item, skill, ctx = {}) {
  const { itemCount = 1 } = ctx;
  if (usesPerItemSRS(skill.genre)) {
    // A deck is one sitting; very large decks are worth more than one.
    return Math.max(1, Math.ceil(itemCount / 20));
  }
  return 1;
}

function truncate(text, n) {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}
