import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { backIn, inWords } from '../engine/dates';
import { curveName, detectGenre, Genre, GENRE_EXAMPLE, GENRE_LABEL, GENRES, PhysicalKind } from '../engine/genres';
import { curveBars } from '../engine/recall';
import { firstInterval } from '../engine/schedule';
import { useNav } from '../nav/router';
import { useStore } from '../store/store';
import { useAuth } from '../sync/auth';
import { useTheme } from '../theme/theme';
import { radius, type } from '../theme/tokens';
import { CurveBars, DecayChart, SpacedChart } from '../ui/charts';
import { AppleMark, Back, Check, GoogleMark } from '../ui/icons';
import {
  Badge,
  Card,
  Chip,
  Disclose,
  Field,
  Label,
  Press,
  PrimaryButton,
  Row,
  Segmented,
  TextButton,
  Txt,
} from '../ui/primitives';
import { ACCOUNTS_ENABLED, ACCOUNTS_SOON_BODY } from '../sync/availability';
import { DEVICE } from '../ui/copy';
import { Logo, Screen } from '../ui/shell';

const COPY: [string, string][] = [
  [
    'Everything you learn starts leaking',
    'Ebbinghaus measured it in 1885 and it has held up since. Recall decays fast at first, then slowly — and the decay starts the moment you stop.',
  ],
  [
    'Reviewing at the right moment flattens it',
    'Each well-timed review resets recall and makes the next decline shallower. Review too early and you learn nothing new; too late and you are relearning from scratch.',
  ],
  [
    'This is what Interval does about it',
    'You study away from the phone. Interval only needs to know what you covered and how the reviews went — it does the timing.',
  ],
  ['Register with Interval', ''],
  [
    'Different material forgets differently',
    'A maths proof and a vocabulary card do not behave the same way, so Interval picks the curve and the practice method from what kind of skill it is.',
  ],
  ['Add your skills', 'The genre is detected from the name, and that sets the curve.'],
  ['Add the first thing', 'Pick a skill and name one topic you have already studied. It gets a date immediately.'],
  [
    "That's the setup",
    'From here you log what you study and rate what comes back. The schedule maintains itself.',
  ],
];

export function OnboardingScreen({ step }: { step: number }) {
  const nav = useNav();
  const store = useStore();

  const go = (next: number) => nav.go({ name: 'onboarding', step: next });
  const finish = () => {
    store.updateSettings({ onboarded: true });
    nav.go({ name: 'today' });
  };

  if (step === 4) return <RegisterGate onNext={() => go(5)} onBack={() => go(3)} />;

  return (
    <Steps
      step={step}
      onNext={() => (step === 8 ? finish() : go(step + 1))}
      onBack={() => go(step - 1)}
      // The last step's secondary action says "Back to the top", so it goes
      // there. Every earlier step skips setup, which finishes.
      onSkip={() => (step === 8 ? go(1) : finish())}
    />
  );
}

/* -------------------------------------------------------------- progress */

function Progress({ step }: { step: number }) {
  const t = useTheme();
  const within = step <= 4 ? step : step - 4;
  return (
    <Row gap={5}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: t.c.sunk, overflow: 'hidden' }}>
          <View style={{ height: '100%', borderRadius: radius.pill, backgroundColor: t.c.acc, width: i <= within ? '100%' : '0%' }} />
        </View>
      ))}
    </Row>
  );
}

/* ----------------------------------------------------------------- steps */

