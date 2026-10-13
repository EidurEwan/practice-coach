import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { bandFor, gapLabel, pipsFor } from '../engine/bands';
import { addDays, backIn, Day, dayOf, daysBetween, formatLong, formatShort, inWords } from '../engine/dates';
import { activeTopics, buildPlan, dayAsText, endedSeasons, FLAG_LABEL, PlanItem, badgeFor } from '../engine/plan';
import { previewRatings } from '../engine/schedule';
import { Rating } from '../engine/types';
import { useNav } from '../nav/router';
import { bandColor, flagColors, RATING_HELP, RATING_LABEL, ratingColors } from '../theme/colors';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { useStore } from '../store/store';
import { finished, tapped } from '../ui/feedback';
import { RecallChart, useRecall } from '../ui/charts';
import { Back, Check, Chevron, Forward } from '../ui/icons';
import { Badge, CapacityBar, Card, Disclose, Dot, Field, Label, Pips, Press, Row, TextButton, Txt } from '../ui/primitives';
import { Screen } from '../ui/shell';

/** The four ratings in the order of their rows — and of the 1–4 keys. */
const KEYED: Rating[] = ['failed', 'hard', 'ok', 'easy'];

/** What the last rating did, for the session card that follows it. */
type Last = {
  topicId: string;
  title: string;
  rating: Rating;
  interval: number;
  weakened: boolean;
  /** The topic's review stamp before this rating — back to it means the rating was undone. */
  before: string | null;
};

