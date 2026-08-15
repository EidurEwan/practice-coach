import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { bandFor, pipsFor } from '../engine/bands';
import { daysBetween, formatAgendaDate, monthLabel } from '../engine/dates';
import { AgendaGroup, buildAgenda, Horizon, HORIZONS } from '../engine/plan';
import { projectedChain, projectedDates } from '../engine/schedule';
import { useStore } from '../store/store';
import { bandColor } from '../theme/colors';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { Chevron } from '../ui/icons';
import { Badge, Card, Disclose, Dot, Pips, Press, Row, Segmented, Txt } from '../ui/primitives';
import { Screen } from '../ui/shell';

type View2 = 'date' | 'topic';

export function UpcomingScreen() {
  const t = useTheme();
  const { doc, day } = useStore();
  const [view, setView] = useState<View2>('date');
  const [horizon, setHorizon] = useState<Horizon>('2w');
  const [filter, setFilter] = useState<string | null>(null);
  const [openSkill, setOpenSkill] = useState<string | null>(doc.skills[0]?.id ?? null);

  const skills = doc.skills.filter((s) => !s.archived_at);
  const agenda = useMemo(
    () => buildAgenda(doc, day, horizon, filter, projectedDates),
    [day, doc, filter, horizon],
  );

  return (
    <Screen>
      <View style={{ paddingTop: 12 }}>
        <Txt v="screenTitle">Upcoming</Txt>
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }}>
          {view === 'date'
            ? 'Committed dates, and what follows if you keep rating OK'
            : 'Everything tracked, with its projected chain'}
        </Txt>
      </View>

      <View style={{ marginTop: 16 }}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { key: 'date', label: 'By date' },
            { key: 'topic', label: 'By topic' },
          ]}
        />
      </View>

      {view === 'date' ? (
        <View style={{ marginTop: 10 }}>
          <Segmented
            value={horizon}
            onChange={setHorizon}
            height={36}
            options={HORIZONS.map((h) => ({ key: h.key, label: h.label }))}
          />
        </View>
      ) : null}

      <Row gap={7} style={{ marginTop: 14, flexWrap: 'wrap' }}>
        <FilterChip label="All" selected={filter === null} onPress={() => setFilter(null)} />
        {skills.map((s) => (
          <FilterChip
            key={s.id}
            label={s.name}
            hue={t.hue(s.hue_index)}
            selected={filter === s.id}
            onPress={() => setFilter(s.id)}
          />
        ))}
      </Row>

      {view === 'date' ? (
        <ByDate groups={agenda} horizon={horizon} day={day} />
      ) : (
        <ByTopic filter={filter} openSkill={openSkill} onToggle={(id) => setOpenSkill((p) => (p === id ? null : id))} />
      )}
    </Screen>
  );
}

function FilterChip({
  label,
  hue,
  selected,
  onPress,
}: {
  label: string;
  hue?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityState={{ selected }}
      style={{
        minHeight: 32,
        paddingHorizontal: 11,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: selected ? t.c.accT : t.c.surf,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? t.c.acc : t.c.line,
      }}
    >
      {hue ? <Dot color={hue} size={6} /> : null}
      <Txt v="label" c={selected ? t.c.acc : t.c.mut} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '500' }}>
        {label}
      </Txt>
    </Press>
  );
}

