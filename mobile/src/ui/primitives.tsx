import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/theme';
import { HIT_SLOP, motion, NATIVE_DRIVER, radius, TOUCH, type, UI_FONT } from '../theme/tokens';

/* -------------------------------------------------------------------- text */

type TxtProps = TextProps & {
  v?: keyof typeof type;
  c?: string;
  children?: React.ReactNode;
};

/** All type comes off the scale; `c` is the only per-call colour decision. */
export function Txt({ v = 'body', c, style, children, ...rest }: TxtProps) {
  const t = useTheme();
  return (
    <Text {...rest} style={[{ fontFamily: UI_FONT }, type[v] as TextStyle, { color: c ?? t.c.tx }, style]}>
      {children}
    </Text>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Txt v="label" c={t.c.fnt} style={style}>
      {children}
    </Txt>
  );
}

/* ------------------------------------------------------------------- press */

type PressProps = PressableProps & {
  /** How far the press scales down. 0.97 for buttons, 0.94 for round ones. */
  scale?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const NO_OUTLINE = { outlineStyle: 'none' } as unknown as TextStyle;

/**
 * Every tappable thing in the app dips by the same amount for the same time.
 * The transform sits on the pressable itself so callers can lay it out — a
 * wrapper would swallow `flex: 1`.
 */
export function Press({ scale = 0.97, style, children, ...rest }: PressProps) {
  const t = useTheme();
  const v = useRef(new Animated.Value(1)).current;

  const to = (value: number) =>
    Animated.timing(v, {
      toValue: value,
      duration: t.reduceMotion ? 0 : motion.press,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: NATIVE_DRIVER,
    }).start();

  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={HIT_SLOP}
      onPressIn={() => to(scale)}
      onPressOut={() => to(1)}
      {...rest}
      style={[style, { transform: [{ scale: v }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/* --------------------------------------------------------------- animation */

/**
 * Disclosures drop in from above. Screens and lists do not animate on entry —
 * content that is already loaded should simply be there.
 */
function Enter({
  children,
  delay = 0,
  from = 10,
  duration = motion.rise,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const v = useRef(new Animated.Value(t.reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (t.reduceMotion) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [delay, duration, t.reduceMotion, v]);

  return (
    <Animated.View
      style={[
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Disclose({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Enter from={-6} duration={motion.disclose} style={style}>
      {children}
    </Enter>
  );
}

/* ------------------------------------------------------------------- shell */

export function Card({
  children,
  style,
  padding = 18,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
}) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.c.surf, borderRadius: radius.card, padding }, t.shadow, style]}>
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.c.line }, style]} />;
}

export function Row({
  children,
  gap = 8,
  style,
  align = 'center',
}: {
  children: React.ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />;
}

/* ------------------------------------------------------------------ badges */

export function Badge({ text, fg, bg }: { text: string; fg?: string; bg?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.badge, backgroundColor: bg ?? t.c.sunk }}>
      <Txt v="badge" c={fg ?? t.c.fnt}>
        {text}
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------- chips */

export function Chip({
  label,
  selected,
  onPress,
  hue,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  hue?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityState={{ selected: !!selected }}
      style={[
        {
          minHeight: 36,
          paddingHorizontal: 12,
          borderRadius: radius.chip,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
          backgroundColor: selected ? t.c.accT : t.c.sunk,
          borderWidth: 1.5,
          borderColor: selected ? t.c.acc : 'transparent',
        },
        style,
      ]}
    >
      {hue ? <Dot color={hue} size={7} /> : null}
      <Txt v="secondary" c={selected ? t.c.acc : t.c.mut} style={{ fontWeight: '500' }}>
        {label}
      </Txt>
    </Press>
  );
}

/* -------------------------------------------------------------- segmented */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  height = 38,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  height?: number;
}) {
  const t = useTheme();

  /*
    The selected segment has to sit *above* its track, and in a dark palette
    "above" means lighter. Using surf-on-sunk for both themes inverts that:
    light lifts 228 → 251, dark drops 42 → 30, so the chosen option reads as a
    hole punched in the track and the ones you did not choose look active.
    Going a step down for the track instead keeps the same 22-point lift in
    both, with each token still doing its own job — a recess and a surface.
  */
  const track = t.dark ? t.c.bg : t.c.sunk;
  const raised = t.dark ? t.c.sunk : t.c.surf;

  return (
    <View style={{ flexDirection: 'row', gap: 3, backgroundColor: track, borderRadius: radius.input, padding: 3 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            scale={0.98}
            onPress={() => onChange(o.key)}
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              minHeight: height,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? raised : 'transparent',
            }}
          >
            <Txt v="secondary" c={on ? t.c.tx : t.c.fnt} style={{ fontWeight: '600' }} numberOfLines={1}>
              {o.label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/* ----------------------------------------------------------------- buttons */

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone,
  style,
  icon,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * `done` is the confirmed state a form settles into after it commits.
   * `danger` is for an action that destroys something and cannot be undone —
   * it reads as a button rather than a link so it can be the primary action on
   * a confirmation, while never being mistaken for the accent one.
   */
  tone?: 'accent' | 'dark' | 'surface' | 'done' | 'danger';
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
}) {
  const t = useTheme();
  const look = {
    accent: { bg: t.c.acc, fg: t.c.accFg, border: 'transparent' },
    dark: { bg: t.c.tx, fg: t.c.bg, border: 'transparent' },
    surface: { bg: t.c.surf, fg: t.c.tx, border: t.c.line },
    done: { bg: t.c.grnT, fg: t.c.grn, border: 'transparent' },
    danger: { bg: t.c.redT, fg: t.c.red, border: t.c.red },
  }[tone ?? 'accent'];

  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        {
          minHeight: 50,
          borderRadius: radius.button,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          paddingHorizontal: 16,
          backgroundColor: look.bg,
          borderWidth: look.border === 'transparent' ? 0 : 1,
          borderColor: look.border,
          opacity: disabled ? 0.5 : 1,
        },
        tone === 'accent' && !disabled ? t.glow : null,
        style,
      ]}
    >
      {icon}
      <Txt v="body" c={look.fg} style={{ fontWeight: '500' }}>
        {label}
      </Txt>
    </Press>
  );
}

export function TextButton({
  label,
  onPress,
  color,
  style,
}: {
  label: string;
  onPress?: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Press
      onPress={onPress}
      style={[{ minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Txt v="body" c={color ?? t.c.mut} style={{ fontSize: 14 }}>
        {label}
      </Txt>
    </Press>
  );
}

/* ------------------------------------------------------------------ inputs */

export function Field({
  value,
  onChangeText,
  placeholder,
  label,
  hint,
  secure,
  autoCapitalize = 'sentences',
  keyboardType,
  onSubmitEditing,
  bordered,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  onSubmitEditing?: () => void;
  /** The account screens use a bordered field on `surf`; forms use a sunk one. */
  bordered?: boolean;
}) {
  const t = useTheme();
  const [focused, setFocused] = React.useState(false);
  return (
    <View>
      {label ? (
        <Row gap={8} align="baseline" style={{ marginBottom: 7 }}>
          <Label>{label}</Label>
          <View style={{ flex: 1 }} />
          {hint ? (
            <Txt v="secondary" c={t.c.fnt}>
              {hint}
            </Txt>
          ) : null}
        </Row>
      ) : null}
      <View
        style={{
          minHeight: bordered ? 50 : 48,
          borderRadius: bordered ? 13 : radius.input,
          backgroundColor: bordered ? t.c.surf : t.c.sunk,
          borderWidth: bordered ? 1 : 0,
          // The accent focus ring is the only thing that moves on a field.
          borderColor: focused ? t.c.acc : t.c.line,
          justifyContent: 'center',
          paddingHorizontal: bordered ? 15 : 14,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.c.fnt}
          secureTextEntry={secure}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label ?? placeholder}
          // The field draws its own focus ring; the browser's would sit on top of it.
          style={[{ fontSize: 16, color: t.c.tx, paddingVertical: 12 }, NO_OUTLINE]}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ toggle */

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: value ? 1 : 0,
      duration: t.reduceMotion ? 0 : motion.press,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [t.reduceMotion, v, value]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={HIT_SLOP}
      style={{
        width: 44,
        height: 26,
        borderRadius: radius.pill,
        padding: 2,
        backgroundColor: value ? t.c.acc : t.c.sunk,
      }}
    >
      <Animated.View
        style={{
          width: 22,
          height: 22,
          borderRadius: radius.pill,
          backgroundColor: '#fff',
          transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }],
        }}
      />
    </Pressable>
  );
}

/* -------------------------------------------------------------------- pips */

export function Pips({ pips, color }: { pips: { filled: boolean; width: number }[]; color: string }) {
  const t = useTheme();
  return (
    <Row gap={3}>
      {pips.map((p, i) => (
        <View
          key={i}
          style={{
            width: p.width,
            height: 5,
            borderRadius: radius.pill,
            backgroundColor: p.filled ? color : t.c.sunk,
          }}
        />
      ))}
    </Row>
  );
}

/* ------------------------------------------------------------ capacity bar */

/**
 * Sweeps on mount and animates whenever the day's load changes. Driven by
 * scaleX rather than width so it runs on the UI thread — a width animation
 * needs the JS thread, which is the one thing busy while the app is opening.
 */
export function CapacityBar({ ratio }: { ratio: number }) {
  const t = useTheme();
  const target = Math.max(0, Math.min(1, ratio));
  const v = useRef(new Animated.Value(t.reduceMotion ? target : 0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: target,
      duration: t.reduceMotion ? 0 : motion.rise,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [t.reduceMotion, target, v]);

  return (
    <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: t.c.sunk, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height: '100%',
          width: '100%',
          borderRadius: radius.pill,
          backgroundColor: t.c.acc,
          transformOrigin: 'left',
          transform: [{ scaleX: v }],
        }}
      />
    </View>
  );
}
