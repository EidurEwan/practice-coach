import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, Day, parseDay, toDay } from '../engine/dates';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { Back, Forward } from './icons';
import { Press, Row, Txt } from './primitives';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HEAD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * A month grid, the same on every platform. The system date picker is native
 * on iOS and Android and absent from the web build, and a target date is too
 * central to the schedule to be settable on only some of them.
 */
export function DayPicker({ value, onChange, min }: { value: Day | null; onChange: (d: Day) => void; min?: Day }) {
  const t = useTheme();
  const start = parseDay(value ?? min ?? toDay(new Date()));
  const [cursor, setCursor] = useState({ y: start.getFullYear(), m: start.getMonth() });

  const first = toDay(new Date(cursor.y, cursor.m, 1, 12));
  const lead = (parseDay(first).getDay() + 6) % 7;
  const length = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (Day | null)[] = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);

  const step = (n: number) => setCursor(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  return (
    <View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Press onPress={() => step(-1)} accessibilityLabel="Previous month" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Back color={t.c.mut} />
        </Press>
        <Txt v="rowTitle">{`${MONTHS[cursor.m]} ${cursor.y}`}</Txt>
        <Press onPress={() => step(1)} accessibilityLabel="Next month" style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Forward color={t.c.mut} />
        </Press>
      </Row>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {HEAD.map((h, i) => (
          <Txt key={i} v="badge" c={t.c.fnt} style={{ flex: 1, textAlign: 'center' }}>
            {h}
          </Txt>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row', marginTop: 4 }}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={{ flex: 1, height: 38 }} />;
            const on = d === value;
            const disabled = !!min && d < min;
            return (
              <Pressable
                key={d}
                disabled={disabled}
                onPress={() => onChange(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled }}
                accessibilityLabel={d}
                style={{ flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? t.c.acc : 'transparent',
                  }}
                >
                  <Txt c={on ? t.c.accFg : disabled ? t.c.line : t.c.tx} style={{ fontSize: 14, fontWeight: on ? '700' : '400' }}>
                    {parseDay(d).getDate()}
                  </Txt>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
