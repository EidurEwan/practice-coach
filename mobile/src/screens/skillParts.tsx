import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { bandFor, gapLabel } from '../engine/bands';
import { daysBetween, formatWithYear, inWords, parseDay } from '../engine/dates';
import { curveFor, FORMAT_LADDER, Genre, GENRE_LABEL, GENRES, isPerItem, PhysicalKind } from '../engine/genres';
import { needsEncoding } from '../engine/intake';
import { calibrationFrom, RecallAnswer } from '../engine/schedule';
import { Skill, Topic } from '../engine/types';
import { useStore } from '../store/store';
import { bandColor } from '../theme/colors';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { DayPicker } from '../ui/DayPicker';
import { Chevron } from '../ui/icons';
import { Chip, Disclose, Field, Label, Press, PrimaryButton, Row, Segmented, TextButton, Txt } from '../ui/primitives';
import { Sheet } from '../ui/shell';

/* --------------------------------------------------------- skill context */

/**
 * The optional half of making a skill: its level, the date it is working
 * towards, and the forgetting-rate diagnostic. Shared by the Skills sheet and
 * onboarding so both offer the same thing.
 */
export function SkillContext({
  genre,
  level,
  onLevel,
  target,
  onTarget,
  calibration,
  onCalibration,
}: {
  genre: Genre;
  level: string;
  onLevel: (v: string) => void;
  target: string | null;
  onTarget: (d: string) => void;
  calibration: number;
  onCalibration: (f: number) => void;
}) {
  const t = useTheme();
  const [picking, setPicking] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const today = useStore().day;

  return (
    <>
      <View style={{ marginTop: 16 }}>
        <Label>Level and target date — optional</Label>
        <View style={{ marginTop: 8 }}>
          <Field value={level} onChangeText={onLevel} placeholder="HL, A-Level, Grade 6" />
        </View>
        <Press
          onPress={() => setPicking((p) => !p)}
          accessibilityState={{ expanded: picking }}
          style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}
        >
          <Txt style={{ flex: 1 }}>Target date</Txt>
          <Txt c={t.c.acc}>{target ? formatWithYear(target) : 'Not set'}</Txt>
        </Press>
        {picking ? (
          <Disclose>
            <DayPicker
              value={target}
              min={today}
              onChange={(d) => {
                onTarget(d);
                setPicking(false);
              }}
            />
          </Disclose>
        ) : null}
      </View>

      <View style={{ marginTop: 12 }}>
        <Press
          scale={1}
          onPress={() => setDiagnosing((d) => !d)}
          accessibilityState={{ expanded: diagnosing }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}
        >
          <Txt style={{ flex: 1 }}>Forgetting-rate diagnostic</Txt>
          <Txt c={calibration === 1 ? t.c.fnt : t.c.tx}>{calibration === 1 ? 'Optional' : `×${calibration.toFixed(2)}`}</Txt>
          <Chevron open={diagnosing} size={12} color={t.c.fnt} />
        </Press>
        {diagnosing ? (
          <Disclose style={{ marginTop: 6 }}>
            <Diagnostic
              genre={genre}
              current={calibration}
              onApply={(f) => {
                onCalibration(f);
                setDiagnosing(false);
              }}
            />
          </Disclose>
        ) : null}
      </View>
    </>
  );
}

/* ------------------------------------------------------------ diagnostic */

const AGO = [2, 4, 7, 14, 30];

type Answer = { daysAgo: number; recall: RecallAnswer };

/**
 * The forgetting-rate diagnostic: up to three real recall attempts, each at
 * something learned a known number of days ago and not looked at since. The
 * factor and what it does to the curve update as the answers change, so the
 * consequence is visible before it is applied.
 */
