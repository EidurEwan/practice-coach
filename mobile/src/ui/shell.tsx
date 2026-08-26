import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Route, TABS, useNav } from '../nav/router';
import { useTheme } from '../theme/theme';
import { motion, NATIVE_DRIVER, radius, space, TOUCH, type } from '../theme/tokens';
import { Back, Plus, SettingsGlyph, SkillsGlyph, TodayGlyph, UpcomingGlyph } from './icons';
import { Press, Txt } from './primitives';

const LOGO = require('../../assets/IntervalLogo.png');

/* ------------------------------------------------------------------ header */

/** Three circles growing left to right — the widening interval, as a mark. */
export function Logo({ size = 26 }: { size?: number }) {
  return <Image source={LOGO} style={{ width: size * 2.7, height: size * 2.7 }} resizeMode="contain" />;
}

export function Header({ onSettings }: { onSettings: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: space.gutter,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/*
        The mark is a square icon cropped to its middle band. The image is taken
        out of flow so the row measures 64×26 whatever the image does — in flow,
        Android sizes the row to the full 70px image and clips it to nothing.
      */}
      <View style={{ width: 64, height: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Image
          source={LOGO}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{ position: 'absolute', width: 70, height: 70 }}
          resizeMode="contain"
        />
      </View>
      <Txt style={[type.wordmark, { color: t.c.mut }]}>Interval</Txt>
      <View style={{ flex: 1 }} />
      <Press
        onPress={onSettings}
        accessibilityLabel="Settings"
        style={{ width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}
      >
        <SettingsGlyph color={t.c.fnt} />
      </Press>
    </View>
  );
}

/* ------------------------------------------------------------------ screen */

/**
 * Every scrolling screen. The bottom padding is what keeps the last card clear
 * of the floating tab bar.
 */
export function Screen({
  children,
  scroll = true,
  style,
  bottomPadding = space.scrollBottom,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  bottomPadding?: number;
}) {
  const insets = useSafeAreaInsets();
  const padding = { paddingHorizontal: space.gutter, paddingBottom: bottomPadding + insets.bottom };

  if (!scroll) return <View style={[{ flex: 1 }, padding, style]}>{children}</View>;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[padding, style]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/**
 * The ambient wash: one accent gradient pinned above the top-left corner.
 *
 * `radial-gradient(60% 36% at 8% -4%, accent, transparent 70%)`. Three things
 * keep it from banding into a visible circle, and it needs all three:
 *
 *  - The centre sits off-canvas at -4%, so only the outer falloff is ever on
 *    screen. The bright core, which is where a radial reads as a disc, is
 *    cropped away.
 *  - It is elliptical rather than circular — 60% wide by 36% tall — so the
 *    falloff stretches sideways and never traces a recognisable arc.
 *  - The opacity is very low, 0.10 dark and 0.05 light. At that alpha the step
 *    between adjacent bands is under one 8-bit level, so there is nothing for
 *    the eye to catch. `transparent 70%` finishes the fade well inside the
 *    layer instead of letting the layer edge clip it.
 *
 * It gets its own absolutely-positioned, non-interactive layer above the
 * background and below content, so it tints the whole screen evenly rather
 * than being composited per card.
 */
export function Wash() {
  const t = useTheme();
  const id = t.dark ? 'wash-dark' : 'wash-light';

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="8%" cy="-4%" rx="60%" ry="36%">
            <Stop offset="0" stopColor={t.c.acc} stopOpacity={t.dark ? 0.1 : 0.05} />
            <Stop offset="0.7" stopColor={t.c.acc} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/* ----------------------------------------------------------------- tab bar */

const TAB_META = [
  { key: 'today' as const, label: 'Today', Icon: TodayGlyph },
  { key: 'upcoming' as const, label: 'Upcoming', Icon: UpcomingGlyph },
  { key: 'skills' as const, label: 'Skills', Icon: SkillsGlyph },
];

export function TabBar({ dueCount }: { dueCount: number }) {
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const index = Math.max(0, TABS.indexOf(nav.route.name));
  const slide = useRef(new Animated.Value(index)).current;
  const [barWidth, setBarWidth] = React.useState(0);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: index,
      duration: t.reduceMotion ? 0 : motion.pill,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [index, slide, t.reduceMotion]);

  const cell = barWidth ? (barWidth - 12) / 3 : 0;

  return (
    <View
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 26 + insets.bottom,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={[
          {
            flex: 1,
            height: 60,
            borderRadius: radius.pill,
            backgroundColor: t.c.surf,
            borderWidth: 1,
            borderColor: t.c.line,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
          },
          t.tabShadow,
        ]}
      >
        <Animated.View
          style={{
            position: 'absolute',
            top: 6,
            bottom: 6,
            left: 6,
            width: cell,
            borderRadius: radius.pill,
            backgroundColor: t.c.accT,
            transform: [{ translateX: Animated.multiply(slide, cell) }],
          }}
        />
        {TAB_META.map(({ key, label, Icon }) => {
          const on = nav.route.name === key;
          const color = on ? t.c.acc : t.c.fnt;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label}
              onPress={() => nav.go({ name: key } as Route)}
              style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 }}
            >
              <View>
                <Icon color={color} />
                {key === 'today' && dueCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      borderRadius: radius.pill,
                      backgroundColor: t.c.acc,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Txt v="badge" c={t.c.accFg} style={{ fontSize: 10 }} maxFontSizeMultiplier={1.3}>
                      {dueCount}
                    </Txt>
                  </View>
                ) : null}
              </View>
              {/*
                The bar is a fixed 60px by design, so its label cannot grow
                without being clipped. Capping the multiplier lets it follow
                the reader's text size as far as the geometry allows, and stop
                there — content elsewhere still scales all the way.
              */}
              <Txt v="tab" c={color} maxFontSizeMultiplier={1.3}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      {/* Logging is the primary action, so it gets a button rather than a tab. */}
      <Press
        scale={0.94}
        onPress={() => nav.go({ name: 'log' })}
        accessibilityLabel="Log what you studied"
        style={[
          {
            width: 60,
            height: 60,
            borderRadius: radius.pill,
            backgroundColor: t.c.acc,
            alignItems: 'center',
            justifyContent: 'center',
          },
          t.glow,
        ]}
      >
        <Plus color={t.c.accFg} />
      </Press>
    </View>
  );
}

/* ------------------------------------------------------------------- toast */

export function UndoToast({ text, onUndo }: { text: string; onUndo: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: t.reduceMotion ? 0 : motion.disclose,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [t.reduceMotion, v]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 96 + insets.bottom,
        borderRadius: radius.button,
        paddingHorizontal: 16,
        paddingVertical: 13,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: t.c.tx,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
      }}
    >
      <Txt v="secondary" c={t.c.bg} style={{ flex: 1 }}>
        {text}
      </Txt>
      <Pressable onPress={onUndo} accessibilityRole="button" hitSlop={12}>
        <Txt v="secondary" c={t.dark ? t.c.acc : '#7d9bff'} style={{ fontWeight: '600' }}>
          Undo
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------- sheet */

export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = React.useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(v, {
        toValue: 1,
        duration: t.reduceMotion ? 0 : motion.sheetIn,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: NATIVE_DRIVER,
      }).start();
    } else if (mounted) {
      Animated.timing(v, {
        toValue: 0,
        duration: t.reduceMotion ? 0 : motion.sheetOut,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: NATIVE_DRIVER,
      }).start(({ finished }) => finished && setMounted(false));
    }
  }, [mounted, open, t.reduceMotion, v]);

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', opacity: v }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: height * 0.82,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            backgroundColor: t.c.surf,
            paddingHorizontal: space.gutter,
            paddingTop: 10,
            paddingBottom: 34 + insets.bottom,
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
          },
          t.sheetShadow,
        ]}
      >
        <View style={{ width: 38, height: 4, borderRadius: radius.pill, backgroundColor: t.c.line, alignSelf: 'center', marginBottom: 16 }} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/* ---------------------------------------------------------- back-and-title */

export function TitleBar({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 12 }}>
      {onBack ? (
        <Press
          onPress={onBack}
          accessibilityLabel="Back"
          style={{
            width: 36,
            height: 36,
            marginLeft: -8,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Back color={t.c.mut} />
        </Press>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt v="screenTitle">{title}</Txt>
        {subtitle ? (
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export const MIN_TOUCH = TOUCH;