function Steps({
  step,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [title, body] = COPY[step - 1];

  return (
    <Screen scroll={false} bottomPadding={30} style={{ paddingTop: insets.top + 18 }}>
      <Progress step={step} />

      <View style={{ height: 28, justifyContent: 'center', marginTop: 18 }}>
        {step > 1 ? (
          <Press
            onPress={onBack}
            accessibilityLabel="Back"
            style={{ width: 28, height: 28, marginLeft: -6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}
          >
            <Back size={16} color={t.c.mut} />
          </Press>
        ) : null}
      </View>

      <Txt v="screenTitle" style={{ marginTop: 12, lineHeight: 34 }}>
        {title}
      </Txt>
      <Txt c={t.c.mut} style={{ marginTop: 10, lineHeight: 24 }}>
        {body}
      </Txt>

      <View style={{ flex: 1, minHeight: 0, justifyContent: 'center', overflow: 'hidden' }}>
        {step === 1 ? <DecayStep /> : null}
        {step === 2 ? <SpacingStep /> : null}
        {step === 3 ? <HowItWorksStep /> : null}
        {step === 5 ? <GenreStep /> : null}
        {step === 6 ? <AddSkillsStep /> : null}
        {step === 7 ? <FirstTopicStep /> : null}
        {step === 8 ? <SummaryStep /> : null}
      </View>

      <View style={{ gap: 8 }}>
        <PrimaryButton label={step === 8 ? 'Start' : 'Continue'} onPress={onNext} />
        <TextButton label={step === 8 ? 'Back to the top' : 'Skip setup'} onPress={onSkip} />
      </View>
    </Screen>
  );
}

/* ----------------------------------------------------------- step bodies */

function ChartCard({ children }: { children: React.ReactNode }) {
  return <Card padding={18} style={{ paddingTop: 20 }}>{children}</Card>;
}

/** The dashed line across the top is 100%; the plot is what is left of it. */
function Ceiling({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View>
      {children}
      <Txt
        v="badge"
        c={t.c.fnt}
        style={{ position: 'absolute', top: -2, left: 0, backgroundColor: t.c.surf, paddingRight: 5 }}
      >
        100%
      </Txt>
    </View>
  );
}

function DecayStep() {
  const t = useTheme();
  return (
    <ChartCard>
      <Row align="baseline" style={{ justifyContent: 'space-between' }}>
        <Label>What you keep</Label>
        <Txt v="label" c={t.c.fnt} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
          after one study session
        </Txt>
      </Row>
      <View style={{ marginTop: 14 }}>
        <Ceiling>
          <DecayChart stability={5.5} span={7} color={t.c.red} />
        </Ceiling>
      </View>
      <Row style={{ marginTop: 6, justifyContent: 'space-between' }}>
        {['now', 'day 2', 'day 4', 'day 7'].map((a) => (
          <Txt key={a} v="badge" c={t.c.fnt} style={{ fontWeight: '400' }}>
            {a}
          </Txt>
        ))}
      </Row>
      <Row align="baseline" gap={8} style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.c.line }}>
        <Txt c={t.c.red} style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.46 }}>
          72%
        </Txt>
        <Txt v="secondary" c={t.c.mut} style={{ flex: 1, lineHeight: 19 }}>
          gone within a week, if you never look at it again
        </Txt>
      </Row>
    </ChartCard>
  );
}

function SpacingStep() {
  const t = useTheme();
  const [mode, setMode] = useState<'without' | 'with'>('with');
  const spaced = mode === 'with';

  return (
    <ChartCard>
      <Segmented
        value={mode}
        onChange={setMode}
        height={34}
        options={[
          { key: 'without', label: 'No reviews' },
          { key: 'with', label: 'With Interval' },
        ]}
      />
      <View style={{ marginTop: 16 }}>
        <Ceiling>
          {spaced ? <SpacedChart color={t.c.acc} /> : <DecayChart stability={17.5} span={30} color={t.c.red} />}
        </Ceiling>
      </View>
      <Row style={{ marginTop: 6, justifyContent: 'space-between' }}>
        {['now', 'd3', 'd7', 'd16', 'd30'].map((a) => (
          <Txt key={a} v="badge" c={t.c.fnt} style={{ fontWeight: '400' }}>
            {a}
          </Txt>
        ))}
      </Row>
      <Row align="baseline" gap={8} style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.c.line }}>
        <Txt c={spaced ? t.c.acc : t.c.red} style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.46 }}>
          {spaced ? '91%' : '18%'}
        </Txt>
        <Txt v="secondary" c={t.c.mut} style={{ flex: 1, lineHeight: 19 }}>
          {spaced
            ? 'still there after a month, from three short reviews'
            : 'left after a month of not looking at it again'}
        </Txt>
      </Row>
    </ChartCard>
  );
}

