/**
 * The chart geometry, kept in the engine because it is an argument, not a
 * decoration: each review widens the gap while shrinking the drop, and the
 * flattening is the entire claim the app makes.
 */

export const RECALL_W = 260;
export const RECALL_H = 66;
const Y_TOP = 8;
const Y_BASE = 58;
const FLOOR = 0.14;

export type RecallCurve = {
  /** Solid line: everything up to now. */
  path: string;
  /** Dashed line: the projected next gap, which has not happened yet. */
  future: string;
  /** Gradient fill under the solid line. */
  area: string;
  dots: { x: number; y: number }[];
  baseline: number;
  nowX: number;
  nowY: number;
  /** "1 → 2 → 5 → 10 → 22 days" */
  chainLabel: string;
  /** "38% forgotten by the next one — it was 71% after the first" */
  dropLabel: string;
};

/**
 * Reconstructs the interval chain backwards from where the topic is now, then
 * projects one more gap. Stability grows with each review, which is why the
 * sawtooth teeth get wider and shallower.
 */
export function recallCurve(intervalDays: number): RecallCurve {
  const chain = [Math.max(1, Math.round(intervalDays))];
  while (chain[0] > 1.6 && chain.length < 5) chain.unshift(Math.max(1, Math.round(chain[0] / 2.3)));
  const next = Math.round(chain[chain.length - 1] * 2.2);
  const spans = chain.concat([next]);
  const total = spans.reduce((a, b) => a + b, 0);

  const X = (t: number) => Math.pow(t / total, 0.62) * RECALL_W;
  const Y = (r: number) => Y_TOP + ((1 - Math.max(FLOOR, Math.min(1, r))) / (1 - FLOOR)) * (Y_BASE - Y_TOP);

  let t = 0;
  const solid: string[] = [];
  const dashed: string[] = [];
  const dots: { x: number; y: number }[] = [];
  const areaPts: string[] = [];

  spans.forEach((span, k) => {
    const S = span * (0.8 + 0.55 * k);
    const pts: string[] = [];
    for (let s = 0; s <= 24; s++) {
      const dt = (span * s) / 24;
      pts.push(`${X(t + dt).toFixed(1)},${Y(Math.exp(-dt / S)).toFixed(1)}`);
    }
    const seg = (k === 0 ? 'M' : 'L') + pts.join(' L');
    if (k < spans.length - 1) {
      solid.push(seg);
      areaPts.push(...pts);
      dots.push({ x: Number(X(t).toFixed(1)), y: Number(Y(1).toFixed(1)) });
    } else {
      const from = Y(Math.exp(-1 / (0.8 + 0.55 * (k - 1)))).toFixed(1);
      dashed.push(`M${X(t).toFixed(1)},${from} L${pts.join(' L')}`);
    }
    t += span;
  });

  const nowX = Number(X(t - next).toFixed(1));
  const drop = (k: number) => Math.round((1 - Math.exp(-1 / (0.8 + 0.55 * k))) * 100);

  return {
    path: solid.join(' '),
    future: dashed.join(' '),
    area: `M0,${Y_BASE} L${areaPts.join(' L')} L${nowX},${Y_BASE} Z`,
    dots,
    baseline: Y_BASE,
    nowX,
    nowY: Number(Y(1).toFixed(1)),
    chainLabel: `${chain.join(' → ')} → ${next} days`,
    dropLabel: `${drop(spans.length - 1)}% forgotten by the next one — it was ${drop(0)}% after the first`,
  };
}

export const ONBOARD_W = 300;
export const ONBOARD_H = 120;

/** Ebbinghaus: recall falling away from a single study session. */
export function decayPath(stability: number, span: number, area: boolean): string {
  const pts: string[] = [];
  for (let i = 0; i <= 30; i++) {
    const d = (i / 30) * span;
    const y = 6 + (1 - Math.exp(-d / stability)) * 108;
    pts.push(`${i * 10} ${y.toFixed(1)}`);
  }
  const line = `M${pts.join(' L')}`;
  return area ? `${line} L300 120 L0 120 Z` : line;
}

/** The same month, with three well-timed reviews in it. */
export function sawtoothPath(area: boolean): string {
  const reviews = [0, 3, 7, 16];
  const S = [1.6, 6, 30, 148];
  const pts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const d = (i / 60) * 30;
    let k = 0;
    for (let j = 0; j < reviews.length; j++) if (d >= reviews[j]) k = j;
    const y = 6 + (1 - Math.exp(-(d - reviews[k]) / S[k])) * 108;
    pts.push(`${i * 5} ${Math.min(114, y).toFixed(1)}`);
  }
  const line = `M${pts.join(' L')}`;
  return area ? `${line} L300 120 L0 120 Z` : line;
}

export function sawtoothMarks(): { x: number; y: number }[] {
  return [3, 7, 16].map((d) => ({ x: (d / 30) * 300, y: 6 }));
}

/** Bar heights for the genre explainer — log-scaled so 339 days still fits. */
export function curveBars(days: number[], height = 20, base = 6): number[] {
  return days.map((d) => Math.round(base + (Math.log(d) / Math.log(339)) * height));
}