export function TodayScreen() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { day, doc } = store;
  const [openId, setOpenId] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [redistributed, setRedistributed] = useState(false);
  // Days from today, so the view stays on "yesterday" across midnight rather
  // than on a fixed date that quietly becomes the day before yesterday.
  const [offset, setOffset] = useState(0);
  const [last, setLast] = useState<Last | null>(null);
  const [copied, setCopied] = useState(false);

  const viewDay = addDays(day, offset);
  const past = offset < 0;
  const future = offset > 0;
  const plan = useMemo(() => (offset === 0 ? store.plan : buildPlan(doc, viewDay)), [doc, offset, store.plan, viewDay]);

  const n = plan.focus.length;
  const capacity = plan.capacity;

  const ratedToday = useMemo(
    () =>
      doc.reviews
        // The rating's own local day. Slicing the stored ISO string reads the
        // UTC date, which puts an evening rating in the Americas on tomorrow.
        .filter((r) => dayOf(r.rated_at) === viewDay)
        .map((r) => ({ review: r, topic: doc.topics.find((x) => x.id === r.topic_id) }))
        .filter((r) => r.topic),
    [viewDay, doc.reviews, doc.topics],
  );

  const nextUp = useMemo(() => {
    const upcoming = activeTopics(doc, viewDay)
      .filter((x) => x.due_on > viewDay)
      .sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
    if (!upcoming.length) return null;
    const on = upcoming[0].due_on;
    return { on, count: upcoming.filter((x) => x.due_on === on).length };
  }, [viewDay, doc]);

  // Undo puts the topic back as it was; the card about that rating goes with it.
  const lastLive = last && doc.topics.find((x) => x.id === last.topicId)?.last_reviewed_at !== last.before ? last : null;

  const seasons = useMemo(() => (offset === 0 ? endedSeasons(doc, day) : []), [day, doc, offset]);
  const loggedToday = doc.log_entries.filter((e) => e.studied_on === viewDay);

  const open = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
    setWhyOpen(false);
  };

  const go = (by: number) => {
    setOffset((o) => (by === 0 ? 0 : o + by));
    setOpenId(null);
    setWhyOpen(false);
    setBacklogOpen(false);
    setLast(null);
    setCopied(false);
  };

  const rate = (item: PlanItem, rating: Rating) => {
    if (future) return;
    // Clearing the last thing due is the one moment in the day worth marking,
    // so it gets a different feel from the rating before it. Read the count
    // before the store changes it.
    const lastOne = plan.focus.length <= 1;
    const result = store.rate(item.topic.id, rating, viewDay);
    if (lastOne) finished();
    else tapped();
    setOpenId(null);
    setWhyOpen(false);
    setLast(
      result && rating !== 'pushed'
        ? {
            topicId: item.topic.id,
            title: item.topic.title,
            rating,
            interval: result.interval,
            weakened: result.weakened,
            before: item.topic.last_reviewed_at,
          }
        : null,
    );
  };

  const copyDay = async () => {
    const text = dayAsText(plan);
    try {
      if (Platform.OS === 'web') {
        await globalThis.navigator?.clipboard?.writeText(text);
        setCopied(true);
      } else {
        await Share.share({ message: text });
      }
    } catch {
      // A refused clipboard or a dismissed share sheet is not an error worth showing.
    }
  };

  // The web build is used at a desk: 1–4 rate the open card, Esc closes it.
  const keys = useRef({ openId, plan, rate });
  keys.current = { openId, plan, rate };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { openId: id, plan: p, rate: r } = keys.current;
      if (e.key === 'Escape' && id) {
        setOpenId(null);
        return;
      }
      const k = Number(e.key);
      const item = id ? p.focus.find((i) => i.topic.id === id) : null;
      if (item && k >= 1 && k <= 4) {
        e.preventDefault();
        r(item, KEYED[k - 1]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const title = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : offset === 1 ? 'Tomorrow' : formatShort(viewDay);

  return (
    <Screen>
      <Txt v="screenTitle" style={{ marginTop: 14 }}>
        {title}
      </Txt>

      <DateNav viewDay={viewDay} offset={offset} onStep={go} />

      {past ? (
        <Notice tone="warn">
          {`You are rating against ${formatLong(viewDay)}. Each rating is recorded on that day and the next review is counted from it.`}
        </Notice>
      ) : future ? (
        <Notice tone="calm">A look ahead — what is due that day if nothing changes. Ratings open on the day.</Notice>
      ) : null}

      {seasons.map(({ skill, topics, ratings }) => (
        <SeasonOver
          key={skill.id}
          name={skill.name}
          ended={skill.target_date!}
          hue={t.hue(skill.hue_index)}
          topics={topics}
          ratings={ratings}
          onKeep={() => store.updateSkill(skill.id, { target_date: null })}
          onArchive={() => store.archiveSkill(skill.id)}
        />
      ))}

      {lastLive ? (
        <SessionNote
          last={lastLive}
          next={plan.focus[0] ?? null}
          left={n}
          onStart={(id) => {
            setLast(null);
            open(id);
          }}
          onSubSkill={(sub) => {
            store.updateTopic(lastLive.topicId, { sub_skill: sub });
            setLast({ ...lastLive, weakened: false });
          }}
          onDismiss={() => setLast(null)}
        />
      ) : null}

      {n > 0 ? (
        <>
          <Row gap={10} align="flex-end" style={{ marginTop: 20 }}>
            <Txt v="bigNumeral" style={{ lineHeight: 44 }}>
              {n}
            </Txt>
            <Txt c={t.c.mut} style={{ fontSize: 17, fontWeight: '500', paddingBottom: 2 }}>
              {n === 1 ? 'thing' : 'things'} due
            </Txt>
          </Row>

          <View style={{ marginTop: 14 }}>
            <CapacityBar ratio={n / capacity} />
          </View>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 7 }}>
            {n} of your {capacity} a day
          </Txt>

          {offset === 0 && plan.over > 0 && !redistributed ? (
            <OverCapacity
              over={plan.over}
              movable={plan.movable.length}
              day={day}
              onRedistribute={() => {
                store.redistributeToday();
                setRedistributed(true);
              }}
            />
          ) : null}

          <Row align="baseline" style={{ marginTop: 24, justifyContent: 'space-between' }}>
            <Label>{offset === 0 ? "Today's plan" : 'The plan'}</Label>
            <Txt v="label" c={t.c.fnt} style={{ opacity: 0.8, textTransform: 'none', letterSpacing: 0 }}>
              {future ? 'Preview only' : Platform.OS === 'web' ? 'Open one, then 1–4 to rate' : 'Tap one to log it'}
            </Txt>
          </Row>

          <View style={{ marginTop: 10, gap: 10 }}>
            {plan.focus.map((item, i) => (
              <PracticeCard
                key={item.topic.id}
                item={item}
                index={i}
                on={viewDay}
                readOnly={future}
                open={openId === item.topic.id}
                whyOpen={whyOpen}
                onToggle={() => open(item.topic.id)}
                onToggleWhy={() => setWhyOpen((w) => !w)}
                onRate={(r) => rate(item, r)}
              />
            ))}
          </View>
        </>
      ) : (
        <Cleared
          nextUp={nextUp}
          day={viewDay}
          today={offset === 0}
          backlog={plan.backlog.length}
          rated={ratedToday.map(({ review, topic }) => ({
            title: topic!.title,
            hue: t.hue(doc.skills.find((s) => s.id === topic!.skill_id)?.hue_index ?? 0),
            rating: review.rating,
            next: backIn(review.next_interval),
          }))}
        />
      )}

      {plan.backlog.length > 0 ? (
        <>
          <Press
            onPress={() => setBacklogOpen((b) => !b)}
            accessibilityState={{ expanded: backlogOpen }}
            style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}
          >
            <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '500' }}>
              {backlogOpen ? 'Hide the ' : 'Show the '}
              {plan.backlog.length} behind {offset === 0 ? 'today' : 'these'}
            </Txt>
            <Chevron open={backlogOpen} size={12} color={t.c.acc} />
          </Press>

          {backlogOpen ? (
            <Disclose>
              <Card padding={0} style={{ paddingHorizontal: 18 }}>
                {plan.backlog.map((item, i) => (
                  <Row
                    key={item.topic.id}
                    gap={10}
                    style={{
                      paddingVertical: 13,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: t.c.line,
                    }}
                  >
                    <Dot color={t.hue(item.skill.hue_index)} size={7} />
                    <Txt style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                      {item.topic.title}
                    </Txt>
                    <Txt v="label" c={t.c.fnt} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
                      {item.heldApartFrom ? `held apart from ${item.heldApartFrom.title}` : item.lateLabel}
                    </Txt>
                  </Row>
                ))}
                <View style={{ paddingVertical: 13, borderTopWidth: 1, borderTopColor: t.c.line }}>
                  <Txt v="secondary" c={t.c.fnt} style={{ lineHeight: 19 }}>
                    These are already ranked. They move into the plan as the days ahead free up — you do not need to
                    clear them.
                  </Txt>
                </View>
              </Card>
            </Disclose>
          ) : null}
        </>
      ) : null}

      {n > 0 ? (
        <TextButton
          label={copied ? 'Copied to the clipboard' : Platform.OS === 'web' ? 'Copy the day as text' : 'Share the day as text'}
          color={copied ? t.c.grn : t.c.acc}
          onPress={copyDay}
          style={{ alignItems: 'flex-start', marginTop: 4 }}
        />
      ) : null}

      <Label style={{ marginTop: 26 }}>{offset === 0 ? 'Logged today' : `Logged ${formatShort(viewDay)}`}</Label>
      <Press onPress={() => nav.go({ name: 'log' })} scale={0.99} style={{ marginTop: 10 }}>
        <Card>
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <Txt v="rowTitle">
                {loggedToday.length
                  ? `${loggedToday.length} ${loggedToday.length === 1 ? 'topic' : 'topics'} logged`
                  : 'Nothing logged yet'}
              </Txt>
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }}>
                {loggedToday.length ? 'Tap to add what else you covered' : 'Log it and it gets a date'}
              </Txt>
            </View>
            <Forward color={t.c.fnt} />
          </Row>
          {loggedToday.length ? (
            <Row gap={6} style={{ marginTop: 12, flexWrap: 'wrap' }}>
              {loggedToday.map((e) => {
                const topic = doc.topics.find((x) => x.id === e.topic_id);
                const skill = doc.skills.find((s) => s.id === e.skill_id);
                return (
                  <Row
                    key={e.id}
                    gap={6}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: t.c.sunk,
                    }}
                  >
                    <Dot color={t.hue(skill?.hue_index ?? 0)} size={6} />
                    <Txt v="secondary" c={t.c.mut}>
                      {topic?.title ?? 'Logged'}
                    </Txt>
                  </Row>
                );
              })}
            </Row>
          ) : null}
        </Card>
      </Press>
    </Screen>
  );
}

