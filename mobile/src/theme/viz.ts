/**
 * Chart colours. Every set here was run through the dataviz palette
 * validator against its own surface (`surf`, light and dark) — change one and
 * re-run it rather than judging by eye.
 *
 *  - `ramp`: proficiency bands, Fragile → Retained. The bands are ordered, so
 *    they take one hue stepping light to dark (ordinal checks: monotone
 *    lightness, visible steps, the faint end clears the surface at 2:1). The
 *    activity heatmap reuses it as its intensity scale.
 *  - `keep` / `stop`: the two futures on the recall chart. Categorical pair,
 *    all checks passing including colour-blind separation.
 */

export type VizPalette = {
  ramp: [string, string, string, string, string];
  keep: string;
  stop: string;
};

export const VIZ_LIGHT: VizPalette = {
  ramp: ['#94a9ee', '#6d8ae5', '#4a6edc', '#2f52c0', '#1c3585'],
  keep: '#3b62d9',
  stop: '#c2621f',
};

export const VIZ_DARK: VizPalette = {
  ramp: ['#4a5c9c', '#6074c4', '#7a90ee', '#a3b4ff', '#d2daff'],
  keep: '#6a80e0',
  stop: '#cf7c45',
};

export const vizFor = (dark: boolean): VizPalette => (dark ? VIZ_DARK : VIZ_LIGHT);