export function Diagnostic({
  genre,
  current,
  onApply,
}: {
  genre: Genre;
  current: number;
  onApply: (factor: number) => void;
}) {
  const t = useTheme();
  const [answers, setAnswers] = useState<Answer[]>([{ daysAgo: 7, recall: 'partly' }]);
  const factor = calibrationFrom(answers);
  const base = curveFor(genre).slice(0, 5);
  const scaled = base.map((d) => Math.max(1, Math.round(d * factor)));
  const set = (i: number, patch: Partial<Answer>) => setAnswers((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <View>
      <Txt v="secondary" c={t.c.mut} style={{ lineHeight: 19 }}>
        Think of something from this subject you learned once and have not looked at since. Try to recall it now —
        honestly, before checking — then say how it went. Up to three makes the answer steadier.
      </Txt>

      {answers.map((a, i) => (
        <View key={i} style={{ marginTop: 14, padding: 12, borderRadius: radius.input, backgroundColor: t.c.sunk }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>{`Attempt ${i + 1}`}</Label>
            {answers.length > 1 ? (
              <Press onPress={() => setAnswers((x) => x.filter((_, k) => k !== i))} style={{ paddingVertical: 4 }}>
                <Txt v="secondary" c={t.c.fnt}>
                  Remove
                </Txt>
              </Press>
            ) : null}
          </Row>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 8 }}>
            Learned this many days ago
          </Txt>
          <Row gap={6} style={{ marginTop: 6, flexWrap: 'wrap' }}>
            {AGO.map((d) => (
              <Chip key={d} label={`${d}`} selected={a.daysAgo === d} onPress={() => set(i, { daysAgo: d })} style={{ minHeight: 34, minWidth: 44 }} />
            ))}
          </Row>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 10 }}>
            Did it come back?
          </Txt>
          <View style={{ marginTop: 6 }}>
            <Segmented
              value={a.recall}
              onChange={(recall) => set(i, { recall })}
              height={34}
              options={[
                { key: 'no', label: 'No' },
                { key: 'partly', label: 'Partly' },
                { key: 'yes', label: 'Yes, fully' },
              ]}
            />
          </View>
        </View>
      ))}

      {answers.length < 3 ? (
        <TextButton label="Add another attempt" onPress={() => setAnswers((a) => [...a, { daysAgo: 7, recall: 'partly' }])} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
      ) : null}

      <View style={{ marginTop: 12, padding: 14, borderRadius: radius.input, borderWidth: 1, borderColor: t.c.line }}>
        <Row style={{ justifyContent: 'space-between' }} align="baseline">
          <Txt v="rowTitle">{`×${factor.toFixed(2)}`}</Txt>
          <Txt v="secondary" c={t.c.fnt}>
            {factor === 1 ? 'about average' : factor > 1 ? `gaps ${Math.round((factor - 1) * 100)}% longer` : `gaps ${Math.round((1 - factor) * 100)}% shorter`}
          </Txt>
        </Row>
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 6 }}>
          {`${base.join(' → ')} days`}
        </Txt>
        <Txt v="secondary" c={t.c.tx} style={{ marginTop: 2 }}>
          {`${scaled.join(' → ')} days`}
        </Txt>
      </View>

      <PrimaryButton
        label={factor === current ? `Already ×${current.toFixed(2)}` : `Use ×${factor.toFixed(2)}`}
        disabled={factor === current}
        onPress={() => onApply(factor)}
        style={{ marginTop: 12 }}
      />
      {current !== 1 ? <TextButton label="Back to ×1.00" onPress={() => onApply(1)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------- edit sheet */

/**
 * Everything about a skill that can change after it is made. A new target
 * date starts a new season, which also lifts a pause.
 */
export function EditSkillSheet({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  return (
    <Sheet open={!!skill} onClose={onClose}>
      {skill ? <EditSkillBody key={skill.id} skill={skill} onClose={onClose} /> : null}
    </Sheet>
  );
}

function EditSkillBody({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const t = useTheme();
  const store = useStore();
  const [name, setName] = useState(skill.name);
  const [level, setLevel] = useState(skill.level ?? '');
  const [target, setTarget] = useState<string | null>(skill.target_date);
  const [genre, setGenre] = useState<Genre>(skill.genre);
  const [kind, setKind] = useState<PhysicalKind>(skill.physical_kind ?? 'closed');
  const [calibration, setCalibration] = useState(skill.calibration);
  const [picking, setPicking] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);

  const save = () => {
    store.updateSkill(skill.id, {
      name,
      level,
      target_date: target,
      genre,
      physical_kind: genre === 'physical' ? kind : null,
      calibration,
    });
    onClose();
  };

  return (
    <View>
      <Txt v="sheetTitle">Edit skill</Txt>

      <View style={{ marginTop: 16, gap: 12 }}>
        <View>
          <Label>Name</Label>
          <View style={{ marginTop: 6 }}>
            <Field value={name} onChangeText={setName} placeholder={skill.name} />
          </View>
        </View>
        <View>
          <Label>Level</Label>
          <View style={{ marginTop: 6 }}>
            <Field value={level} onChangeText={setLevel} placeholder="HL, A-Level, Grade 6 — optional" />
          </View>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <Row style={{ justifyContent: 'space-between' }} align="baseline">
          <Label>Target date</Label>
          <Press onPress={() => setPicking((p) => !p)} style={{ paddingVertical: 4 }}>
            <Txt c={t.c.acc}>{target ? formatWithYear(target) : 'Not set'}</Txt>
          </Press>
        </Row>
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 4, lineHeight: 18 }}>
          The exam this skill works towards. Practice turns exam-format in the weeks before it, and stops once it has
          passed — nothing is deleted.
        </Txt>
        {picking ? (
          <Disclose style={{ marginTop: 10 }}>
            <DayPicker
              value={target}
              onChange={(d) => {
                setTarget(d);
                setPicking(false);
              }}
            />
            {target ? <TextButton label="No target date" onPress={() => { setTarget(null); setPicking(false); }} /> : null}
          </Disclose>
        ) : null}
        {target && target !== skill.target_date && skill.paused_at ? (
          <Txt v="secondary" c={t.c.acc} style={{ marginTop: 6 }}>
            A new date starts a new season, so this also lifts the pause.
          </Txt>
        ) : null}
      </View>

      <View style={{ marginTop: 16 }}>
        <Label>Genre</Label>
        <Row gap={7} style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {GENRES.map((g) => (
            <Chip key={g} label={GENRE_LABEL[g]} selected={genre === g} onPress={() => setGenre(g)} style={{ minHeight: 34 }} />
          ))}
        </Row>
        {genre === 'physical' ? (
          <View style={{ marginTop: 10 }}>
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { key: 'closed', label: 'Closed' },
                { key: 'open', label: 'Open' },
              ]}
            />
          </View>
        ) : null}
        {genre !== skill.genre ? (
          <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 18 }}>
            The new curve and method apply from each topic's next rating. Dates already set stay where they are.
          </Txt>
        ) : null}
      </View>

      <View style={{ marginTop: 16 }}>
        <Press
          scale={1}
          onPress={() => setDiagnosing((d) => !d)}
          accessibilityState={{ expanded: diagnosing }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}
        >
          <Label style={{ flex: 1 }}>Forgetting rate</Label>
          <Txt c={t.c.tx} style={{ fontWeight: '600' }}>{`×${calibration.toFixed(2)}`}</Txt>
          <Chevron open={diagnosing} size={12} color={t.c.fnt} />
        </Press>
        {diagnosing ? (
          <Disclose style={{ marginTop: 6 }}>
            <Diagnostic
              genre={genre}
              current={calibration}
              onApply={(f) => {
                setCalibration(f);
                setDiagnosing(false);
              }}
            />
          </Disclose>
        ) : (
          <Txt v="secondary" c={t.c.fnt} style={{ lineHeight: 18 }}>
            {calibration === 1 ? 'Not measured — the standard curve. Open to take the two-minute diagnostic.' : 'Set by the diagnostic. Open to take it again.'}
          </Txt>
        )}
      </View>

      <PrimaryButton label="Save" onPress={save} disabled={!name.trim()} style={{ marginTop: 20 }} />
      <TextButton label="Cancel" onPress={onClose} style={{ marginTop: 6 }} />
    </View>
  );
}

