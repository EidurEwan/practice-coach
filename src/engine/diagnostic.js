// One-time forgetting-rate diagnostic (spec section 1.4).
//
// Rather than asking "how good is your memory", this asks for a real blind
// recall on something the user learned N days ago, and back-solves their
// memory stability from the result.

import {
  BASE_CURVE,
  CALIBRATION_MAX,
  CALIBRATION_MIN,
  REFERENCE_STABILITY_DAYS,
  TIGHT_CURVE,
  calibrationFromDiagnostic,
} from './curve.js';

export const SCORE_OPTIONS = [
  { value: 1, label: 'Got it fully', hint: 'Complete and correct from memory' },
  { value: 0.6, label: 'Partly', hint: 'Gist there, details missing or wrong' },
  { value: 0.2, label: 'Barely', hint: 'One fragment, mostly gone' },
  { value: 0, label: 'Nothing', hint: 'Blank' },
];

export function runDiagnostic(answers) {
  const calibration = calibrationFromDiagnostic(answers);
  return {
    calibration,
    answers,
    verdict: verdictFor(calibration),
    takenAt: new Date().toISOString().slice(0, 10),
    referenceStabilityDays: REFERENCE_STABILITY_DAYS,
  };
}

export function verdictFor(calibration) {
  if (calibration <= CALIBRATION_MIN + 0.01) {
    return 'Fast forgetter — intervals compressed to the floor (60% of default). Reviews will feel frequent early on; they stretch out as items prove themselves.';
  }
  if (calibration < 0.9) {
    return `Faster-than-average forgetting — intervals compressed to ${Math.round(calibration * 100)}% of default.`;
  }
  if (calibration <= 1.1) {
    return 'About average — the default expanding curve applies as-is.';
  }
  if (calibration >= CALIBRATION_MAX - 0.01) {
    return 'Strong retainer — intervals stretched to the ceiling (150% of default). Fewer, further-apart reviews.';
  }
  return `Stronger-than-average retention — intervals stretched to ${Math.round(calibration * 100)}% of default.`;
}

/** Preview of what the calibration does to the two curves, for the UI. */
export function previewCurves(calibration) {
  const scale = (curve) => curve.slice(0, 6).map((d) => Math.max(1, Math.round(d * calibration)));
  return {
    base: scale(BASE_CURVE),
    tight: scale(TIGHT_CURVE),
  };
}
