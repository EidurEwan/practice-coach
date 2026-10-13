import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  activity,
  needsAttention,
  outlook,
  ratingMix,
  skillProgress,
  summary,
  TARGET_RECALL,
  weeklyWorkload,
} from '../engine/analytics';
import { formatShort, parseDay } from '../engine/dates';
import { useNav } from '../nav/router';
import { useStore } from '../store/store';
import { RATING_LABEL, ratingColors } from '../theme/colors';
import { useTheme } from '../theme/theme';
import { vizFor } from '../theme/viz';
import { Chevron } from '../ui/icons';
import { Card, Disclose, Dot, Press, PrimaryButton, Row, Segmented, Txt } from '../ui/primitives';
import { Screen } from '../ui/shell';
import { Heatmap, Legend, OutlookChart, StackedBar, WeekBars } from '../ui/viz';

type Ahead = '1m' | '3m' | '6m' | '1y';

const AHEAD: { key: Ahead; label: string; days: number; long: string }[] = [
  { key: '1m', label: '1 month', days: 30, long: 'in a month' },
  { key: '3m', label: '3 months', days: 91, long: 'in 3 months' },
  { key: '6m', label: '6 months', days: 182, long: 'in 6 months' },
  { key: '1y', label: '1 year', days: 365, long: 'in a year' },
];

const BAND_NAMES = ['Fragile', 'Learning', 'Familiar', 'Strong', 'Retained'];
const WEEKS_BACK = 12;
const WEEKS_AHEAD = 8;

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** "Now", "2 wk", "3 mo" — the x-axis of the outlook. */
function agoLabel(days: number): string {
  if (days === 0) return 'Now';
  if (days < 60) return `${Math.round(days / 7)} wk`;
  if (days < 360) return `${Math.round(days / 30.4)} mo`;
  return `${Math.round(days / 365)} yr`;
}

export function ProgressScreen() {
  const t = useTheme();
  const nav = useNav();
  const { doc, day } = useStore();
  const [ahead, setAhead] = useState<Ahead>('3m');
  const horizon = AHEAD.find((a) => a.key === ahead)!;

  const s = useMemo(() => summary(doc, day), [doc, day]);

  if (!s.tracked) {
    return (
      <Screen>
        <Header />
        <Card style={{ marginTop: 20 }}>
          <Txt v="rowTitle">Nothing to measure yet</Txt>
          <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
            Log what you study and rate it when it comes back. This fills in with how much you are likely to remember, where
            each topic is heading, and what it takes to keep it.
          </Txt>
          <PrimaryButton label="Log what you studied" onPress={() => nav.go({ name: 'log' })} style={{ marginTop: 16 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <Hero recall={s.recallNow ?? 0} tracked={s.tracked} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <Tile label="Streak" value={s.streak === 1 ? '1 day' : `${s.streak} days`} note={s.streak ? 'in a row with practice' : 'practise today to start one'} />
        <Tile label="Ratings" value={String(s.reviews30)} note="in the last 30 days" />
        <Tile
          label="Remembered"
          value={s.recallRate30 === null ? '—' : pct(s.recallRate30)}
          note="rated OK or Easy, 30 days"
        />
        <Tile label="Tracked" value={String(s.tracked)} note={s.tracked === 1 ? 'topic' : 'topics'} />
      </View>

      <View style={{ marginTop: 22 }}>
        <Segmented value={ahead} onChange={setAhead} height={36} options={AHEAD.map((a) => ({ key: a.key, label: a.label }))} />
      </View>

      <OutlookCard days={horizon.days} long={horizon.long} />
      <BandsCard days={horizon.days} long={horizon.long} />
      <WorkloadCard />
      <SkillsCard days={horizon.days} long={horizon.long} />
      <ActivityCard />
      <RatingsCard />
      <AttentionCard />
      <MethodNote />
    </Screen>
  );
}

function Header() {
  const t = useTheme();
  return (
    <View style={{ paddingTop: 12 }}>
      <Txt v="screenTitle">Progress</Txt>
      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }}>
        How much is sticking, and where it is heading
      </Txt>
    </View>
  );
}

function Hero({ recall, tracked }: { recall: number; tracked: number }) {
  const t = useTheme();
  return (
    <Card style={{ marginTop: 16 }}>
      <Txt v="label" c={t.c.fnt}>
        Estimated recall today
      </Txt>
      <Txt style={{ fontSize: 48, fontWeight: '700', letterSpacing: -1.4, marginTop: 4 }}>{pct(recall)}</Txt>
      <Txt v="secondary" c={t.c.mut} style={{ lineHeight: 19 }}>
        {`Averaged across ${tracked} ${tracked === 1 ? 'topic' : 'topics'}. The schedule aims to catch each one at about ${pct(
          TARGET_RECALL,
        )}, just before it slips.`}
      </Txt>
    </Card>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  const t = useTheme();
  return (
    <Card style={{ flexGrow: 1, flexBasis: '45%' }} padding={14}>
      <Txt v="secondary" c={t.c.fnt}>
        {label}
      </Txt>
      <Txt style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 2 }}>{value}</Txt>
      <Txt v="badge" c={t.c.fnt} style={{ fontWeight: '400', marginTop: 2 }}>
        {note}
      </Txt>
    </Card>
  );
}