function HowItWorksStep() {
  const t = useTheme();
  const rows = [
    ['Log what you covered', 'Two taps after a session. No timers, no testing inside the app.'],
    ['Get a date, not a timetable', 'Each topic comes back on the day its curve says, and only then.'],
    ['Rate it and the date moves', 'Every rating states its consequence before you press it.'],
  ];
  return (
    <>
      <Card padding={0} style={{ paddingHorizontal: 18 }}>
        {rows.map(([label, detail], i) => (
          <Row key={label} gap={13} align="flex-start" style={{ paddingVertical: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.c.line }}>
            <View style={{ width: 26, height: 26, borderRadius: radius.pill, backgroundColor: t.c.accT, alignItems: 'center', justifyContent: 'center' }}>
              <Check color={t.c.acc} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '500', lineHeight: 20 }}>{label}</Txt>
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3, lineHeight: 19 }}>
                {detail}
              </Txt>
            </View>
          </Row>
        ))}
      </Card>
      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 14, lineHeight: 19 }}>
        The work stays yours. Interval only decides when it comes back.
      </Txt>
    </>
  );
}

function GenreStep() {
  const t = useTheme();
  const cards: [string, string, string, number[]][] = [
    ['Reasoning', 'Compressed', 'Interleaved with a second topic — never drilled alone.', [1, 2, 5, 10, 22, 48, 106, 233]],
    ['Language', 'Per-item SM-2', 'Cards plus one sentence of your own.', [1, 3, 7, 16, 35, 70, 154, 339]],
    ['Physical (open)', 'Expanding', 'Variable and reactive from day one.', [1, 3, 7, 16, 35, 70, 154, 339]],
  ];
  const colors = [t.c.acc, t.hue(3), t.hue(5)];

  return (
    <View style={{ gap: 10 }}>
      {cards.map(([name, curve, method, days], i) => (
        <Card key={name} padding={16} style={{ borderRadius: 16, paddingHorizontal: 18 }}>
          <Row gap={9}>
            <Txt v="rowTitle">{name}</Txt>
            <View style={{ flex: 1 }} />
            <Badge text={curve} />
          </Row>
          <Txt v="secondary" c={t.c.mut} style={{ marginTop: 6, lineHeight: 19 }}>
            {method}
          </Txt>
          <View style={{ marginTop: 10 }}>
            <CurveBars heights={curveBars(days)} color={colors[i]} />
          </View>
        </Card>
      ))}
    </View>
  );
}

function AddSkillsStep() {
  const t = useTheme();
  const store = useStore();
  const [name, setName] = useState('');
  const [override, setOverride] = useState<Genre | null>(null);
  const [kind, setKind] = useState<PhysicalKind>('closed');
  const detection = useMemo(() => detectGenre(name), [name]);
  const added = store.doc.skills.filter((s) => !s.archived_at);

  // Detection reads an empty string as "reasoning", so until there is a name
  // there is nothing to have detected — announcing a genre for a blank field
  // is a guess about nothing.
  const typed = name.trim().length > 0;
  const genre = override ?? detection.genre;
  const confidence = override ? 'Set by you' : detection.confidence;
  const guessed = confidence === 'Guessed';

  return (
    <>
      <Card padding={20} style={{ paddingHorizontal: 18 }}>
        <Label>Skill name</Label>
        <View style={{ marginTop: 8 }}>
          <Field value={name} onChangeText={setName} placeholder="Physics HL" />
        </View>

        <View style={{ marginTop: 16, borderRadius: radius.button, padding: 16, backgroundColor: t.c.sunk }}>
          <Row gap={8}>
            <Label>{override ? 'Genre' : 'Detected genre'}</Label>
            <View style={{ flex: 1 }} />
            {typed || override ? (
              <Badge text={confidence} fg={guessed ? t.c.amb : t.c.acc} bg={guessed ? t.c.ambT : t.c.accT} />
            ) : null}
          </Row>
          {typed || override ? (
            <>
              <Txt style={{ marginTop: 8, fontSize: 17, fontWeight: '600', letterSpacing: -0.19 }}>
                {genre === 'physical' ? `Physical (${kind})` : GENRE_LABEL[genre]}
              </Txt>
              <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 4 }}>
                {curveName(genre)}
              </Txt>
            </>
          ) : (
            <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 8, lineHeight: 19 }}>
              Name it and the genre follows — or set it yourself below.
            </Txt>
          )}
        </View>

        {genre === 'physical' && (typed || override) ? (
          <Disclose style={{ marginTop: 16 }}>
            <Label>Closed or open?</Label>
            <View style={{ marginTop: 8 }}>
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { key: 'closed', label: 'Closed' },
                  { key: 'open', label: 'Open' },
                ]}
              />
            </View>
          </Disclose>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <Label>Or set it yourself</Label>
          <Row gap={7} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {GENRES.map((g) => (
              <Chip
                key={g}
                label={GENRE_LABEL[g]}
                selected={(typed || override !== null) && genre === g}
                onPress={() => setOverride(g)}
                style={{ minHeight: 34 }}
              />
            ))}
          </Row>
        </View>

        <PrimaryButton
          label={name.trim() ? `Add ${name.trim()}` : 'Add skill'}
          disabled={!name.trim()}
          style={{ marginTop: 18, minHeight: 48 }}
          onPress={() => {
            store.createSkill({
              name,
              genre,
              physical_kind: genre === 'physical' ? kind : null,
            });
            setName('');
            setOverride(null);
            setKind('closed');
          }}
        />
      </Card>

      {added.length ? (
        <Disclose>
          <Row gap={7} style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {added.map((s) => (
              <Row
                key={s.id}
                gap={7}
                style={{ minHeight: 34, paddingHorizontal: 12, borderRadius: radius.chip, backgroundColor: t.c.grnT }}
              >
                <Check size={13} color={t.c.grn} weight={2.8} />
                <Txt v="secondary" c={t.c.grn} style={{ fontWeight: '500' }}>
                  {s.name}
                </Txt>
              </Row>
            ))}
          </Row>
        </Disclose>
      ) : null}
    </>
  );
}

