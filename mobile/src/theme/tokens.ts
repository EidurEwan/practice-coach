import { Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * The design tokens from the handoff. Colours, radii, spacing and the type
 * scale are final — nothing here should be invented at the call site.
 */

export type Palette = {
  bg: string;
  surf: string;
  sunk: string;
  line: string;
  tx: string;
  mut: string;
  fnt: string;
  acc: string;
  accT: string;
  accFg: string;
  red: string;
  redT: string;
  amb: string;
  ambT: string;
  grn: string;
  grnT: string;
};

export const LIGHT: Palette = {
  bg: '#edecea',
  surf: '#fbfbf9',
  sunk: '#e4e3df',
  line: '#dbdad5',
  tx: '#1c1c1e',
  mut: '#55555f',
  fnt: '#6c6b74',
  acc: '#3b62d9',
  accT: '#e6ebff',
  accFg: '#ffffff',
  red: '#b23a32',
  redT: '#fdecea',
  amb: '#8a5c07',
  ambT: '#fdf2dd',
  grn: '#3f6d60',
  grnT: '#e6f2ee',
};

export const DARK: Palette = {
  bg: '#141417',
  surf: '#1e1e23',
  sunk: '#2a2a31',
  line: '#32323a',
  tx: '#f2f1ef',
  mut: '#b3b1b8',
  fnt: '#8e8c95',
  acc: '#8fa4ff',
  accT: '#242c4a',
  accFg: '#141417',
  red: '#ef8b83',
  redT: '#3a2321',
  amb: '#e0ac3c',
  ambT: '#392e14',
  grn: '#6fbfa8',
  grnT: '#183029',
};

/** Indexed by skill, cycling. One hue per skill, everywhere it appears. */
export const HUES_LIGHT = ['#3b62d9', '#2b8577', '#c2621f', '#7a4bbd', '#5d7c1f', '#b03a6e'];
export const HUES_DARK = ['#8fa4ff', '#4fd1c5', '#f0955f', '#c79bf0', '#a8c95f', '#f08bb0'];

export const radius = {
  card: 18,
  sheet: 24,
  button: 14,
  input: 12,
  chip: 9,
  badge: 5,
  pill: 999,
} as const;

/** 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 26. Screen gutter 20. */
export const space = {
  gutter: 20,
  /** The floating tab bar overlaps the scroll view by this much. */
  scrollBottom: 128,
} as const;

export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
/** Minimum touch target, everywhere. */
export const TOUCH = 44;

/**
 * React Native cannot stack two shadows on one view, so each of the handoff's
 * two-layer shadows collapses to its dominant (outer) layer, with an Android
 * elevation chosen to read at the same weight.
 */
export function cardShadow(dark: boolean): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: dark
      ? { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 12 }
      : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 6 },
    android: { elevation: dark ? 6 : 2 },
    default: {
      boxShadow: dark
        ? '0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px rgb(0 0 0 / 0.34)'
        : '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.05)',
    } as ViewStyle,
  })!;
}

export function accentGlow(dark: boolean, accent: string): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: { shadowColor: accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: dark ? 0.24 : 0.28, shadowRadius: dark ? 8 : 7 },
    android: { elevation: 6 },
    default: {
      boxShadow: dark
        ? `0 4px 16px ${accent}3d`
        : `0 4px 14px ${accent}47`,
    } as ViewStyle,
  })!;
}

export function tabBarShadow(dark: boolean): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: dark ? 0.4 : 0.09,
      shadowRadius: 14,
    },
    android: { elevation: 10 },
    default: {
      boxShadow: dark
        ? '0 2px 4px rgb(0 0 0 / 0.3), 0 12px 28px rgb(0 0 0 / 0.5)'
        : '0 2px 4px rgb(0 0 0 / 0.05), 0 12px 28px rgb(0 0 0 / 0.09)',
    } as ViewStyle,
  })!;
}

export function sheetShadow(): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.22, shadowRadius: 16 },
    android: { elevation: 24 },
    default: { boxShadow: '0 -8px 32px rgb(0 0 0 / 0.22)' } as ViewStyle,
  })!;
}

/** The wordmark face. Only ever "Interval" — everything else is system sans. */
export const WORDMARK = 'Unbounded-Bold';

/**
 * The body/UI stack. Deliberately the system face everywhere: iOS resolves
 * this to SF Pro and Android to Roboto without being told, so only the web
 * needs it spelling out — react-native-web would otherwise fall back to a
 * generic sans rather than Segoe UI.
 */
export const UI_FONT = Platform.select({
  web: '"Segoe UI Variable Text", "Segoe UI", -apple-system, system-ui, sans-serif',
  default: undefined,
});

const tnum: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  screenTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.59 } as TextStyle,
  gateTitle: { fontSize: 32, fontWeight: '700', letterSpacing: -0.77 } as TextStyle,
  sheetTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.34 } as TextStyle,
  bigNumeral: { fontSize: 44, fontWeight: '700', letterSpacing: -1.32, ...tnum } as TextStyle,
  clearedTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 } as TextStyle,
  cardTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.18 } as TextStyle,
  rowTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.17 } as TextStyle,
  body: { fontSize: 15, fontWeight: '400' } as TextStyle,
  secondary: { fontSize: 13, fontWeight: '400' } as TextStyle,
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.24, textTransform: 'uppercase' } as TextStyle,
  badge: { fontSize: 11, fontWeight: '600' } as TextStyle,
  tab: { fontSize: 11, fontWeight: '600' } as TextStyle,
  wordmark: { fontFamily: WORDMARK, fontSize: 15, letterSpacing: -0.15 } as TextStyle,
  num: tnum,
};

/**
 * Whether an animation can be handed to the native driver.
 *
 * There is no native animated module on the web, so asking for one there warns
 * once per animation and then falls back to JS anyway. The fallback is what we
 * want; the warning is noise that buries real ones in the console.
 */
export const NATIVE_DRIVER = Platform.OS !== 'web';

/** Motion, in ms. `Respect prefers-reduced-motion` is handled by the caller. */
export const motion = {
  rise: 440,
  disclose: 240,
  sheetIn: 300,
  sheetOut: 240,
  chevron: 200,
  pill: 260,
  press: 130,
} as const;
