import { DEFAULT_SETTINGS, Doc, emptyDoc, Settings } from '../engine/types';
import { COLLECTIONS } from './persistence';

/**
 * The shape of a saved document, and how to read every shape ever written.
 *
 * Version 1 was the bare document, written straight to storage with no
 * envelope — so there was nothing to tell a saved schedule from any other
 * blob, and no way to change the shape later without guessing what you had.
 * Version 2 wraps it, which is the whole point of the rewrite.
 *
 * This lives apart from the store because export files are the same format.
 * One parser means a file exported by an old build imports into a new one,
 * and a document saved by an old build loads without ceremony.
 */

export const CURRENT_VERSION = 2;

export type Envelope = {
  format: 'interval';
  version: number;
  /** When it was written. Diagnostic only — merging uses per-row timestamps. */
  savedAt: string;
  doc: Doc;
};

export type ParseResult = {
  doc: Doc;
  /** The version it was read from; below CURRENT_VERSION means it was migrated. */
  from: number;
  migrated: boolean;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Fills in anything absent and drops anything of the wrong shape.
 *
 * A document that has lost a collection — which is exactly what the old
 * concurrent-write bug produced — must not take a screen down when it is read
 * back. Rows without an id cannot be addressed by any code here, so they are
 * dropped; everything else is kept exactly as written. Nothing is repaired
 * beyond that, because silently deleting a person's work to tidy a file is
 * worse than showing it oddly.
 */
export function normaliseDoc(value: unknown): Doc {
  const base = emptyDoc();
  if (!isObject(value)) return base;

  for (const name of COLLECTIONS) {
    const rows = value[name];
    if (!Array.isArray(rows)) continue;
    (base as Record<string, unknown>)[name] = rows.filter(
      (r) => isObject(r) && typeof r.id === 'string' && r.id.length > 0,
    );
  }

  if (isObject(value.settings)) {
    base.settings = { ...DEFAULT_SETTINGS, ...(value.settings as Partial<Settings>) } as Settings;
  }

  return base;
}

/** Is this the version 2 envelope, rather than a bare version 1 document? */
function isEnvelope(value: unknown): value is Envelope {
  return isObject(value) && value.format === 'interval' && typeof value.version === 'number';
}

/**
 * Reads any saved or exported document, whatever version wrote it.
 *
 * Throws only when the text is not JSON at all. A recognisable document that
 * is merely incomplete comes back normalised, because refusing to open a
 * schedule is a worse failure than opening one with a collection missing.
 */
export function parseDocument(raw: string): ParseResult {
  const value: unknown = JSON.parse(raw);

  if (isEnvelope(value)) {
    return { doc: normaliseDoc(value.doc), from: value.version, migrated: value.version !== CURRENT_VERSION };
  }

  // Version 1: the document itself, unwrapped.
  return { doc: normaliseDoc(value), from: 1, migrated: true };
}

/** What gets written — always the current version. */
export function serialiseDocument(doc: Doc, now: Date = new Date()): string {
  const envelope: Envelope = {
    format: 'interval',
    version: CURRENT_VERSION,
    savedAt: now.toISOString(),
    doc,
  };
  return JSON.stringify(envelope);
}

/** The same envelope, laid out for a human reading an export. */
export function serialiseForExport(doc: Doc, now: Date = new Date()): string {
  return JSON.stringify(JSON.parse(serialiseDocument(doc, now)), null, 2);
}
