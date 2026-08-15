import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import {
  decayPath,
  ONBOARD_H,
  ONBOARD_W,
  RECALL_H,
  RECALL_W,
  recallCurve,
  sawtoothMarks,
  sawtoothPath,
} from '../engine/recall';
import { useTheme } from '../theme/theme';

let gradSeq = 0;

/**
 * The sawtooth on an open card: what recall has actually done since the first
 * pass, with the next gap dashed because it has not happened yet.
 */
export function RecallChart({ intervalDays, color }: { intervalDays: number; color: string }) {
  const t = useTheme();
  const curve = useMemo(() => recallCurve(intervalDays), [intervalDays]);
  const gradId = useMemo(() => `recall-${++gradSeq}`, []);

  return (
    <View style={{ width: '100%', aspectRatio: RECALL_W / RECALL_H }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${RECALL_W} ${RECALL_H}`}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.26} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={`M0 ${curve.baseline} H${RECALL_W}`} stroke={t.c.line} strokeWidth={1} />
        <Path d={curve.area} fill={`url(#${gradId})`} />
        <Path d={curve.path} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        <Path
          d={curve.future}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeDasharray="2.5 3.5"
          strokeOpacity={0.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {curve.dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={1.7} fill={color} fillOpacity={0.4} />
        ))}
        <Circle cx={curve.nowX} cy={curve.nowY} r={5} fill={color} fillOpacity={0.18} />
        <Circle cx={curve.nowX} cy={curve.nowY} r={2.4} fill={color} />
      </Svg>
    </View>
  );
}

export function useRecall(intervalDays: number) {
  return useMemo(() => recallCurve(intervalDays), [intervalDays]);
}

/** Ebbinghaus, step one of onboarding: everything you learn starts leaking. */
export function DecayChart({ stability, span, color }: { stability: number; span: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ width: '100%', height: 120 }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${ONBOARD_W} ${ONBOARD_H}`} preserveAspectRatio="none">
        <Path d={decayPath(stability, span, true)} fill={color} opacity={0.09} />
        <Path d="M0 6 H300" stroke={t.c.line} strokeWidth={1} strokeDasharray="3 4" />
        <Path d={decayPath(stability, span, false)} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** The same month with three well-timed reviews in it. */
export function SpacedChart({ color }: { color: string }) {
  const t = useTheme();
  return (
    <View style={{ width: '100%', height: 120 }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${ONBOARD_W} ${ONBOARD_H}`} preserveAspectRatio="none">
        <Path d="M0 6 H300" stroke={t.c.line} strokeWidth={1} strokeDasharray="3 4" />
        <Path d={sawtoothPath(true)} fill={color} opacity={0.1} />
        <Path
          d={sawtoothPath(false)}
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {sawtoothMarks().map((m, i) => (
          <Circle key={i} cx={m.x} cy={m.y} r={3.5} fill={t.c.surf} stroke={color} strokeWidth={2.2} />
        ))}
      </Svg>
    </View>
  );
}

/** Bar heights for a genre's curve — the shape of the gaps, not their values. */
export function CurveBars({ heights, color }: { heights: number[]; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26 }}>
      {heights.map((h, i) => (
        <View key={i} style={{ flex: 1, height: h, borderRadius: 3, backgroundColor: color }} />
      ))}
    </View>
  );
}