/* ----------------------------------------------------------- topic detail */

/**
 * One topic, opened: where it stands in the schedule, and its words —
 * title, the sub-skill that keeps failing, a cue and answer, the encoding.
 */
export function TopicDetail({ topic, skill, onDone }: { topic: Topic; skill: Skill; onDone: () => void }) {
  const t = useTheme();
  const store = useStore();
  const { day, doc } = store;
  const [title, setTitle] = useState(topic.title);
  const [sub, setSub] = useState(topic.sub_skill ?? '');
  const [cue, setCue] = useState(topic.cue ?? '');
  const [answer, setAnswer] = useState(topic.answer ?? '');
  const [encoding, setEncoding] = useState(topic.encoding ?? '');

  const reviews = useMemo(() => doc.reviews.filter((r) => r.topic_id === topic.id && r.rating !== 'pushed').length, [doc.reviews, topic.id]);
  const band = bandFor(topic.interval_days);
  const late = daysBetween(topic.due_on, day);
  const dirty =
    title !== topic.title ||
    sub !== (topic.sub_skill ?? '') ||
    cue !== (topic.cue ?? '') ||
    answer !== (topic.answer ?? '') ||
    encoding !== (topic.encoding ?? '');

  const stats: [string, string][] = [
    ['Next', late > 0 ? `${late}d overdue` : late === 0 ? 'Today' : `${formatWithYear(topic.due_on, parseDay(day))} · ${inWords(-late)}`],
    ['Gap', gapLabel(topic.interval_days)],
    ['Status', topic.state === 'new' ? 'New' : band.label],
    ['Reviews', String(reviews)],
    ['Format', FORMAT_LADDER[topic.format_rung]?.name ?? '—'],
    isPerItem(skill.genre) ? ['Ease', topic.ease.toFixed(2)] : ['Rung', String(topic.repetition + 1)],
  ];
  if (topic.penalty < 1) stats.push(['Penalty', `×${topic.penalty.toFixed(2)}`]);

  return (
    <Disclose style={{ paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
        {stats.map(([k, v]) => (
          <View key={k} style={{ width: '33.3%' }}>
            <Txt v="badge" c={t.c.fnt} style={{ fontWeight: '400' }}>
              {k}
            </Txt>
            <Txt v="secondary" c={k === 'Status' ? bandColor(band, t.c) : t.c.tx} style={{ fontWeight: '600', marginTop: 1 }}>
              {v}
            </Txt>
          </View>
        ))}
      </View>

      {needsEncoding(skill.genre, encoding) ? (
        <View style={{ marginTop: 12, padding: 10, borderRadius: radius.input, backgroundColor: t.c.ambT }}>
          <Txt v="secondary" c={t.c.amb} style={{ lineHeight: 18 }}>
            No encoding yet. A memorised fact sticks far better hung on something — a mnemonic, an image, a pattern.
          </Txt>
        </View>
      ) : null}

      <View style={{ marginTop: 12, gap: 10 }}>
        <Field value={title} onChangeText={setTitle} placeholder="Title" />
        <Field value={sub} onChangeText={setSub} placeholder="Sub-skill that keeps failing — optional" />
        <Field value={cue} onChangeText={setCue} placeholder="Cue — the prompt, for a card" />
        <Field value={answer} onChangeText={setAnswer} placeholder="Answer" />
        <Field
          value={encoding}
          onChangeText={setEncoding}
          placeholder={skill.genre === 'memorization' ? 'Encoding — required for a fact' : 'Encoding — a mnemonic or image, optional'}
        />
      </View>

      <Row gap={8} style={{ marginTop: 12 }}>
        <PrimaryButton
          label="Save"
          disabled={!dirty || !title.trim()}
          style={{ flex: 1 }}
          onPress={() => {
            store.updateTopic(topic.id, { title, sub_skill: sub, cue, answer, encoding });
            onDone();
          }}
        />
        <Press
          onPress={() => {
            store.archiveTopic(topic.id);
            onDone();
          }}
          style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: radius.button, justifyContent: 'center', backgroundColor: t.c.redT }}
        >
          <Txt c={t.c.red} style={{ fontWeight: '600' }}>
            Archive
          </Txt>
        </Press>
      </Row>
    </Disclose>
  );
}

