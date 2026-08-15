import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/theme';
import { motion } from '../theme/tokens';

/**
 * The prototype's icons, as paths. All of them are 1.6–1.9 stroke with rounded
 * caps and joins — a set with a different weight would read as a different app.
 */

type IconProps = { size?: number; color: string };

export function ChevronDown({ size = 13, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path d="M3 4.5L6 8l3-3.5" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

/** The chevron is the only thing that rotates when a disclosure opens. */
export function Chevron({ open, size = 13, color }: IconProps & { open: boolean }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: open ? 1 : 0,
      duration: t.reduceMotion ? 0 : motion.chevron,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start();
  }, [open, t.reduceMotion, v]);

  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <ChevronDown size={size} color={color} />
    </Animated.View>
  );
}

export function Back({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M12 4.5L6.5 10l5.5 5.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Forward({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M7.5 4.5L13 10l-5.5 5.5" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function SettingsGlyph({ size = 19, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={2.6} stroke={color} strokeWidth={1.6} />
      <Circle cx={10} cy={10} r={6.4} stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export function Plus({ size = 23, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 4.6v10.8M4.6 10h10.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

export function TodayGlyph({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7.2} stroke={color} strokeWidth={1.6} />
      <Circle cx={10} cy={10} r={3} fill={color} />
    </Svg>
  );
}

export function UpcomingGlyph({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={3} y={4.6} width={14} height={12} rx={3} stroke={color} strokeWidth={1.6} />
      <Path d="M3 8.4h14M7 3v3M13 3v3" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

export function SkillsGlyph({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M4.5 15V9M10 15V5M15.5 15v-4" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

export function Check({ size = 14, color, weight = 2.6 }: IconProps & { weight?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Pencil({ size = 15, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M13.2 3.6l3.2 3.2L7.6 15.6 4 16.6l1-3.6z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function Archive({ size = 15, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M3.5 5.5h13M5 5.5v9.5a1 1 0 001 1h8a1 1 0 001-1V5.5M8 9h4"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AppleMark({ size = 17, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        fill={color}
        d="M13.6 10.6c0-2 1.6-2.9 1.7-3-.9-1.4-2.4-1.5-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.2 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.5 2 1-.1 1.4-.6 2.6-.6s1.5.6 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.2-.8-2.2-3.1zM11.7 4.7c.5-.7.9-1.6.8-2.6-.8 0-1.8.5-2.4 1.2-.5.6-.9 1.6-.8 2.5.9.1 1.8-.4 2.4-1.1z"
      />
    </Svg>
  );
}

/** Google's mark keeps its own colours in both themes — it is their asset. */
export function GoogleMark({ size = 17 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path fill="#4285F4" d="M19.6 10.2c0-.7-.1-1.4-.2-2H10v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" />
      <Path fill="#34A853" d="M10 20c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H1.1v2.6A10 10 0 0 0 10 20z" />
      <Path fill="#FBBC05" d="M4.4 11.9a6 6 0 0 1 0-3.8V5.5H1.1a10 10 0 0 0 0 9z" />
      <Path fill="#EA4335" d="M10 4c1.5 0 2.8.5 3.8 1.5l2.8-2.8C15 1.2 12.7 0 10 0A10 10 0 0 0 1.1 5.5l3.3 2.6C5.2 5.7 7.4 4 10 4z" />
    </Svg>
  );
}