function ByDate({ groups, horizon, day }: { groups: AgendaGroup[]; horizon: Horizon; day: string }) {
  const t = useTheme();

  if (!groups.length) {
    return (
      <Card style={{ marginTop: 20 }}>
        <Txt v="rowTitle">Nothing scheduled in this window</Txt>
        <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
          Log what you have studied and it appears here with a date.
        </Txt>
      </Card>
    );
  }

  const title = (key: string) => {
    if (horizon === '2w') return formatAgendaDate(key, day);
    if (horizon === '5y') return key;
    return monthLabel(`${key}-01`);
  };

  return (
    <View style={{ marginTop: 20, gap: 12 }}>
      {groups.map((g, i) => (
        <View key={g.key}>
          <Card>
            <Row align="baseline" style={{ justifyContent: 'space-between' }}>
              <Txt v="cardTitle">{title(g.key)}</Txt>
              <Txt v="secondary" c={t.c.fnt}>
                {g.count}
              </Txt>
            </Row>
            <View style={{ marginTop: 8 }}>
              {g.rows.map((r, k) => (
                <Row
                  key={r.key}
                  gap={10}
                  style={{ paddingVertical: 10, borderTopWidth: k === 0 ? 0 : 1, borderTopColor: t.c.line }}
                >
                  <Dot color={t.hue(r.skill.hue_index)} size={7} />
                  <Txt style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                    {r.title}
                  </Txt>
                  <Badge
                    text={r.chip}
                    fg={r.overdue ? t.c.red : r.committed ? t.c.acc : t.c.fnt}
                    bg={r.overdue ? t.c.redT : r.committed ? t.c.accT : t.c.sunk}
                  />
                </Row>
              ))}
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}

function ByTopic({
  filter,
  openSkill,
  onToggle,
}: {
  filter: string | null;
  openSkill: string | null;
  onToggle: (id: string) => void;
}) {
  const t = useTheme();
  const { doc, day } = useStore();
  const skills = doc.skills.filter((s) => !s.archived_at).filter((s) => !filter || s.id === filter);

  return (
    <View style={{ marginTop: 20, gap: 12 }}>
      {skills.map((skill, i) => {
        const topics = doc.topics.filter((x) => !x.archived_at && x.skill_id === skill.id);
        const open = openSkill === skill.id;
        return (
          <View key={skill.id}>
            <View style={[{ backgroundColor: t.c.surf, borderRadius: radius.card, overflow: 'hidden' }, t.shadow]}>
              <Press
                scale={1}
                onPress={() => onToggle(skill.id)}
                accessibilityState={{ expanded: open }}
                style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <Dot color={t.hue(skill.hue_index)} />
                <Txt v="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                  {skill.name}
                </Txt>
                <Txt v="secondary" c={t.c.fnt}>
                  {topics.length ? `${topics.length} tracked` : 'No topics yet'}
                </Txt>
                <Chevron open={open} color={t.c.fnt} />
              </Press>

              {open ? (
                <Disclose style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
                  {topics.map((topic, k) => {
                    const band = bandFor(topic.interval_days);
                    const color = bandColor(band, t.c);
                    const late = daysBetween(topic.due_on, day) > 0;
                    const due = topic.due_on <= day;
                    const chain = [topic.interval_days, ...projectedChain(topic, skill.genre, 3)];
                    return (
                      <View key={topic.id} style={{ paddingVertical: 12, borderTopWidth: k === 0 ? 0 : 1, borderTopColor: t.c.line }}>
                        <Row gap={10}>
                          <Txt style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                            {topic.title}
                          </Txt>
                          <Badge
                            text={late ? 'overdue' : due ? 'due today' : 'scheduled'}
                            fg={late ? t.c.red : due ? t.c.acc : t.c.fnt}
                            bg={late ? t.c.redT : due ? t.c.accT : t.c.sunk}
                          />
                        </Row>
                        <Row gap={8} style={{ marginTop: 6 }}>
                          <Pips pips={pipsFor(band)} color={color} />
                          <Txt v="label" c={color} style={{ textTransform: 'none', letterSpacing: 0 }}>
                            {band.label}
                          </Txt>
                        </Row>
                        <Row gap={6} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                          {chain.map((d, index) => (
                            <View
                              key={index}
                              style={{
                                paddingHorizontal: 7,
                                paddingVertical: 2,
                                borderRadius: radius.badge,
                                backgroundColor: index === 0 ? t.c.accT : 'transparent',
                              }}
                            >
                              <Txt v="label" c={index === 0 ? t.c.acc : t.c.fnt} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
                                {index === 0 ? `next ${d}d` : `${d}d`}
                              </Txt>
                            </View>
                          ))}
                        </Row>
                      </View>
                    );
                  })}
                  {!topics.length ? (
                    <View style={{ paddingVertical: 14 }}>
                      <Txt v="secondary" c={t.c.fnt}>
                        No topics yet. Log one and it appears here.
                      </Txt>
                    </View>
                  ) : null}
                </Disclose>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