/* --------------------------------------------------------- date navigation */

function DateNav({ viewDay, offset, onStep }: { viewDay: Day; offset: number; onStep: (by: number) => void }) {
  const t = useTheme();
  const step = { width: 42, height: 38, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <Row gap={3} style={{ marginTop: 10, backgroundColor: t.c.sunk, borderRadius: radius.input, padding: 3 }}>
      <Press scale={0.94} onPress={() => onStep(-1)} accessibilityLabel="The day before" style={step}>
        <Back size={14} color={t.c.mut} />
      </Press>
      <Press
        scale={0.99}
        disabled={offset === 0}
        onPress={() => onStep(0)}
        accessibilityLabel={offset === 0 ? formatLong(viewDay) : `${formatLong(viewDay)} — back to today`}
        style={{ flex: 1, minHeight: 38, paddingVertical: 3, borderRadius: 10, backgroundColor: t.c.surf, alignItems: 'center', justifyContent: 'center' }}
      >
        <Txt v="secondary" style={{ fontWeight: '600', fontSize: 14 }}>
          {formatLong(viewDay)}
        </Txt>
        {offset !== 0 ? (
          <Txt v="label" c={t.c.acc} style={{ textTransform: 'none', letterSpacing: 0, marginTop: 1 }}>
            Back to today
          </Txt>
        ) : null}
      </Press>
      <Press scale={0.94} onPress={() => onStep(1)} accessibilityLabel="The day after" style={step}>
        <Forward size={14} color={t.c.mut} />
      </Press>
    </Row>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'calm'; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Disclose>
      <View
        style={{
          marginTop: 12,
          borderRadius: 10,
          paddingHorizontal: 13,
          paddingVertical: 11,
          backgroundColor: tone === 'warn' ? t.c.ambT : t.c.sunk,
        }}
      >
        <Txt v="secondary" c={tone === 'warn' ? t.c.amb : t.c.mut} style={{ lineHeight: 19 }}>
          {children}
        </Txt>
      </View>
    </Disclose>
  );
}