function FirstTopicStep() {
  const t = useTheme();
  const store = useStore();
  const skills = store.doc.skills.filter((s) => !s.archived_at);
  const [skillId, setSkillId] = useState(skills[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const skill = skills.find((s) => s.id === skillId) ?? skills[0];
  const already = store.doc.topics.some((x) => x.skill_id === skill?.id && x.title === title.trim());

  const note = title.trim()
    ? `"${title.trim()}" will be due ${skill ? inWords(firstInterval(skill.genre, false)) : 'on its curve'}.`
    : 'Whatever you name is scheduled on the curve for its skill.';

  return (
    <Card padding={20} style={{ paddingHorizontal: 18 }}>
      <Label>Skill</Label>
      <Row gap={7} style={{ marginTop: 9, flexWrap: 'wrap' }}>
        {skills.map((s) => (
          <Chip key={s.id} label={s.name} hue={t.hue(s.hue_index)} selected={s.id === skill?.id} onPress={() => setSkillId(s.id)} />
        ))}
        {!skills.length ? (
          <Txt v="secondary" c={t.c.fnt}>
            Add a skill on the step before this one.
          </Txt>
        ) : null}
      </Row>

      <Label style={{ marginTop: 18 }}>Topic</Label>
      <View style={{ marginTop: 8 }}>
        <Field
          value={title}
          onChangeText={setTitle}
          placeholder={GENRE_EXAMPLE[skill?.genre ?? 'reasoning'].topic}
        />
      </View>
      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 12, lineHeight: 19 }}>
        {note}
      </Txt>

      <PrimaryButton
        label={already ? 'Scheduled' : 'Schedule it'}
        tone={already ? 'done' : 'accent'}
        disabled={!title.trim() || !skill}
        style={{ marginTop: 16, minHeight: 48 }}
        onPress={() => {
          if (!skill) return;
          store.logStudy({ skillId: skill.id, title, feltShaky: false, studiedOn: store.day });
        }}
      />
    </Card>
  );
}