/** A skill's archived topics, each with a way back. */
export function ArchivedTopics({ skill }: { skill: Skill }) {
  const t = useTheme();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const archived = store.doc.topics.filter((x) => x.skill_id === skill.id && x.archived_at);
  if (!archived.length) return null;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: t.c.line }}>
      <Press scale={1} onPress={() => setOpen((o) => !o)} accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12 }}>
        <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '500' }}>
          {`${open ? 'Hide' : 'Show'} ${archived.length} archived ${archived.length === 1 ? 'topic' : 'topics'}`}
        </Txt>
        <Chevron open={open} size={12} color={t.c.acc} />
      </Press>
      {open
        ? archived.map((x) => (
            <Row key={x.id} gap={10} style={{ paddingVertical: 8 }}>
              <Txt style={{ flex: 1, fontSize: 14 }} c={t.c.mut} numberOfLines={1}>
                {x.title}
              </Txt>
              <Press onPress={() => store.restoreTopic(x.id)} style={{ paddingVertical: 4 }}>
                <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '600' }}>
                  Restore
                </Txt>
              </Press>
            </Row>
          ))
        : null}
    </View>
  );
}

/** "HL · until Fri 21 May 2027", "Paused", "Season over" — the skill's state in a line. */
export function skillStatus(skill: Skill, day: string): { text: string; badge: string | null } {
  const parts: string[] = [];
  if (skill.level) parts.push(skill.level);
  if (skill.target_date) parts.push(skill.target_date < day ? `ended ${formatWithYear(skill.target_date)}` : `until ${formatWithYear(skill.target_date)}`);
  if (skill.calibration !== 1) parts.push(`×${skill.calibration.toFixed(2)} gaps`);
  const badge = skill.paused_at ? 'Paused' : skill.target_date && skill.target_date < day ? 'Season over' : null;
  return { text: parts.join(' · '), badge };
}

