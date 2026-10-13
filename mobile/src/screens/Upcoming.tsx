import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { reachesBand } from '../engine/analytics';
import { bandFor, pipsFor } from '../engine/bands';
import { addDays, daysBetween, formatAgendaDate, formatShort, formatWithYear, inWords, monthLabel, parseDay } from '../engine/dates';
import { AgendaGroup, buildAgenda, dailyLoad, Horizon, HORIZONS, Occurrence, ordinal } from '../engine/plan';
import { projectedChain, projectedDates } from '../engine/schedule';
import { Skill } from '../engine/types';
import { useStore } from '../store/store';
import { bandColor } from '../theme/colors';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { Chevron } from '../ui/icons';
import { Badge, Card, Disclose, Dot, Pips, Press, Row, Segmented, Txt } from '../ui/primitives';
import { Screen } from '../ui/shell';
import { Legend, LoadStrip } from '../ui/viz';
import { vizFor } from '../theme/viz';

type Mode = 'date' | 'topic';

/** How many rows a week card shows before it folds the rest away. */
const WEEK_ROWS = 8;

export function UpcomingScreen() {
  const t = useTheme();
  const { doc, day } = useStore();
  const [mode, setMode] = useState<Mode>('date');
  const [horizon, setHorizon] = useState<Horizon>('2w');
  const [filter, setFilter] = useState<string | null>(null);
  const [projected, setProjected] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);

  const skills = doc.skills.filter((s) => !s.archived_at);
  const load = useMemo(() => dailyLoad(doc, day, 14, filter, projectedDates), [day, doc, filter]);
  const agenda = useMemo(
    () => buildAgenda(doc, day, horizon, filter, projectedDates, projected),
    [day, doc, filter, horizon, projected],
  );

  return (
    <Screen>
      <View style={{ paddingTop: 12 }}>
        <Txt v="screenTitle">Upcoming</Txt>
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }}>
          What is coming, and how much of each day it takes
        </Txt>
      </View>

      <LoadCard days={load} capacity={doc.settings.daily_capacity} picked={picked} onPick={setPicked} />

      <View style={{ marginTop: 18 }}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { key: 'date', label: 'By date' },
            { key: 'topic', label: 'By topic' },
          ]}
        />
      </View>

      {mode === 'date' ? (
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
        <FilterChip label="All skills" selected={filter === null} onPress={() => setFilter(null)} />
        {skills.map((s) => (
          <FilterChip
            key={s.id}
            label={s.name}
            hue={t.hue(s.hue_index)}
            selected={filter === s.id}
            onPress={() => setFilter(filter === s.id ? null : s.id)}
          />
        ))}
        {mode === 'date' ? (
          <FilterChip
            label={projected ? 'Projected shown' : 'Projected hidden'}
            selected={projected}
            onPress={() => setProjected((p) => !p)}
          />
        ) : null}
      </Row>

      {mode === 'date' ? (
        <ByDate groups={agenda} horizon={horizon} day={day} capacity={doc.settings.daily_capacity} />
      ) : (
        <ByTopic filter={filter} />
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------- the strip */

function LoadCard({
  days,
  capacity,
  picked,
  onPick,
}: {
  days: { day: string; committed: number; projected: number }[];
  capacity: number;
  picked: number | null;
  onPick: (i: number | null) => void;
}) {
  const t = useTheme();
  const v = vizFor(t.dark);
  const over = days.filter((d) => d.committed > capacity);
  const busiest = days.reduce((a, b) => (b.committed + b.projected > a.committed + a.projected ? b : a), days[0]);
  const sel = picked !== null ? days[picked] : null;

  const readout = sel
    ? `${formatAgendaDate(sel.day, days[0].day)} · ${sel.committed} scheduled${sel.projected ? `, ${sel.projected} projected` : ''}${
        sel.committed > capacity ? ` — ${sel.committed - capacity} over your ${capacity}` : ''
      }`
    : over.length
      ? `${over.length} ${over.length === 1 ? 'day goes' : 'days go'} over your ${capacity} a day — first ${formatAgendaDate(over[0].day, days[0].day)}`
      : busiest && busiest.committed + busiest.projected > 0
        ? `Every day fits in your ${capacity}. Busiest: ${formatAgendaDate(busiest.day, days[0].day)}, ${busiest.committed + busiest.projected}`
        : 'Nothing due in the next two weeks';

  return (
    <Card style={{ marginTop: 16 }}>
      <Row align="baseline" style={{ justifyContent: 'space-between' }}>
        <Txt v="cardTitle">Next 14 days</Txt>
        <Txt v="secondary" c={t.c.fnt}>
          line = {capacity} a day
        </Txt>
      </Row>
      <View style={{ marginTop: 16 }}>
        <LoadStrip days={days} capacity={capacity} selected={picked} onSelect={onPick} />
      </View>
      <Txt v="secondary" c={sel ? t.c.tx : t.c.mut} style={{ marginTop: 12, lineHeight: 19 }}>
        {readout}
      </Txt>
      <View style={{ marginTop: 10 }}>
        <Legend
          items={[
            { color: t.c.acc, label: 'Scheduled' },
            { color: v.ramp[0], label: 'Projected, if you keep rating OK' },
          ]}
        />
      </View>
    </Card>
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

/* ---------------------------------------------------------------- by date */

function Empty({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  return (
    <Card style={{ marginTop: 20 }}>
      <Txt v="rowTitle">{title}</Txt>
      <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
        {body}
      </Txt>
    </Card>
  );
}

function ByDate({ groups, horizon, day, capacity }: { groups: AgendaGroup[]; horizon: Horizon; day: string; capacity: number }) {
  if (!groups.length) {
    return <Empty title="Nothing scheduled in this window" body="Log what you have studied and it appears here with a date." />;
  }

  // Overdue work gets its own card at the top, rather than hiding inside Today.
  const overdue = horizon === '2w' ? groups[0].items.filter((o) => o.overdue) : [];
  // One scale for every period, so a month with one review does not draw the
  // same bar as a month with ten.
  const top = Math.max(1, ...groups.flatMap((g) => g.bySkill.map((s) => s.total)));

  return (
    <View style={{ marginTop: 20, gap: 12 }}>
      {overdue.length ? <OverdueCard items={overdue} /> : null}
      {groups.map((g) => {
        if (horizon === '2w') {
          const items = g.items.filter((o) => !o.overdue);
          if (!items.length) return null;
          return <DayCard key={g.key} group={{ ...g, items }} day={day} capacity={capacity} />;
        }
        if (horizon === '3m') return <WeekCard key={g.key} group={g} day={day} />;
        return <PeriodCard key={g.key} group={g} top={top} title={horizon === '1y' ? monthLabel(g.key) : g.key.slice(0, 4)} />;
      })}
    </View>
  );
}

/** Items grouped under their skill, skills in the order they first appear. */
function bySkill(items: Occurrence[]): { skill: Skill; items: Occurrence[] }[] {
  const out: { skill: Skill; items: Occurrence[] }[] = [];
  for (const o of items) {
    const g = out.find((x) => x.skill.id === o.skill.id);
    if (g) g.items.push(o);
    else out.push({ skill: o.skill, items: [o] });
  }
  return out;
}

function OverdueCard({ items }: { items: Occurrence[] }) {
  const t = useTheme();
  return (
    <Card>
      <Row align="baseline" style={{ justifyContent: 'space-between' }}>
        <Txt v="cardTitle">Overdue</Txt>
        <Badge text={`${items.length} to catch up`} fg={t.c.red} bg={t.c.redT} />
      </Row>
      <Txt v="secondary" c={t.c.mut} style={{ marginTop: 4, lineHeight: 19 }}>
        Counted as today. Anything after them is projected from today too.
      </Txt>
      <View style={{ marginTop: 6 }}>
        {items.map((o, k) => (
          <ItemRow key={o.key} o={o} first={k === 0} note={o.daysLate === 1 ? '1 day late' : `${o.daysLate} days late`} noteTone="red" />
        ))}
      </View>
    </Card>
  );
}

function DayCard({ group, day, capacity }: { group: AgendaGroup; day: string; capacity: number }) {
  const t = useTheme();
  const scheduled = group.items.filter((o) => o.committed).length;
  const projected = group.items.length - scheduled;
  const away = daysBetween(day, group.key);
  return (
    <Card>
      <Row align="baseline" style={{ justifyContent: 'space-between' }}>
        <Txt v="cardTitle">
          {formatAgendaDate(group.key, day)}
          {away > 1 ? (
            <Txt v="secondary" c={t.c.fnt}>
              {`  ${inWords(away)}`}
            </Txt>
          ) : null}
        </Txt>
        <Row gap={6}>
          {scheduled > capacity ? <Badge text={`${scheduled - capacity} over`} fg={t.c.amb} bg={t.c.ambT} /> : null}
          <Txt v="secondary" c={t.c.fnt}>
            {[scheduled ? `${scheduled} scheduled` : '', projected ? `${projected} projected` : ''].filter(Boolean).join(' · ')}
          </Txt>
        </Row>
      </Row>
      <View style={{ marginTop: 6 }}>
        {bySkill(group.items).map((s) => (
          <View key={s.skill.id} style={{ marginTop: 8 }}>
            <SkillHeader skill={s.skill} />
            {s.items.map((o, k) => (
              <ItemRow key={o.key} o={o} first={k === 0} />
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

function SkillHeader({ skill }: { skill: Skill }) {
  const t = useTheme();
  return (
    <Row gap={7} style={{ marginBottom: 2 }}>
      <Dot color={t.hue(skill.hue_index)} size={7} />
      <Txt v="label" c={t.c.mut} numberOfLines={1} style={{ flex: 1 }}>
        {skill.name}
      </Txt>
    </Row>
  );
}

/**
 * One review. A scheduled one carries its proficiency; a projected one is
 * set back in muted ink and says which review in the chain it is, so the two
 * never read alike.
 */
function ItemRow({
  o,
  first,
  lead,
  note,
  noteTone,
}: {
  o: Occurrence;
  first: boolean;
  lead?: string;
  note?: string;
  noteTone?: 'red';
}) {
  const t = useTheme();
  const band = bandFor(o.topic.interval_days);
  return (
    <View
      accessible
      accessibilityLabel={`${o.topic.title}, ${o.skill.name}, ${note ?? (o.committed ? `scheduled, ${band.label}` : `projected ${ordinal(o.index + 1)} review`)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: first ? 0 : 1, borderTopColor: t.c.line }}
    >
      {lead ? (
        <Txt v="secondary" c={t.c.fnt} style={{ width: 52 }} numberOfLines={1}>
          {lead}
        </Txt>
      ) : null}
      {lead ? <Dot color={t.hue(o.skill.hue_index)} size={6} /> : null}
      <Txt style={{ flex: 1, fontSize: 14 }} c={o.committed ? t.c.tx : t.c.fnt} numberOfLines={1}>
        {o.topic.title}
      </Txt>
      {note ? (
        <Badge text={note} fg={noteTone === 'red' ? t.c.red : t.c.fnt} bg={noteTone === 'red' ? t.c.redT : t.c.sunk} />
      ) : o.committed ? (
        <Pips pips={pipsFor(band)} color={bandColor(band, t.c)} />
      ) : (
        <Txt v="badge" c={t.c.fnt} style={{ fontWeight: '500' }}>
          {`projected · ${ordinal(o.index + 1)}`}
        </Txt>
      )}
    </View>
  );
}

function WeekCard({ group, day }: { group: AgendaGroup; day: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const shown = open ? group.items : group.items.slice(0, WEEK_ROWS);
  const end = addDays(group.key, 6);
  const title = group.key <= day ? 'This week' : daysBetween(day, group.key) <= 7 ? 'Next week' : `Week of ${formatShort(group.key)}`;

  return (
    <Card>
      <Row align="baseline" style={{ justifyContent: 'space-between' }}>
        <Txt v="cardTitle">{title}</Txt>
        <Txt v="secondary" c={t.c.fnt}>
          {group.items.length} {group.items.length === 1 ? 'review' : 'reviews'}
        </Txt>
      </Row>
      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2 }}>
        {`${formatShort(group.key)} – ${formatShort(end)}`}
        {group.overCapacity ? ` · ${group.overCapacity} ${group.overCapacity === 1 ? 'day' : 'days'} over capacity` : ''}
      </Txt>
      <View style={{ marginTop: 6 }}>
        {shown.map((o, k) => (
          <ItemRow
            key={o.key}
            o={o}
            first={k === 0}
            lead={o.overdue ? 'Now' : formatShort(o.day).split(' ').slice(0, 2).join(' ')}
          />
        ))}
      </View>
      {group.items.length > WEEK_ROWS ? (
        <Press scale={1} onPress={() => setOpen((x) => !x)} style={{ paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '600' }}>
            {open ? 'Show fewer' : `Show ${group.items.length - WEEK_ROWS} more`}
          </Txt>
          <Chevron open={open} size={12} color={t.c.acc} />
        </Press>
      ) : null}
    </Card>
  );
}

/** A month or a year: too many reviews to name, so they are counted per skill. */
function PeriodCard({ group, title, top }: { group: AgendaGroup; title: string; top: number }) {
  const t = useTheme();
  return (
    <Card>
      <Row align="baseline" style={{ justifyContent: 'space-between' }}>
        <Txt v="cardTitle">{title}</Txt>
        <Txt v="secondary" c={t.c.fnt}>
          {group.items.length} {group.items.length === 1 ? 'review' : 'reviews'}
          {group.committed ? ` · ${group.committed} scheduled` : ''}
        </Txt>
      </Row>
      <View style={{ marginTop: 12, gap: 10 }}>
        {group.bySkill.map((s) => (
          <View key={s.skill.id}>
            <Row gap={8}>
              <Dot color={t.hue(s.skill.hue_index)} size={7} />
              <Txt v="secondary" c={t.c.mut} style={{ flex: 1 }} numberOfLines={1}>
                {s.skill.name}
              </Txt>
              <Txt v="secondary" c={t.c.tx} style={{ fontWeight: '600' }}>
                {s.total}
              </Txt>
            </Row>
            <View style={{ marginTop: 5, height: 6, borderRadius: 3, backgroundColor: t.c.sunk }}>
              <View
                style={{
                  width: `${(s.total / top) * 100}%`,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: t.hue(s.skill.hue_index),
                }}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* --------------------------------------------------------------- by topic */

function ByTopic({ filter }: { filter: string | null }) {
  const t = useTheme();
  const { doc, day } = useStore();
  const skills = doc.skills.filter((s) => !s.archived_at).filter((s) => !filter || s.id === filter);
  const [open, setOpen] = useState<string | null>(skills[0]?.id ?? null);

  if (!skills.length) return <Empty title="No skills yet" body="Add one in Skills, then log what you study." />;

  return (
    <View style={{ marginTop: 20, gap: 12 }}>
      {skills.map((skill) => {
        const topics = doc.topics
          .filter((x) => !x.archived_at && x.skill_id === skill.id)
          .sort((a, b) => (a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0));
        const isOpen = open === skill.id;
        const dueSoon = topics.filter((x) => daysBetween(day, x.due_on) <= 7).length;
        return (
          <View key={skill.id} style={[{ backgroundColor: t.c.surf, borderRadius: radius.card, overflow: 'hidden' }, t.shadow]}>
            <Press
              scale={1}
              onPress={() => setOpen((p) => (p === skill.id ? null : skill.id))}
              accessibilityState={{ expanded: isOpen }}
              style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Dot color={t.hue(skill.hue_index)} />
              <View style={{ flex: 1 }}>
                <Txt v="cardTitle" numberOfLines={1}>
                  {skill.name}
                </Txt>
                <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2 }}>
                  {topics.length ? `${topics.length} tracked · ${dueSoon} due this week` : 'No topics yet'}
                </Txt>
              </View>
              <Chevron open={isOpen} color={t.c.fnt} />
            </Press>

            {isOpen ? (
              <Disclose style={{ paddingHorizontal: 18, paddingBottom: 6 }}>
                {topics.map((topic, k) => {
                  const band = bandFor(topic.interval_days);
                  const color = bandColor(band, t.c);
                  const late = daysBetween(topic.due_on, day);
                  const from = late > 0 ? { ...topic, due_on: day } : topic;
                  const chain = projectedChain(from, skill.genre, 3);
                  const strong = reachesBand(from, skill, 4, day);
                  return (
                    <View key={topic.id} style={{ paddingVertical: 12, borderTopWidth: k === 0 ? 0 : 1, borderTopColor: t.c.line }}>
                      <Row gap={10}>
                        <Txt style={{ flex: 1, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                          {topic.title}
                        </Txt>
                        <Pips pips={pipsFor(band)} color={color} />
                        <Txt v="badge" c={t.c.mut}>
                          {band.label}
                        </Txt>
                      </Row>
                      <Txt v="secondary" c={late > 0 ? t.c.red : t.c.mut} style={{ marginTop: 5 }}>
                        {late > 0
                          ? `Overdue ${late === 1 ? 'by a day' : `${late} days`} — due now`
                          : late === 0
                            ? 'Due today'
                            : `Next ${formatWithYear(topic.due_on, parseDay(day))} · ${inWords(-late)}`}
                      </Txt>
                      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3, lineHeight: 18 }}>
                        {`Then ${chain.map((d) => `${d}d`).join(' → ')} on OKs`}
                        {strong
                          ? strong === from.due_on
                            ? ' · Strong after the next review'
                            : ` · Strong by ${formatWithYear(strong, parseDay(day))}`
                          : band.level >= 4
                            ? ` · ${band.label} now`
                            : ''}
                      </Txt>
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
        );
      })}
    </View>
  );
}

