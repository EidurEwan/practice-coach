import { daysBetween, Day } from './dates';
import { Genre } from './genres';
import { Topic } from './types';

/**
 * The rules for getting things into the schedule. Pure, so the Log screen's
 * promises can be tested without it.
 */

/**
 * The numbering an exam-board specification or a copied list puts in front of
 * each line: "1.", "2)", "1.1", "3.2.1", "a)", "(iv)", or a bullet. A bare
 * leading number with no punctuation is left alone — "3 sets of reps" is a
 * title, not item three.
 */
const MARKER = /^\s*(?:[-–—•*·▪◦]\s*|\(?(?:\d+(?:\.\d+)*|[a-z]|[ivxlc]+)[.)]\s+|\d+(?:\.\d+)+\s+)/i;

/** One topic per line of a pasted syllabus, numbering and bullets stripped, duplicates dropped. */
export function parseSyllabus(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw;
    // Nested markers ("- 1.2 Vectors") come off one at a time.
    for (let i = 0; i < 3 && MARKER.test(line); i++) line = line.replace(MARKER, '');
    const title = line.replace(/\s+/g, ' ').trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}

/**
 * Memorization refuses to schedule a fact that was never encoded: rote
 * repetition of an unencoded fact is the slowest way there is to learn it. A
 * mnemonic, an image or a chunking at first exposure is the price of entry.
 */
export function needsEncoding(genre: Genre, encoding: string | null | undefined): boolean {
  return genre === 'memorization' && !encoding?.trim();
}

/**
 * How many days early practising a topic would be — zero or less when it is
 * due. Re-drilling what is not due buys fluency you already have and spends
 * the spacing that makes the next review work.
 */
export function daysEarly(topic: Topic, on: Day): number {
  return daysBetween(on, topic.due_on);
}