function SummaryStep() {
  const t = useTheme();
  const store = useStore();
  const auth = useAuth();
  const skills = store.doc.skills.filter((s) => !s.archived_at).length;
  const topics = store.doc.topics.filter((x) => !x.archived_at);
  const first = topics[0];

  const rows: [string, string][] = [
    [`${skills} ${skills === 1 ? 'skill tracked' : 'skills tracked'}`, 'Each on the curve its genre calls for'],
    [
      first ? `${first.title} scheduled` : 'Nothing scheduled yet',
      first ? `Due ${backIn(first.interval_days).replace('back ', '')}` : 'Log something and it gets a date',
    ],
    [`${store.doc.settings.daily_capacity} things a day`, 'Change the cap any time in settings'],
    auth.signedIn
      ? ['Backed up and syncing', 'Works offline either way — the schedule is computed here']
      : ['Works offline, no account', 'Everything stays on this device'],
  ];

  return (
    <View style={{ gap: 10 }}>
      {rows.map(([label, detail]) => (
        <Card key={label} padding={16} style={{ borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 26, height: 26, borderRadius: radius.pill, backgroundColor: t.c.grnT, alignItems: 'center', justifyContent: 'center' }}>
            <Check color={t.c.grn} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: '500', lineHeight: 20 }}>{label}</Txt>
            <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2, lineHeight: 18 }}>
              {detail}
            </Txt>
          </View>
        </Card>
      ))}
    </View>
  );
}

/* --------------------------------------------------------- register gate */

function RegisterGate({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const t = useTheme();
  const nav = useNav();
  const auth = useAuth();
  const insets = useSafeAreaInsets();

  const attempt = (fn: () => Promise<void>) => () => {
    fn()
      .then(onNext)
      .catch(() => nav.go({ name: 'account', from: 'onboarding', step: 'welcome' }));
  };

  return (
    <Screen scroll={false} bottomPadding={34} style={{ paddingTop: insets.top + 18 }}>
      <Progress step={4} />

      {/* Same back affordance as every other step — this one is not a one-way door. */}
      <View style={{ height: 28, justifyContent: 'center', marginTop: 18 }}>
        <Press
          onPress={onBack}
          accessibilityLabel="Back"
          style={{ width: 28, height: 28, marginLeft: -6, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}
        >
          <Back size={16} color={t.c.mut} />
        </Press>
      </View>

      <Txt style={[type.gateTitle, { marginTop: 12, lineHeight: 37 }]}>
        {ACCOUNTS_ENABLED ? 'Register with ' : 'This is '}
        <Txt style={[type.wordmark, { fontSize: 30, letterSpacing: -0.72 }]}>Interval</Txt>
      </Txt>
      <Txt c={t.c.mut} style={{ marginTop: 10, lineHeight: 23, maxWidth: 320 }}>
        {ACCOUNTS_ENABLED
          ? `Next you set up your skills. An account keeps the schedule when the ${DEVICE} doesn't.`
          : 'Next you set up your skills.'}
      </Txt>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
        <Logo size={92} />
      </View>

      {/*
        Three sign-in buttons that all end in a server error would be the worst
        moment in the app to hit. Until accounts work, the step says so plainly
        and carries straight on — setup does not depend on one.
      */}
      {ACCOUNTS_ENABLED ? (
        <View style={{ gap: 9 }}>
          {auth.appleAvailable ? (
            <PrimaryButton
              label="Continue with Apple"
              tone="dark"
              icon={<AppleMark color={t.c.bg} />}
              onPress={attempt(() => auth.signInWithApple())}
              style={{ minHeight: 52 }}
            />
          ) : null}
          <PrimaryButton
            label="Continue with Google"
            tone="surface"
            icon={<GoogleMark />}
            onPress={attempt(() => auth.signInWithGoogle())}
            style={{ minHeight: 52 }}
          />
          <PrimaryButton
            label="Register with email"
            onPress={() => nav.go({ name: 'account', from: 'onboarding', step: 'create' })}
            style={{ minHeight: 52 }}
          />
          <TextButton label="I already have an account — sign in" onPress={() => nav.go({ name: 'account', from: 'onboarding', step: 'welcome' })} />
          <TextButton label="Not now — carry on offline" color={t.c.fnt} onPress={onNext} />
        </View>
      ) : (
        <View style={{ gap: 9 }}>
          <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Badge text="Soon" fg={t.c.amb} bg={t.c.ambT} />
            <Txt v="secondary" c={t.c.mut} style={{ flex: 1, lineHeight: 19 }}>
              {ACCOUNTS_SOON_BODY}
            </Txt>
          </Card>
          <PrimaryButton label="Continue" onPress={onNext} style={{ minHeight: 52 }} />
        </View>
      )}
    </Screen>
  );
}
