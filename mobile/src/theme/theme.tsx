import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme, ViewStyle } from 'react-native';
import {
  accentGlow,
  cardShadow,
  DARK,
  HUES_DARK,
  HUES_LIGHT,
  LIGHT,
  Palette,
  sheetShadow,
  tabBarShadow,
} from './tokens';

export type ThemeChoice = 'system' | 'light' | 'dark';

export type Theme = {
  c: Palette;
  dark: boolean;
  hues: string[];
  /** One stable hue per skill, by creation order. */
  hue: (index: number) => string;
  shadow: ViewStyle;
  glow: ViewStyle;
  tabShadow: ViewStyle;
  sheetShadow: ViewStyle;
  /** True when the OS asks for reduced motion; all animation is skipped. */
  reduceMotion: boolean;
  choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({
  choice,
  onChoice,
  children,
}: {
  choice: ThemeChoice;
  onChoice: (c: ThemeChoice) => void;
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => alive && setReduceMotion(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const dark = choice === 'system' ? system === 'dark' : choice === 'dark';

  const value = useMemo<Theme>(() => {
    const c = dark ? DARK : LIGHT;
    const hues = dark ? HUES_DARK : HUES_LIGHT;
    return {
      c,
      dark,
      hues,
      hue: (i: number) => hues[((i % hues.length) + hues.length) % hues.length],
      shadow: cardShadow(dark),
      glow: accentGlow(dark, c.acc),
      tabShadow: tabBarShadow(dark),
      sheetShadow: sheetShadow(),
      reduceMotion,
      choice,
      setChoice: onChoice,
    };
  }, [dark, reduceMotion, choice, onChoice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside <ThemeProvider>');
  return t;
}
