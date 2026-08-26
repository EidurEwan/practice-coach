import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDays, backIn, daysBetween, formatShort, inWords, relativePast } from '../engine/dates';
import { GENRE_EXAMPLE, methodFor } from '../engine/genres';
import { committed } from '../ui/feedback';
import { badgeFor } from '../engine/plan';
import { applyLog, firstInterval } from '../engine/schedule';
import { useNav } from '../nav/router';
import { useStore } from '../store/store';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { Back, Forward } from '../ui/icons';
import {
  Badge,
  Card,
  Chip,
  Disclose,
  Dot,
  Label,
  Press,
  PrimaryButton,
  Row,
  Field,
  Toggle,
  Txt,
} from '../ui/primitives';
import { Screen, TitleBar } from '../ui/shell';

export function LogScreen() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { doc, day } = store;

  const skills = doc.skills.filter((s) => !s.archived_at);
  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [sub, setSub] = useState('');
  const [shaky, setShaky] = useState(false);
  const [pairs, setPairs] = useState<Record<string, boolean>>({});
  const [ago, setAgo] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);

  const skill = skills.find((s) => s.id === skillId) ?? skills[0];
  const studiedOn = addDays(day, -ago);

  const topics = useMemo(
    () => doc.topics.filter((x) => !x.archived_at && x.skill_id === skill?.id),
    [doc.topics, skill?.id],
  );

  const existing = useMemo(
    () => topics.find((x) => x.title.trim().toLowerCase() === title.trim().toLowerCase()),
    [title, topics],
  );

  const loggedToday = doc.log_entries
    .filter((e) => e.studied_on === day)
    .slice()
    .reverse();

  /** The promise on the button: exactly what the schedule is about to do. */
  const preview = useMemo(() => {
    if (!skill) return '';
    const days = existing
      ? applyLog(existing, skill.genre, studiedOn, shaky).interval_days
      : firstInterval(skill.genre, shaky);
    const left = days - ago;
    return left <= 0 ? 'due now' : backIn(left);
  }, [ago, existing, shaky, skill, studiedOn]);

  const commit = () => {
    if (!skill || !title.trim()) return;
    const topic = store.logStudy({
      skillId: skill.id,
      topicId: existing?.id ?? null,
      title,
      subSkill: sub,
      feltShaky: shaky,
      studiedOn,
      confusableWith: Object.keys(pairs).filter((k) => pairs[k]),
    });
    committed();
    setSaved(topic.title);
    setTitle('');
    setSub('');
    setShaky(false);
    setPairs({});
    setAgo(0);
  };

  if (!skill) {
    return (
      <Screen>
        <TitleBar title="Log" subtitle="What you studied — it gets a date and a method" onBack={nav.back} />
        <Card style={{ marginTop: 20 }}>
          <Txt v="rowTitle">No skills yet</Txt>
          <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
            A skill is the container everything hangs off — it picks the curve and the method. Add one first.
          </Txt>
          <PrimaryButton label="Go to Skills" onPress={() => nav.go({ name: 'skills' })} style={{ marginTop: 16 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <TitleBar title="Log" subtitle="What you studied — it gets a date and a method" onBack={nav.back} />

      <View style={{ marginTop: 20 }}>
        <Card padding={20} style={{ borderRadius: 20 }}>
          <Label>Skill</Label>
          <Row gap={7} style={{ marginTop: 9, flexWrap: 'wrap' }}>
            {skills.map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                hue={t.hue(s.hue_index)}
                selected={s.id === skill.id}
                onPress={() => {
                  setSkillId(s.id);
                  setPairs({});
                  setSaved(null);
                }}
              />
            ))}
          </Row>
          <Row gap={7} style={{ marginTop: 10 }}>
            <Badge text={badgeFor(skill)} />
            <Txt v="secondary" c={t.c.fnt} style={{ flex: 1, lineHeight: 18 }}>
              {methodFor(skill.genre, skill.physical_kind)}
            </Txt>
          </Row>

          <View style={{ marginTop: 18 }}>
            <Label>Topic</Label>
            <View style={{ marginTop: 8 }}>
              <Field
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setSaved(null);
                }}
                placeholder={GENRE_EXAMPLE[skill?.genre ?? 'reasoning'].topic}
              />
            </View>
            {existing ? (
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 7 }}>
                Already tracked — this logs another pass rather than a second copy.
              </Txt>
            ) : null}
          </View>

          <View style={{ marginTop: 16 }}>
            <Label>Sub-skill</Label>
            <View style={{ marginTop: 8 }}>
              <Field value={sub} onChangeText={setSub} placeholder={GENRE_EXAMPLE[skill?.genre ?? 'reasoning'].sub} />
            </View>
          </View>

          <Row gap={12} style={{ marginTop: 18 }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '500' }}>Felt shaky</Txt>
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2, lineHeight: 18 }}>
                Tightens the first interval
              </Txt>
            </View>
            <Toggle value={shaky} onChange={setShaky} />
          </Row>

          {topics.length > 0 ? (
            <>
              <Row align="baseline" gap={10} style={{ marginTop: 18, justifyContent: 'space-between' }}>
                <Label>Confusable with</Label>
                <Txt v="label" c={t.c.fnt} style={{ opacity: 0.8, textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
                  Held apart, then collided
                </Txt>
              </Row>
              <Row gap={7} style={{ marginTop: 9, flexWrap: 'wrap' }}>
                {topics.slice(0, 6).map((x) => (
                  <Chip
                    key={x.id}
                    label={x.title}
                    selected={!!pairs[x.id]}
                    onPress={() => setPairs((p) => ({ ...p, [x.id]: !p[x.id] }))}
                    style={{ minHeight: 34 }}
                  />
                ))}
              </Row>
            </>
          ) : null}

          <Row align="baseline" gap={10} style={{ marginTop: 18, justifyContent: 'space-between' }}>
            <Label>Studied on</Label>
            <Txt v="label" c={t.c.fnt} style={{ opacity: 0.8, textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
              {relativePast(ago)}
            </Txt>
          </Row>

          <Row gap={3} style={{ marginTop: 8, backgroundColor: t.c.sunk, borderRadius: radius.input, padding: 3 }}>
            <Press
              scale={0.94}
              onPress={() => setAgo((n) => Math.min(365, n + 1))}
              accessibilityLabel="A day earlier"
              style={{ width: 42, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
            >
              <Back size={14} color={t.c.mut} />
            </Press>
            <View
              style={{
                flex: 1,
                height: 40,
                borderRadius: 10,
                backgroundColor: t.c.surf,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt v="secondary" style={{ fontWeight: '600', fontSize: 14 }}>
                {formatShort(studiedOn)}
              </Txt>
            </View>
            <Press
              scale={0.94}
              disabled={ago === 0}
              onPress={() => setAgo((n) => Math.max(0, n - 1))}
              accessibilityLabel="A day later"
              style={{
                width: 42,
                height: 40,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: ago > 0 ? 1 : 0.3,
              }}
            >
              <Forward size={14} color={t.c.mut} />
            </Press>
          </Row>

          <Row gap={6} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {[
              ['Today', 0],
              ['Yesterday', 1],
              ['A week ago', 7],
              ['A month ago', 30],
            ].map(([label, value]) => (
              <Chip
                key={label as string}
                label={label as string}
                selected={ago === value}
                onPress={() => setAgo(value as number)}
                style={{ minHeight: 32, paddingHorizontal: 11 }}
              />
            ))}
          </Row>

          {ago > 0 ? (
            <Disclose>
              <View style={{ marginTop: 10, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: t.c.ambT }}>
                <Txt v="secondary" c={t.c.amb} style={{ lineHeight: 19 }}>
                  {ago === 1
                    ? 'Recorded against yesterday. The first review lands a day earlier than it would today.'
                    : `Recorded against ${formatShort(studiedOn)}. ${ago} days of the first gap have already passed, so it may be due immediately.`}
                </Txt>
              </View>
            </Disclose>
          ) : null}

          <PrimaryButton
            label={saved ? 'Logged — scheduled' : title.trim() ? `Log and schedule · ${preview}` : 'Log this topic'}
            tone={saved ? 'done' : 'accent'}
            disabled={!title.trim() && !saved}
            onPress={commit}
            style={{ marginTop: 20 }}
          />
        </Card>
      </View>

      <Row align="baseline" style={{ marginTop: 26, justifyContent: 'space-between' }}>
        <Label>Logged today</Label>
        <Txt v="label" c={t.c.fnt} style={{ opacity: 0.8, textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
          {loggedToday.length ? `${loggedToday.length} ${loggedToday.length === 1 ? 'topic' : 'topics'}` : 'Nothing yet'}
        </Txt>
      </Row>

      <View style={{ marginTop: 10, gap: 12 }}>
        {loggedToday.map((entry, i) => {
          const topic = doc.topics.find((x) => x.id === entry.topic_id);
          const owner = doc.skills.find((s) => s.id === entry.skill_id);
          if (!topic || !owner) return null;
          return (
            <View key={entry.id}>
              <Card>
                <Row gap={9}>
                  <Dot color={t.hue(owner.hue_index)} />
                  <Txt v="cardTitle" style={{ flex: 1 }} numberOfLines={1}>
                    {topic.title}
                  </Txt>
                  <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '600' }}>
                    {daysBetween(day, topic.due_on) <= 0 ? 'due now' : inWords(daysBetween(day, topic.due_on))}
                  </Txt>
                </Row>
                <Txt v="secondary" c={t.c.mut} style={{ marginTop: 4, lineHeight: 18 }}>
                  {owner.name} · {entry.sub_skill || 'No sub-skill'}
                </Txt>
                {entry.flags.length ? (
                  <Row gap={6} style={{ marginTop: 11, flexWrap: 'wrap' }}>
                    {entry.flags.map((f) => (
                      <View
                        key={f}
                        style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: t.c.sunk }}
                      >
                        <Txt v="secondary" c={t.c.mut}>
                          {f}
                        </Txt>
                      </View>
                    ))}
                  </Row>
                ) : null}
              </Card>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}
