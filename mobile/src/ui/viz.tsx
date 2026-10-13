import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatShort, parseDay } from '../engine/dates';
import { useTheme } from '../theme/theme';
import { vizFor } from '../theme/viz';
import { Txt } from './primitives';

/**
 * The charts on Upcoming and Progress. Built to the dataviz rules: thin marks
 * with 4px rounded data-ends, a 2px surface gap between touching fills, solid
 * hairline guides, a legend for anything with two or more series, and text
 * that never wears a data colour. On a phone there is no hover, so every
 * chart takes a tap instead — the caller shows what was tapped in a readout
 * line, and every value is also in the list beside the chart.
 */

const GAP = 2;
const END = 4;

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(e.nativeEvent.layout.width)];
}

/* ---------------------------------------------------------------- legend */

export type LegendItem = { color: string; label: string; value?: string; shape?: 'rect' | 'line' };

export function Legend({ items }: { items: LegendItem[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {it.shape === 'line' ? (
            <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: it.color }} />
          ) : (
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: it.color }} />
          )}
          <Txt v="secondary" c={t.c.mut}>
            {it.label}
          </Txt>
          {it.value ? (
            <Txt v="secondary" c={t.c.tx} style={{ fontWeight: '600' }}>
              {it.value}
            </Txt>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------ load strip */

export type StripDay = { day: string; committed: number; projected: number };

const INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Reviews per day: scheduled at the base, projected stacked above in a lighter
 * step of the same hue, and the daily capacity as a hairline across.
 */
export function LoadStrip({
  days,
  capacity,
  selected,
  onSelect,
}: {
  days: StripDay[];
  capacity: number;
  selected: number | null;
  onSelect: (i: number | null) => void;
}) {
  const t = useTheme();
  const v = vizFor(t.dark);
  const H = 84;
  const top = Math.max(capacity, ...days.map((d) => d.committed + d.projected), 1);
  const px = (n: number) => (n / top) * (H - 6);

  return (
    <View>
      <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: t.c.line }} />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: px(capacity), height: 1, backgroundColor: t.c.fnt, opacity: 0.55 }}
        />
        {days.map((d, i) => {
          const on = selected === i;
          const dim = selected !== null && !on;
          return (
            <Pressable
              key={d.day}
              onPress={() => onSelect(on ? null : i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${formatShort(d.day)}: ${d.committed} scheduled, ${d.projected} projected`}
              style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }}
            >
              <View style={{ width: '64%', maxWidth: 24, opacity: dim ? 0.4 : 1 }}>
                {d.projected ? (
                  <View
                    style={{
                      height: Math.max(2, px(d.projected) - (d.committed ? GAP : 0)),
                      marginBottom: d.committed ? GAP : 0,
                      backgroundColor: v.ramp[0],
                      borderTopLeftRadius: END,
                      borderTopRightRadius: END,
                    }}
                  />
                ) : null}
                {d.committed ? (
                  <View
                    style={{
                      height: Math.max(2, px(d.committed)),
                      backgroundColor: t.c.acc,
                      borderTopLeftRadius: d.projected ? 0 : END,
                      borderTopRightRadius: d.projected ? 0 : END,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {days.map((d, i) => {
          const date = parseDay(d.day);
          const strong = i === 0 || selected === i;
          return (
            <View key={d.day} style={{ flex: 1, alignItems: 'center' }}>
              <Txt v="badge" c={strong ? t.c.tx : t.c.fnt} maxFontSizeMultiplier={1.2}>
                {INITIAL[date.getDay()]}
              </Txt>
              <Txt v="badge" c={strong ? t.c.tx : t.c.fnt} style={{ fontWeight: '400' }} maxFontSizeMultiplier={1.2}>
                {date.getDate()}
              </Txt>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* ----------------------------------------------------------- stacked bar */

/** Part-to-whole along one bar, square at the start and rounded at the end. */
export function StackedBar({ counts, colors, height = 12 }: { counts: number[]; colors: string[]; height?: number }) {
  const t = useTheme();
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return <View style={{ height, borderRadius: END, backgroundColor: t.c.sunk }} />;
  const parts = counts.map((n, i) => ({ n, color: colors[i] })).filter((p) => p.n > 0);
  return (
    <View style={{ height, flexDirection: 'row', gap: GAP }}>
      {parts.map((p, i) => (
        <View
          key={i}
          style={{
            flex: p.n,
            backgroundColor: p.color,
            borderTopRightRadius: i === parts.length - 1 ? END : 0,
            borderBottomRightRadius: i === parts.length - 1 ? END : 0,
          }}
        />
      ))}
    </View>
  );
}

/* --------------------------------------------------------- outlook chart */

export type OutlookPoint = { label: string; keep: number; stop: number };

/**
 * Two futures on one 0–100% axis. Touch anywhere on the plot and the nearest
 * point is picked, crosshair and both values, so nobody has to land on a line.
 */
export function OutlookChart({
  points,
  selected,
  onSelect,
}: {
  points: OutlookPoint[];
  selected: number | null;
  onSelect: (i: number | null) => void;
}) {
  const t = useTheme();
  const v = vizFor(t.dark);
  const [width, onLayout] = useWidth();
  const H = 150;
  const LEFT = 42;
  const PAD = 8;
  const plotW = Math.max(0, width - LEFT - PAD);
  const n = points.length;
  const x = (i: number) => LEFT + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (r: number) => PAD + (1 - r) * (H - PAD * 2);
  const path = (key: 'keep' | 'stop') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');

  const pick = (locationX: number) => {
    if (!plotW || n < 2) return;
    const i = Math.round(((locationX - LEFT) / plotW) * (n - 1));
    onSelect(Math.max(0, Math.min(n - 1, i)));
  };

  const at = selected ?? n - 1;
  const ticks = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <View onLayout={onLayout}>
      <View style={{ height: H }}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            {[0, 0.5, 1].map((g) => (
              <Line key={g} x1={LEFT} x2={width - PAD} y1={y(g)} y2={y(g)} stroke={t.c.line} strokeWidth={1} />
            ))}
            {selected !== null ? (
              <Line x1={x(at)} x2={x(at)} y1={PAD} y2={H - PAD} stroke={t.c.fnt} strokeWidth={1} strokeOpacity={0.6} />
            ) : null}
            <Path d={path('stop')} fill="none" stroke={v.stop} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <Path d={path('keep')} fill="none" stroke={v.keep} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {(['stop', 'keep'] as const).map((k) => (
              <Circle key={k} cx={x(at)} cy={y(points[at]?.[k] ?? 0)} r={4} fill={k === 'keep' ? v.keep : v.stop} stroke={t.c.surf} strokeWidth={2} />
            ))}
          </Svg>
        ) : null}
        {[1, 0.5, 0].map((g) => (
          <Txt
            key={g}
            v="badge"
            c={t.c.fnt}
            style={{ position: 'absolute', left: 0, top: y(g) - 7, width: LEFT - 6, textAlign: 'right', fontWeight: '400' }}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {`${g * 100}%`}
          </Txt>
        ))}
        <View
          style={{ position: 'absolute', left: LEFT, right: 0, top: 0, bottom: 0 }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => pick(e.nativeEvent.locationX + LEFT)}
          onResponderMove={(e) => pick(e.nativeEvent.locationX + LEFT)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Estimated recall over time"
          accessibilityValue={{ text: points[at] ? `${points[at].label}: keep reviewing ${Math.round(points[at].keep * 100)}%, stop today ${Math.round(points[at].stop * 100)}%` : '' }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => onSelect(Math.max(0, Math.min(n - 1, at + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        />
      </View>
      <View style={{ height: 16, marginTop: 4 }}>
        {width > 0
          ? ticks.map((i) => (
              <Txt
                key={i}
                v="badge"
                c={t.c.fnt}
                style={{
                  position: 'absolute',
                  top: 0,
                  fontWeight: '400',
                  ...(i === n - 1 ? { right: PAD } : i === 0 ? { left: LEFT } : { left: x(i) - 30, width: 60, textAlign: 'center' }),
                }}
                maxFontSizeMultiplier={1.2}
              >
                {points[i]?.label}
              </Txt>
            ))
          : null}
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- heatmap */

export type HeatDay = { day: string; count: number; future: boolean };

/** Steps on the ramp: none, 1, 2–3, 4–6, 7–10, 11+. */
export function heatStep(count: number): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (count <= 3) return 1;
  if (count <= 6) return 2;
  if (count <= 10) return 3;
  return 4;
}

/** Weeks as columns, Monday at the top. */
export function Heatmap({
  days,
  selected,
  onSelect,
}: {
  days: HeatDay[];
  selected: number | null;
  onSelect: (i: number | null) => void;
}) {
  const t = useTheme();
  const v = vizFor(t.dark);
  const [width, onLayout] = useWidth();
  const weeks = Math.ceil(days.length / 7);
  const cell = width ? Math.min(20, Math.floor((width - (weeks - 1) * 3) / weeks)) : 0;

  return (
    <View onLayout={onLayout}>
      {cell > 0 ? (
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {Array.from({ length: weeks }, (_, w) => (
            <View key={w} style={{ gap: 3 }}>
              {days.slice(w * 7, w * 7 + 7).map((d, k) => {
                const i = w * 7 + k;
                const step = heatStep(d.count);
                const on = selected === i;
                return (
                  <Pressable
                    key={d.day}
                    disabled={d.future}
                    onPress={() => onSelect(on ? null : i)}
                    accessibilityLabel={`${formatShort(d.day)}: ${d.count} ${d.count === 1 ? 'session' : 'sessions'}`}
                    accessibilityState={{ selected: on }}
                    hitSlop={2}
                    style={{
                      width: cell,
                      height: cell,
                      borderRadius: 3,
                      backgroundColor: d.future ? 'transparent' : step < 0 ? t.c.sunk : v.ramp[step],
                      borderWidth: on ? 2 : 0,
                      borderColor: t.c.tx,
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
        <Txt v="badge" c={t.c.fnt} style={{ fontWeight: '400', marginRight: 2 }}>
          Less
        </Txt>
        {[t.c.sunk, ...v.ramp].map((c) => (
          <View key={c} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
        ))}
        <Txt v="badge" c={t.c.fnt} style={{ fontWeight: '400', marginLeft: 2 }}>
          More
        </Txt>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------ week bars */

/** One series of columns against a reference hairline, labelled on the one that matters. */
export function WeekBars({
  values,
  labels,
  reference,
  referenceLabel,
  selected,
  onSelect,
}: {
  values: number[];
  labels: string[];
  reference: number;
  /** Named on the line itself, so it does not read as a gridline. */
  referenceLabel?: string;
  selected: number | null;
  onSelect: (i: number | null) => void;
}) {
  const t = useTheme();
  const H = 96;
  const top = Math.max(reference, ...values, 1);
  const px = (n: number) => (n / top) * (H - 18);
  const peak = values.indexOf(Math.max(...values));
  const labelled = selected ?? peak;

  return (
    <View>
      <View style={{ height: H, flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: t.c.line }} />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: px(reference), height: 1, backgroundColor: t.c.fnt, opacity: 0.55 }}
        />
        {referenceLabel ? (
          <Txt
            v="badge"
            c={t.c.fnt}
            style={{ position: 'absolute', right: 0, bottom: px(reference) + 3, fontWeight: '400' }}
            maxFontSizeMultiplier={1.2}
          >
            {referenceLabel}
          </Txt>
        ) : null}
        {values.map((n, i) => {
          const on = selected === i;
          return (
            <Pressable
              key={i}
              onPress={() => onSelect(on ? null : i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${labels[i]}: ${n} reviews`}
              style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }}
            >
              {i === labelled && n > 0 ? (
                <Txt v="badge" c={t.c.tx} style={{ marginBottom: 3 }} maxFontSizeMultiplier={1.2}>
                  {n}
                </Txt>
              ) : null}
              <View
                style={{
                  width: '58%',
                  maxWidth: 24,
                  height: Math.max(n ? 2 : 0, px(n)),
                  backgroundColor: t.c.acc,
                  borderTopLeftRadius: END,
                  borderTopRightRadius: END,
                  opacity: selected !== null && !on ? 0.4 : 1,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {labels.map((l, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Txt v="badge" c={selected === i ? t.c.tx : t.c.fnt} style={{ fontWeight: '400' }} maxFontSizeMultiplier={1.2} numberOfLines={1}>
              {l}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}