/* ----------------------------------------------------------- season over */

function SeasonOver({
  name,
  ended,
  hue,
  topics,
  ratings,
  onKeep,
  onArchive,
}: {
  name: string;
  ended: Day;
  hue: string;
  topics: number;
  ratings: number;
  onKeep: () => void;
  onArchive: () => void;
}) {
  const t = useTheme();
  return (
    <Disclose style={{ marginTop: 14 }}>
      <Card>
        <Row gap={9}>
          <Dot color={hue} />
          <Txt v="rowTitle" style={{ flex: 1 }}>
            {name} — season over
          </Txt>
        </Row>
        <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
          {`The target date, ${formatLong(ended)}, has passed, so ${name} has stopped scheduling. ` +
            `${topics} ${topics === 1 ? 'topic' : 'topics'} and ${ratings} ${ratings === 1 ? 'rating' : 'ratings'} — ` +
            'all of it kept. Keep practising to pick up where it left off.'}
        </Txt>
        <Row gap={14} style={{ marginTop: 6 }}>
          <TextButton label="Keep practising" color={t.c.acc} onPress={onKeep} />
          <TextButton label="Archive it" onPress={onArchive} />
        </Row>
      </Card>
    </Disclose>
  );
}

/* ----------------------------------------------------------- session note */