function CardHead({ title, sub }: { title: string; sub?: string }) {
  const t = useTheme();
  return (
    <View>
      <Txt v="cardTitle">{title}</Txt>
      {sub ? (
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3, lineHeight: 18 }}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- outlook */

function OutlookCard({ days, long }: { days: number; long: string }) {
  const t = useTheme();
  const v = vizFor(t.dark);
  const { doc, day } = useStore();
  const [picked, setPicked] = useState<number | null>(null);

  const points = useMemo(() => {
    const steps = 12;
    const at = Array.from({ length: steps + 1 }, (_, i) => Math.round((i / steps) * days));
    return outlook(doc, day, at).map((o) => ({ label: agoLabel(o.days), keep: o.keepRecall, stop: o.stopRecall, on: o.on }));
  }, [doc, day, days]);

  const end = points[points.length - 1];
  const sel = picked !== null ? points[picked] : null;

  return (
    <Card style={{ marginTop: 12 }}>
      <CardHead title="Two futures" sub={`Estimated recall ${long} if you keep up with reviews, or stop today.`} />
      <View style={{ marginTop: 14 }}>
        <Legend
          items={[
            { color: v.keep, label: 'Keep reviewing', value: pct((sel ?? end).keep), shape: 'line' },
            { color: v.stop, label: 'Stop today', value: pct((sel ?? end).stop), shape: 'line' },
          ]}
        />
      </View>
      <View style={{ marginTop: 12 }}>
        <OutlookChart points={points} selected={picked} onSelect={setPicked} />
      </View>
      <Txt v="secondary" c={sel ? t.c.tx : t.c.mut} style={{ marginTop: 8, lineHeight: 19 }}>
        {sel
          ? `${sel.label === 'Now' ? 'Today' : formatShort(sel.on)}: ${pct(sel.keep)} keeping up, ${pct(sel.stop)} if you stop`
          : `Stopping costs about ${Math.max(0, Math.round((end.keep - end.stop) * 100))} points of recall ${long}. Touch the chart to read any point.`}
      </Txt>
    </Card>
  );
}

function BandsCard({ days, long }: { days: number; long: string }) {
  const t = useTheme();
  const v = vizFor(t.dark);
  const { doc, day } = useStore();
  const [now, later] = useMemo(() => outlook(doc, day, [0, days]), [doc, day, days]);
  const total = now.keepBands.reduce((a, b) => a + b, 0);
  const strongNow = now.keepBands[3] + now.keepBands[4];
  const strongLater = later.keepBands[3] + later.keepBands[4];

  return (
    <Card style={{ marginTop: 12 }}>
      <CardHead
        title="Proficiency"
        sub={`Strong or better: ${strongNow} of ${total} today, ${strongLater} ${long} if every review is done and rated OK.`}
      />
      <View style={{ marginTop: 14, gap: 12 }}>
        {[
          { label: 'Today', mix: now.keepBands },
          { label: long.replace(/^in /, 'In '), mix: later.keepBands },
        ].map((r) => (
          <View key={r.label}>
            <Txt v="secondary" c={t.c.mut} style={{ marginBottom: 6 }}>
              {r.label}
            </Txt>
            <StackedBar counts={r.mix} colors={v.ramp} height={14} />
          </View>
        ))}
      </View>
      <View style={{ marginTop: 14 }}>
        <Legend items={BAND_NAMES.map((name, i) => ({ color: v.ramp[i], label: name, value: `${now.keepBands[i]} → ${later.keepBands[i]}` }))} />
      </View>
    </Card>
  );
}

/* --------------------------------------------------------------- workload */

function WorkloadCard() {
  const t = useTheme();
  const { doc, day } = useStore();
  const [picked, setPicked] = useState<number | null>(null);
  const weeks = useMemo(() => weeklyWorkload(doc, day, WEEKS_AHEAD), [doc, day]);
  const weekly = doc.settings.daily_capacity * 7;
  const sel = picked !== null ? weeks[picked] : null;
  const total = weeks.reduce((a, w) => a + w.reviews, 0);

  return (
    <Card style={{ marginTop: 12 }}>
      <CardHead title="What keeping up takes" sub="Reviews per week for the next eight, if each is done when due." />
      <View style={{ marginTop: 16 }}>
        <WeekBars
          values={weeks.map((w) => w.reviews)}
          labels={weeks.map((w, i) => (i === 0 ? 'Now' : String(parseDay(w.week).getDate())))}
          reference={weekly}
          referenceLabel={`room for ${weekly}`}
          selected={picked}
          onSelect={setPicked}
        />
      </View>
      <Txt v="secondary" c={sel ? t.c.tx : t.c.mut} style={{ marginTop: 10, lineHeight: 19 }}>
        {sel
          ? `Week of ${formatShort(sel.week)}: ${sel.reviews} ${sel.reviews === 1 ? 'review' : 'reviews'}, against room for ${weekly}`
          : `${total} reviews over eight weeks. The line is your ${doc.settings.daily_capacity} a day, as a week. Gaps widen as topics settle, so this falls if you keep up.`}
      </Txt>
    </Card>
  );
}

/* ---------------------------------------------------------------- by skill */

function SkillsCard({ days, long }: { days: number; long: string }) {
  const t = useTheme();
  const v = vizFor(t.dark);
  const { doc, day } = useStore();
  const rows = useMemo(() => skillProgress(doc, day, days), [doc, day, days]);
  if (rows.length < 2) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <CardHead title="By skill" sub={`Proficiency today, and how many are Strong or better ${long}.`} />
      <View style={{ marginTop: 6 }}>
        {rows.map((r, k) => (
          <View key={r.skill.id} style={{ paddingVertical: 12, borderTopWidth: k === 0 ? 0 : 1, borderTopColor: t.c.line }}>
            <Row gap={8}>
              <Dot color={t.hue(r.skill.hue_index)} size={8} />
              <Txt v="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
                {r.skill.name}
              </Txt>
              <Txt v="secondary" c={t.c.tx} style={{ fontWeight: '600' }}>
                {pct(r.recallNow)}
              </Txt>
            </Row>
            <View style={{ marginTop: 8 }}>
              <StackedBar counts={r.bandsNow} colors={v.ramp} height={8} />
            </View>
            <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 6 }}>
              {`${r.topics} ${r.topics === 1 ? 'topic' : 'topics'} · Strong or better: ${r.bandsNow[3] + r.bandsNow[4]} now, ${
                r.bandsLater[3] + r.bandsLater[4]
              } ${long}`}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* ---------------------------------------------------------------- activity */

function ActivityCard() {
  const t = useTheme();
  const { doc, day } = useStore();
  const [picked, setPicked] = useState<number | null>(null);
  const days = useMemo(() => activity(doc, day, WEEKS_BACK), [doc, day]);
  const past = days.filter((d) => !d.future);
  const active = past.filter((d) => d.count > 0).length;
  const sel = picked !== null ? days[picked] : null;

  return (
    <Card style={{ marginTop: 12 }}>
      <CardHead title="Activity" sub="Ratings and logged sessions, the last twelve weeks. Columns are weeks, Monday at the top." />
      <View style={{ marginTop: 14 }}>
        <Heatmap days={days} selected={picked} onSelect={setPicked} />
      </View>
      <Txt v="secondary" c={sel ? t.c.tx : t.c.mut} style={{ marginTop: 10, lineHeight: 19 }}>
        {sel
          ? `${formatShort(sel.day)}: ${sel.count ? `${sel.count} ${sel.count === 1 ? 'session' : 'sessions'}` : 'nothing logged or rated'}`
          : `Practised on ${active} of the last ${past.length} days.`}
      </Txt>
    </Card>
  );
}

/* ----------------------------------------------------------------- ratings */

function RatingsCard() {
  const t = useTheme();
  const { doc, day } = useStore();
  const mix = useMemo(() => ratingMix(doc, day, 30), [doc, day]);
  const total = mix.failed + mix.hard + mix.ok + mix.easy;
  if (!total) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <CardHead title="How reviews went" sub="Ratings in the last 30 days." />
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        {(['failed', 'hard', 'ok', 'easy'] as const).map((r) => (
          <View key={r} style={{ flex: 1 }}>
            <Row gap={6}>
              <Dot color={ratingColors(r, t.c).fg} size={8} />
              <Txt v="secondary" c={t.c.mut}>
                {RATING_LABEL[r]}
              </Txt>
            </Row>
            <Txt style={{ fontSize: 22, fontWeight: '700', marginTop: 4 }}>{mix[r]}</Txt>
            <Txt v="badge" c={t.c.fnt} style={{ fontWeight: '400' }}>
              {pct(mix[r] / total)}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* ---------------------------------------------------------------- attention */

function AttentionCard() {
  const t = useTheme();
  const { doc, day } = useStore();
  const list = useMemo(() => needsAttention(doc, day, 5), [doc, day]);
  if (!list.length) return null;

  return (
    <Card style={{ marginTop: 12 }}>
      <CardHead title="Worth a look" sub="Weak points first, then whatever has slipped furthest." />
      <View style={{ marginTop: 6 }}>
        {list.map((a, k) => (
          <View
            key={a.topic.id}
            accessible
            accessibilityLabel={`${a.topic.title}, ${a.skill.name}. ${a.why}. About ${pct(a.recall)} recall.`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: k === 0 ? 0 : 1, borderTopColor: t.c.line }}
          >
            <Dot color={t.hue(a.skill.hue_index)} size={7} />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                {a.topic.title}
              </Txt>
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2 }} numberOfLines={1}>
                {a.why}
              </Txt>
            </View>
            <Txt v="secondary" c={t.c.tx} style={{ fontWeight: '600' }}>
              {`~${pct(a.recall)}`}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ method */

function MethodNote() {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 18 }}>
      <Press scale={1} onPress={() => setOpen((o) => !o)} accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
        <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '600' }}>
          How these are worked out
        </Txt>
        <Chevron open={open} size={12} color={t.c.acc} />
      </Press>
      {open ? (
        <Disclose>
          <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 20 }}>
            {`Nothing here is a test score — the app never quizzes you. Recall is estimated from the same forgetting curve as the chart on each card: memory fades as exp(−t ÷ S), and the schedule picks each gap so a review lands while recall is still about ${pct(
              TARGET_RECALL,
            )}. A topic's current gap therefore sets how fast it fades.\n\n"Keep reviewing" assumes every review is done the day it is due and rated OK, using the same arithmetic as the rating buttons. "Stop today" lets every topic fade from when you last practised it. Real ratings will move both.`}
          </Txt>
        </Disclose>
      ) : null}
    </View>
  );
}
