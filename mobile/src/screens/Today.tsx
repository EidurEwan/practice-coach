import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { bandFor, gapLabel, pipsFor } from '../engine/bands';
import { addDays, backIn, daysBetween, formatLong, inWords } from '../engine/dates';
import { FLAG_LABEL, PlanItem, badgeFor } from '../engine/plan';
import { previewRatings } from '../engine/schedule';
import { Rating } from '../engine/types';
import { useNav } from '../nav/router';
import { bandColor, flagColors, RATING_HELP, RATING_LABEL, ratingColors } from '../theme/colors';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { useStore } from '../store/store';
import { RecallChart, useRecall } from '../ui/charts';
import { Check, Chevron, Forward } from '../ui/icons';
import { Badge, CapacityBar, Card, Disclose, Dot, Label, Pips, Press, Row, Txt } from '../ui/primitives';
import { Screen } from '../ui/shell';

export function TodayScreen() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { plan, day, doc } = store;
  const [openId, setOpenId] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [redistributed, setRedistributed] = useState(false);

  const n = plan.focus.length;
  const capacity = plan.capacity;

  const ratedToday = useMemo(
    () =>
      doc.reviews
        .filter((r) => r.rated_at.slice(0, 10) === day)
        .map((r) => ({ review: r, topic: doc.topics.find((x) => x.id === r.topic_id) }))
        .filter((r) => r.topic),
    [day, doc.reviews, doc.topics],
  );

  const nextUp = useMemo(() => {
    const upcoming = doc.topics
      .filter((x) => !x.archived_at && x.due_on > day)
      .sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
    if (!upcoming.length) return null;
    const on = upcoming[0].due_on;
    return { on, count: upcoming.filter((x) => x.due_on === on).length };
  }, [day, doc.topics]);

  const loggedToday = doc.log_entries.filter((e) => e.studied_on === day);

  const open = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
    setWhyOpen(false);
  };

  const rate = (item: PlanItem, rating: Rating) => {
    store.rate(item.topic.id, rating);
    setOpenId(null);
    setWhyOpen(false);
  };

  return (
    <Screen>
      <Txt v="screenTitle" style={{ marginTop: 14 }}>
        Today
      </Txt>
      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3 }}>
        {formatLong(day)}
      </Txt>

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

          {plan.over > 0 && !redistributed ? (
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
            <Label>Today's plan</Label>
            <Txt v="label" c={t.c.fnt} style={{ opacity: 0.8, textTransform: 'none', letterSpacing: 0 }}>
              Tap one to log it
            </Txt>
          </Row>

          <View style={{ marginTop: 10, gap: 10 }}>
            {plan.focus.map((item, i) => (
              <PracticeCard
                key={item.topic.id}
                item={item}
                index={i}
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
          day={day}
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
              {plan.backlog.length} behind today
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

      <Label style={{ marginTop: 26 }}>Logged today</Label>
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
  open,
  whyOpen,
  onToggle,
  onToggleWhy,
  onRate,
}: {
  item: PlanItem;
  index: number;
  open: boolean;
  whyOpen: boolean;
  onToggle: () => void;
  onToggleWhy: () => void;
  onRate: (r: Rating) => void;
}) {
  const t = useTheme();
  const { day } = useStore();
  const hue = t.hue(item.skill.hue_index);
  const band = bandFor(item.topic.interval_days);
  const color = bandColor(band, t.c);
  const flag = item.flag ? flagColors(item.flag, t.c) : null;
  const curve = useRecall(item.topic.interval_days);
  const previews = useMemo(
    () => previewRatings(item.topic, item.skill.genre, day),
    [day, item.skill.genre, item.topic],
  );

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

            <Label style={{ marginTop: 14 }}>How did it go?</Label>
            <View style={{ marginTop: 9, gap: 7 }}>
              {previews.map(({ rating, days }) => {
                const look = ratingColors(rating, t.c);
                return (
                  <Press
                    key={rating}
                    scale={0.98}
                    onPress={() => onRate(rating)}
                    accessibilityLabel={`${RATING_LABEL[rating]} — ${RATING_HELP[rating]} — ${backIn(days)}`}
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
  backlog,
  rated,
}: {
  nextUp: { on: string; count: number } | null;
  day: string;
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
          Today's set is cleared
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