function SessionNote({
  last,
  next,
  left,
  onStart,
  onSubSkill,
  onDismiss,
}: {
  last: Last;
  next: PlanItem | null;
  left: number;
  onStart: (id: string) => void;
  onSubSkill: (sub: string) => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  const [sub, setSub] = useState('');
  const look = ratingColors(last.rating, t.c);

  return (
    <Disclose style={{ marginTop: 14 }}>
      <Card>
        <Row gap={9}>
          <Txt v="label" c={look.fg} style={{ textTransform: 'none', letterSpacing: 0 }}>
            {RATING_LABEL[last.rating]}
          </Txt>
          <Txt v="secondary" style={{ flex: 1 }} numberOfLines={1}>
            {last.title}
          </Txt>
          <Txt v="secondary" c={t.c.fnt}>
            {backIn(last.interval)}
          </Txt>
        </Row>

        {last.weakened ? (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.c.line }}>
            <Txt style={{ fontWeight: '600' }}>Three misses in a row. Which part is actually failing?</Txt>
            <Txt v="secondary" c={t.c.mut} style={{ marginTop: 4, lineHeight: 19 }}>
              Naming it turns “I can’t do this topic” into one thing to drill. It shows on the card from now on.
            </Txt>
            <View style={{ marginTop: 10 }}>
              <Field value={sub} onChangeText={setSub} placeholder="The step where it goes wrong" onSubmitEditing={() => sub.trim() && onSubSkill(sub.trim())} />
            </View>
            <Row gap={14}>
              <TextButton label="Save" color={t.c.acc} onPress={() => sub.trim() && onSubSkill(sub.trim())} />
              <TextButton label="Not sure yet" onPress={onDismiss} />
            </Row>
          </View>
        ) : next ? (
          <Press
            onPress={() => onStart(next.topic.id)}
            accessibilityLabel={`Start ${next.topic.title}`}
            style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}
          >
            <Txt v="secondary" c={t.c.acc} style={{ flex: 1, fontWeight: '500' }} numberOfLines={1}>
              {`Next: ${next.topic.title}`}
            </Txt>
            <Txt v="secondary" c={t.c.fnt}>
              {left === 1 ? 'the last one' : `${left} left`}
            </Txt>
            <Forward size={13} color={t.c.acc} />
          </Press>
        ) : (
          <Txt v="secondary" c={t.c.grn} style={{ marginTop: 8 }}>
            That is everything due.
          </Txt>
        )}
      </Card>
    </Disclose>
  );
}

/* --------------------------------------------------------- over capacity */

function OverCapacity({
  over,
  movable,
  day,
  onRedistribute,
}: {
  over: number;
  movable: number;
  day: string;
  onRedistribute: () => void;
}) {
  const t = useTheme();
  const target = new Date(addDays(day, 1) + 'T12:00:00');
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][target.getDay()];

  return (
    <Disclose style={{ marginTop: 14 }}>
      <View style={{ borderRadius: radius.button, padding: 16, backgroundColor: t.c.ambT }}>
        <Txt v="secondary" c={t.c.amb} style={{ fontWeight: '600', fontSize: 14 }}>
          Over capacity by {over} {over === 1 ? 'thing' : 'things'}
        </Txt>
        <Txt v="secondary" c={t.c.amb} style={{ marginTop: 5, lineHeight: 19, opacity: 0.9 }}>
          {movable > 0
            ? `Overdue and priority weak points stay put. The rest can move to ${weekday}.`
            : 'All of it is overdue or a priority weak point, so none of it can move.'}
        </Txt>
        {movable > 0 ? (
          <Press
            onPress={onRedistribute}
            style={{
              marginTop: 12,
              minHeight: 40,
              alignSelf: 'flex-start',
              borderRadius: 10,
              paddingHorizontal: 14,
              justifyContent: 'center',
              backgroundColor: t.c.amb,
            }}
          >
            <Txt v="secondary" c={t.c.bg} style={{ fontWeight: '600' }}>
              Redistribute
            </Txt>
          </Press>
        ) : null}
      </View>
    </Disclose>
  );
}

/* ---------------------------------------------------------- practice card */

