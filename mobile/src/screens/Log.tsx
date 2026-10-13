import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDays, backIn, daysBetween, formatShort, inWords, relativePast } from '../engine/dates';
import { GENRE_EXAMPLE, methodFor } from '../engine/genres';
import { committed } from '../ui/feedback';
import { daysEarly, needsEncoding, parseSyllabus } from '../engine/intake';
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
  Segmented,
  TextButton,
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
  const [mode, setMode] = useState<'one' | 'list'>('one');
  const [list, setList] = useState('');
  const [cue, setCue] = useState('');
  const [answer, setAnswer] = useState('');
  const [encoding, setEncoding] = useState('');
  const [cardOpen, setCardOpen] = useState(false);
  const [anyway, setAnyway] = useState(false);

  const skill = skills.find((s) => s.id === skillId) ?? skills[0];
  const studiedOn = addDays(day, -ago);
  // Flashcard genres are cards by nature; everywhere else a card is optional.
  const deck = skill?.genre === 'language' || skill?.genre === 'memorization';

  const topics = useMemo(
    () => doc.topics.filter((x) => !x.archived_at && x.skill_id === skill?.id),
    [doc.topics, skill?.id],
  );

  const existing = useMemo(
    () => topics.find((x) => x.title.trim().toLowerCase() === title.trim().toLowerCase()),
    [title, topics],
  );

  const parsed = useMemo(() => parseSyllabus(list), [list]);
  const fresh = useMemo(() => {
    const known = new Set(topics.map((x) => x.title.trim().toLowerCase()));
    return parsed.filter((x) => !known.has(x.toLowerCase()));
  }, [parsed, topics]);

  // A new memorization fact needs an encoding; one already tracked has had its chance.
  const missingEncoding = !!skill && !existing && needsEncoding(skill.genre, encoding);
  const early = existing ? daysEarly(existing, studiedOn) : 0;
  const blockedEarly = early > 0 && !anyway;

  const loggedToday = doc.log_entries
    .filter((e) => e.studied_on === day)
    .slice()
    .reverse();

  /** The promise on the button: exactly what the schedule is about to do. */
  const preview = useMemo(() => {
    if (!skill) return '';
    const days = existing
      ? applyLog(existing, skill.genre, studiedOn, shaky, skill.calibration).interval_days
      : firstInterval(skill.genre, shaky, skill.calibration);
    const left = days - ago;
    return left <= 0 ? 'due now' : backIn(left);
  }, [ago, existing, shaky, skill, studiedOn]);

  const listPreview = useMemo(() => {
    if (!skill) return '';
    const left = firstInterval(skill.genre, false, skill.calibration) - ago;
    return left <= 0 ? 'due now' : backIn(left);
  }, [ago, skill]);

  const reset = () => {
    setTitle('');
    setSub('');
    setCue('');
    setAnswer('');
    setEncoding('');
    setCardOpen(false);
    setShaky(false);
    setPairs({});
    setAgo(0);
    setAnyway(false);
  };

  const commit = () => {
    if (!skill || !title.trim() || missingEncoding || blockedEarly) return;
    const topic = store.logStudy({
      skillId: skill.id,
      topicId: existing?.id ?? null,
      title,
      subSkill: sub,
      feltShaky: shaky,
      studiedOn,
      confusableWith: Object.keys(pairs).filter((k) => pairs[k]),
      cue,
      answer,
      encoding,
    });
    committed();
    setSaved(topic.title);
    reset();
  };

  const commitList = () => {
    if (!skill || !fresh.length) return;
    const n = store.logMany(skill.id, fresh, studiedOn);
    committed();
    setSaved(`${n} ${n === 1 ? 'topic' : 'topics'}`);
    setList('');
    setAgo(0);
  };

  const listBlocked = skill?.genre === 'memorization';

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
            <Segmented
              options={[
                { key: 'one', label: 'One topic' },
                { key: 'list', label: 'Paste a list' },
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setSaved(null);
              }}
            />
          </View>

          {mode === 'list' ? (
            <View style={{ marginTop: 16 }}>
              <Label>Syllabus</Label>
              {listBlocked ? (
                <Txt v="secondary" c={t.c.mut} style={{ marginTop: 8, lineHeight: 19 }}>
                  Memorization facts go in one at a time. Each needs an encoding — a mnemonic, an image, a chunking —
                  before it is scheduled, because drilling an unencoded fact is the slowest way to learn it.
                </Txt>
              ) : (
                <>
                  <View style={{ marginTop: 8 }}>
                    <Field
                      value={list}
                      onChangeText={(v) => {
                        setList(v);
                        setSaved(null);
                      }}
                      placeholder={'1. Kinematics\n2. Forces\n2.1 Newton’s laws'}
                      multiline
                      autoCapitalize="none"
                    />
                  </View>
                  <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 7, lineHeight: 18 }}>
                    One topic per line. Numbering and bullets come off; anything already tracked is skipped.
                  </Txt>
                  {parsed.length ? (
                    <View style={{ marginTop: 12, gap: 4 }}>
                      {fresh.slice(0, 6).map((x) => (
                        <Row key={x} gap={8}>
                          <Dot color={t.hue(skill.hue_index)} size={6} />
                          <Txt v="secondary" numberOfLines={1} style={{ flex: 1 }}>
                            {x}
                          </Txt>
                        </Row>
                      ))}
                      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 4 }}>
                        {[
                          fresh.length > 6 ? `and ${fresh.length - 6} more` : null,
                          parsed.length > fresh.length ? `${parsed.length - fresh.length} already tracked` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Txt>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {mode === 'one' ? (
          <>
          <View style={{ marginTop: 18 }}>
            <Label>Topic</Label>
            <View style={{ marginTop: 8 }}>
              <Field
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setSaved(null);
                  setAnyway(false);
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

          {deck || cardOpen ? (
            <Row gap={10} style={{ marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Field label="Cue" value={cue} onChangeText={setCue} placeholder={existing?.cue ?? 'The prompt'} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Answer" value={answer} onChangeText={setAnswer} placeholder={existing?.answer ?? 'Hidden until revealed'} />
              </View>
            </Row>
          ) : (
            <TextButton
              label="Add a cue and answer"
              color={t.c.acc}
              onPress={() => setCardOpen(true)}
              style={{ alignItems: 'flex-start', marginTop: 4 }}
            />
          )}

          {skill.genre === 'memorization' ? (
            <View style={{ marginTop: 16 }}>
              <Field
                label="Encoding"
                hint={existing ? (existing.encoding ? 'Kept unless changed' : 'Optional') : 'Required'}
                value={encoding}
                onChangeText={setEncoding}
                placeholder={existing?.encoding ?? 'A mnemonic, an image, a chunking'}
              />
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 7, lineHeight: 18 }}>
                How you will remember it. Repeating an unencoded fact is the slowest way there is to learn it, so a new one
                is not scheduled without this.
              </Txt>
            </View>
          ) : null}

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
              onPress={() => {
                setAgo((n) => Math.min(365, n + 1));
                setAnyway(false);
              }}
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
              onPress={() => {
                setAgo((n) => Math.max(0, n - 1));
                setAnyway(false);
              }}
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
                onPress={() => {
                  setAgo(value as number);
                  setAnyway(false);
                }}
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

          {mode === 'one' && existing && early > 0 ? (
            <Disclose>
              <View style={{ marginTop: 14, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, backgroundColor: t.c.ambT }}>
                <Txt v="secondary" c={t.c.amb} style={{ lineHeight: 19 }}>
                  {`Not due for ${early === 1 ? 'another day' : `${early} days`}. Drilling it now buys fluency you already have and spends the gap that makes the next review work.`}
                </Txt>
                {anyway ? (
                  <Txt v="secondary" c={t.c.amb} style={{ marginTop: 6, fontWeight: '600' }}>
                    Overridden — it will be logged.
                  </Txt>
                ) : (
                  <TextButton label="Log it anyway" color={t.c.amb} onPress={() => setAnyway(true)} style={{ alignItems: 'flex-start' }} />
                )}
              </View>
            </Disclose>
          ) : null}

          {mode === 'one' ? (
            <PrimaryButton
              label={
                saved
                  ? 'Logged — scheduled'
                  : !title.trim()
                    ? 'Log this topic'
                    : missingEncoding
                      ? 'Add an encoding to schedule it'
                      : blockedEarly
                        ? `Not due for ${early === 1 ? 'another day' : `${early} days`}`
                        : `Log and schedule · ${preview}`
              }
              tone={saved ? 'done' : 'accent'}
              disabled={!saved && (!title.trim() || missingEncoding || blockedEarly)}
              onPress={commit}
              style={{ marginTop: 20 }}
            />
          ) : (
            <PrimaryButton
              label={
                saved
                  ? `Logged ${saved}`
                  : fresh.length
                    ? `Log ${fresh.length} ${fresh.length === 1 ? 'topic' : 'topics'} · ${listPreview}`
                    : 'Paste a list to log it'
              }
              tone={saved ? 'done' : 'accent'}
              disabled={!saved && (listBlocked || !fresh.length)}
              onPress={commitList}
              style={{ marginTop: 20 }}
            />
          )}
          {saved ? (
            <TextButton label="Back to Today" color={t.c.acc} onPress={() => nav.go({ name: 'today' })} style={{ marginTop: 4 }} />
          ) : null}
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
