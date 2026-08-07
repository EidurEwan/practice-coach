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
            ? `Worked example, then guided, then one on your own.` +
              (partner ? ` Finish with 1 from ${partner}.` : '')
            : `3 unlabelled questions on ${item.subSkill || item.title}` +
              (partner ? `, mixed with 2 from ${partner} — shuffled, so you pick the method.` : ' — shuffled, so you pick the method.'),
      };

    case 'conceptual':
      return {
        label: 'Retrieval + elaboration',
        detail:
          `Free recall, then ask why each part is true. ` +
          (partner ? `Link it to ${partner}.` : 'Link it to something you know.'),
      };

    case 'physical': {
      if (skill.physicalType === 'open') {
        return {
          label: 'Variable / reactive drill',
          detail:
            `Vary tempo, angle and feed every rep. ` +
            'Never two the same in a row.',
        };
      }
      const blocked = item.blockedSessions < BLOCKED_SESSION_LIMIT;
      return {
        label: blocked ? 'Blocked practice' : 'Randomized practice',
        detail: blocked
          ? `3 sets, identical conditions. Blocked session ${item.blockedSessions + 1} of ${BLOCKED_SESSION_LIMIT}.`
          : `Mix with other sub-skills, never two the same in a row.${partner ? ` With ${partner}.` : ''}`,
      };
    }

    case 'language':
      return {
        label: 'SRS + output',
        detail:
          `${itemCount > 1 ? `${itemCount} cards. ` : ''}Recall each, then use the ones you got in a sentence.`,
      };

    case 'memorization':
      return {
        label: `SRS — ${format}`,
        detail:
          `${itemCount > 1 ? `${itemCount} cards. ` : ''}Answer before revealing. ` +
          (item.encoding
            ? `A miss means re-running its encoding, not re-reading it.`
            : 'A miss needs a mnemonic before it goes back in.'),
      };

    default:
      return { label: 'Retrieval practice', detail: `Blind recall of ${item.title}, then check.` };
  }
}

function preDeadlineDetail(skill, item, partner) {
  switch (skill.genre) {
    case 'reasoning':
      return `Past-paper conditions, clock running, no notes. Unlabelled${partner ? `, with ${partner}` : ''}.`;
    case 'conceptual':
      return `Timed answer, exam wording, no notes. Mark it after.`;
    case 'physical':
      return `Performance conditions. One attempt, no re-dos.`;
    case 'language':
      return `Under time pressure, then a full sentence unaided.`;
    case 'memorization':
      return `Write everything you can recall in 3 minutes, then check gaps.`;
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