function PracticeCard({
  item,
  index,
  on,
  readOnly,
  open,
  whyOpen,
  onToggle,
  onToggleWhy,
  onRate,
}: {
  item: PlanItem;
  index: number;
  /** The day being rated against — today, or an earlier one. */
  on: Day;
  /** A future day: shown, not rated. */
  readOnly: boolean;
  open: boolean;
  whyOpen: boolean;
  onToggle: () => void;
  onToggleWhy: () => void;
  onRate: (r: Rating) => void;
}) {
  const t = useTheme();
  const hue = t.hue(item.skill.hue_index);
  const band = bandFor(item.topic.interval_days);
  const color = bandColor(band, t.c);
  const flag = item.flag ? flagColors(item.flag, t.c) : null;
  const curve = useRecall(item.topic.interval_days);
  const previews = useMemo(
    () => previewRatings(item.topic, item.skill.genre, on, item.skill.calibration),
    [on, item.skill.calibration, item.skill.genre, item.topic],
  );
  const { cue, answer, encoding } = item.topic;
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!open) setRevealed(false);
  }, [open]);

  return (
    <View>
      <View style={[{ backgroundColor: t.c.surf, borderRadius: radius.card, overflow: 'hidden' }, t.shadow]}>
        <View style={{ height: 3, backgroundColor: hue }} />
        <Press
          scale={1}
          onPress={onToggle}
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${item.topic.title}, ${item.skill.name}`}
          style={{ padding: 18, paddingTop: 16 }}
        >
          <Row gap={8}>
            <Txt v="label" c={hue}>
              {item.skill.name}
            </Txt>
            <Badge text={badgeFor(item.skill)} />
            <View style={{ flex: 1 }} />
            {item.flag && flag ? <Badge text={FLAG_LABEL[item.flag]} fg={flag.fg} bg={flag.bg} /> : null}
            <Chevron open={open} color={t.c.fnt} />
          </Row>

          <Txt v="rowTitle" style={{ marginTop: 7, lineHeight: 20 }}>
            {item.topic.title}
          </Txt>
          <Txt v="secondary" c={t.c.mut} style={{ marginTop: 4, lineHeight: 18 }}>
            {item.method}
          </Txt>
          {item.topic.sub_skill ? (
            <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }} numberOfLines={1}>
              {`Focus: ${item.topic.sub_skill}`}
            </Txt>
          ) : null}

          <Row gap={8} style={{ marginTop: 9 }}>
            <Pips pips={pipsFor(band)} color={color} />
            <Txt v="label" c={color} style={{ textTransform: 'none', letterSpacing: 0 }}>
              {band.label}
            </Txt>
            <Txt v="label" c={t.c.fnt} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
              {gapLabel(item.topic.interval_days)}
            </Txt>
          </Row>
        </Press>

        {open ? (
          <Disclose style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
            {cue || answer ? (
              <View style={{ marginBottom: 14, borderRadius: radius.input, padding: 14, backgroundColor: t.c.sunk }}>
                <Label>Prompt</Label>
                <Txt style={{ marginTop: 6, fontSize: 17, lineHeight: 24 }}>{cue || item.topic.title}</Txt>
                {answer || encoding ? (
                  revealed ? (
                    <Disclose>
                      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.c.line }}>
                        {answer ? <Txt style={{ fontSize: 17, lineHeight: 24, fontWeight: '600' }}>{answer}</Txt> : null}
                        {encoding ? (
                          <Txt v="secondary" c={t.c.mut} style={{ marginTop: answer ? 6 : 0, lineHeight: 19 }}>
                            {`Encoding: ${encoding}`}
                          </Txt>
                        ) : null}
                      </View>
                    </Disclose>
                  ) : (
                    <Press
                      onPress={() => setRevealed(true)}
                      accessibilityLabel="Reveal the answer"
                      style={{ marginTop: 10, minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' }}
                    >
                      <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '600' }}>
                        Recall it first, then reveal
                      </Txt>
                    </Press>
                  )
                ) : null}
              </View>
            ) : null}
            <Press
              scale={1}
              onPress={onToggleWhy}
              accessibilityState={{ expanded: whyOpen }}
              style={{ paddingTop: 13, borderTopWidth: 1, borderTopColor: t.c.line, flexDirection: 'row', alignItems: 'center', gap: 7 }}
            >
              <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '500' }}>
                Why this?
              </Txt>
              <Chevron open={whyOpen} size={11} color={t.c.acc} />
            </Press>

            {whyOpen ? (
              <Disclose>
                <View style={{ marginTop: 10, borderRadius: radius.input, padding: 14, backgroundColor: t.c.sunk }}>
                  {item.reasons.map((reason, i) => (
                    <Row key={i} gap={9} align="flex-start" style={{ paddingVertical: 5 }}>
                      <View style={{ marginTop: 7 }}>
                        <Dot color={t.c.fnt} size={5} />
                      </View>
                      <Txt v="secondary" c={t.c.mut} style={{ flex: 1, lineHeight: 19 }}>
                        {reason}
                      </Txt>
                    </Row>
                  ))}
                </View>
              </Disclose>
            ) : null}

            <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.c.line }}>
              <Row gap={8}>
                <Label>Recall so far</Label>
                <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
                <Txt v="label" c={color} style={{ textTransform: 'none', letterSpacing: 0 }}>
                  {curve.chainLabel}
                </Txt>
              </Row>
              <View style={{ marginTop: 12 }}>
                <RecallChart intervalDays={item.topic.interval_days} color={color} />
              </View>
              <Txt v="label" c={t.c.mut} style={{ marginTop: 10, textTransform: 'none', letterSpacing: 0, fontWeight: '400', lineHeight: 17 }}>
                {curve.dropLabel}
              </Txt>
            </View>

            {readOnly ? (
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 14, lineHeight: 19 }}>
                Ratings open on the day. Rated then, an OK would bring it back {backIn(previews[2].days).replace('back ', '')}.
              </Txt>
            ) : (
            <>
            <Label style={{ marginTop: 14 }}>How did it go?</Label>
            <View style={{ marginTop: 9, gap: 7 }}>
              {previews.map(({ rating, days }, i) => {
                const look = ratingColors(rating, t.c);
                return (
                  <Press
                    key={rating}
                    scale={0.98}
                    onPress={() => onRate(rating)}
                    accessibilityLabel={`${RATING_LABEL[rating]} — ${RATING_HELP[rating]} — ${backIn(days)}`}
                    accessibilityHint={Platform.OS === 'web' ? `Key ${i + 1}` : undefined}
                    style={{
                      minHeight: 46,
                      borderRadius: radius.input,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      backgroundColor: look.bg,
                      borderWidth: 1,
                      borderColor: rating === 'ok' ? 'transparent' : `${look.fg}33`,
                    }}
                  >
                    <Txt c={look.fg} style={{ width: 56, fontSize: 14, fontWeight: '600' }}>
                      {RATING_LABEL[rating]}
                    </Txt>
                    <Txt v="secondary" c={t.c.mut} style={{ flex: 1 }}>
                      {RATING_HELP[rating]}
                    </Txt>
                    <Txt v="secondary" c={look.fg} style={{ fontWeight: '600' }}>
                      {backIn(days)}
                    </Txt>
                  </Press>
                );
              })}
            </View>

            <Press
              scale={1}
              onPress={() => onRate('pushed')}
              style={{ marginTop: 8, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Txt v="secondary" c={t.c.fnt}>
                Didn't get to it — push back
              </Txt>
            </Press>
            </>
            )}
          </Disclose>
        ) : null}
      </View>
    </View>
  );
}

/* --------------------------------------------------------- cleared state */

function Cleared({
  nextUp,
  day,
  today,
  backlog,
  rated,
}: {
  nextUp: { on: string; count: number } | null;
  day: string;
  today: boolean;
  backlog: number;
  rated: { title: string; hue: string; rating: Rating; next: string }[];
}) {
  const t = useTheme();
  const returning = nextUp
    ? `${nextUp.count} ${nextUp.count === 1 ? 'thing comes' : 'more come'} back ${inWords(daysBetween(day, nextUp.on))}.`
    : 'Nothing is scheduled yet — log what you studied and it gets a date.';

  return (
    <>
      <View style={{ marginTop: 52, alignItems: 'center' }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: t.c.grn,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Check size={30} color={t.c.grn} weight={2.2} />
        </View>
        <Txt v="clearedTitle" style={{ marginTop: 22, textAlign: 'center' }}>
          {today ? "Today's set is cleared" : rated.length ? 'That day’s set is cleared' : 'Nothing due that day'}
        </Txt>
        <Txt c={t.c.mut} style={{ marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
          {returning}
          {backlog > 0
            ? ` The ${backlog} still behind you are ranked and waiting — they filter in as the days ahead free up.`
            : ''}
        </Txt>
      </View>

      {rated.length ? (
        <Card padding={0} style={{ marginTop: 30, paddingHorizontal: 18 }}>
          {rated.map((r, i) => (
            <Row
              key={i}
              gap={10}
              style={{ paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.c.line }}
            >
              <Dot color={r.hue} size={7} />
              <Txt style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
                {r.title}
              </Txt>
              <Txt v="label" c={ratingColors(r.rating, t.c).fg} style={{ textTransform: 'none', letterSpacing: 0 }}>
                {RATING_LABEL[r.rating]}
              </Txt>
              <Txt v="secondary" c={t.c.fnt}>
                {r.next}
              </Txt>
            </Row>
          ))}
        </Card>
      ) : null}
    </>
  );
}
