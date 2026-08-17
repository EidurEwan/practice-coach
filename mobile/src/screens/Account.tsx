import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthStep, useNav } from '../nav/router';
import { useStore } from '../store/store';
import { useAuth } from '../sync/auth';
import { authError } from '../sync/authError';
import { syncSummary } from '../sync/sync';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import { AppleMark, Back, Check, GoogleMark } from '../ui/icons';
import { Card, Field, Label, Press, PrimaryButton, Row, TextButton, Txt } from '../ui/primitives';
import { DEVICE, ON_DEVICE } from '../ui/copy';
import { Screen } from '../ui/shell';

const COPY: Record<AuthStep, [string, string, string]> = {
  welcome: [
    'Account',
    'Sign in to Interval',
    `Your schedule lives ${ON_DEVICE}. An account keeps a copy, so a lost ${DEVICE} is not a lost year.`,
  ],
  create: ['Account', 'Create your account', 'Three things it buys you. Everything else works the same offline.'],
  verify: ['Account', 'Check your inbox', 'Six digits, and they expire in ten minutes.'],
  forgot: ['Password', 'Reset your password', 'We send a link. It signs you in once and asks for a new password.'],
  done: [
    'Account',
    "You're signed in",
    `Everything logged from here syncs. The schedule is still computed ${ON_DEVICE}.`,
  ],
};

export function AccountScreen({
  step,
  from,
  email: carried,
}: {
  step: AuthStep;
  from: 'settings' | 'onboarding';
  email?: string;
}) {
  const t = useTheme();
  const nav = useNav();
  const auth = useAuth();
  const store = useStore();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState(carried ?? auth.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kicker, title, body] = COPY[step];

  const go = (next: AuthStep) => {
    setError(null);
    nav.go({ name: 'account', from, step: next, email });
  };

  const leave = () => {
    if (from === 'onboarding') nav.go({ name: 'onboarding', step: 5 });
    else nav.go({ name: 'settings' });
  };

  const attempt = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e: unknown) => setError(authError(e).message))
      .finally(() => setBusy(false));
  };

  const submit = () => {
    switch (step) {
      case 'welcome':
        return attempt(async () => {
          await auth.signIn(email, password);
          go('done');
        });
      case 'create':
        return attempt(async () => {
          const { needsVerification } = await auth.signUp(email, password);
          go(needsVerification ? 'verify' : 'done');
        });
      case 'verify':
        return attempt(async () => {
          await auth.verify(email, code);
          go('done');
        });
      case 'forgot':
        return attempt(async () => {
          await auth.sendReset(email);
          go('welcome');
        });
      case 'done':
        return leave();
    }
  };

  // Six digits is the whole form, so typing the sixth one submits it. The
  // keyboard covers the Verify button on a phone, and waiting for a tap that
  // cannot be seen reads as the app having ignored the code.
  const autoSubmitted = useRef<string | null>(null);
  useEffect(() => {
    if (step !== 'verify' || code.length < 6 || busy || autoSubmitted.current === code) return;
    autoSubmitted.current = code;
    Keyboard.dismiss();
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step, busy]);

  const cta = { welcome: 'Sign in', create: 'Create account', verify: 'Verify', forgot: 'Send reset link', done: 'Continue' }[step];
  const altLabel = {
    welcome: 'New here? Create an account',
    create: 'Already have an account? Sign in',
    verify: 'Change email',
    forgot: 'Back to sign in',
    done: 'Not now',
  }[step];
  const alt = () =>
    step === 'welcome' ? go('create') : step === 'create' ? go('welcome') : step === 'verify' ? go('create') : step === 'forgot' ? go('welcome') : leave();

  const hasFields = step === 'welcome' || step === 'create' || step === 'forgot';
  const hasPassword = step === 'welcome' || step === 'create';
  const disabled = busy || (hasFields && !email.trim()) || (hasPassword && password.length < 6) || (step === 'verify' && code.length < 6);

  return (
    <Screen scroll={false} bottomPadding={30} style={{ paddingTop: insets.top + 12 }}>
      <Row gap={12}>
        <Press
          // The stack already knows where you came from — each step is its own
          // entry — so pop it rather than guessing at `welcome`. Entering at
          // `create` straight from onboarding and being dropped on `welcome`
          // lands you on a step you never saw. Signing in is a one-way door.
          onPress={() => (step === 'done' || !nav.canGoBack ? leave() : nav.back())}
          accessibilityLabel="Back"
          style={{ width: 36, height: 36, marginLeft: -8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }}
        >
          <Back color={t.c.mut} />
        </Press>
        <Label>{kicker}</Label>
      </Row>

      <Txt v="screenTitle" style={{ marginTop: 22, lineHeight: 34 }}>
        {title}
      </Txt>
      <Txt v="secondary" c={t.c.mut} style={{ marginTop: 8, lineHeight: 20 }}>
        {step === 'verify' && email ? `Six digits sent to ${email}. They expire in ten minutes.` : body}
      </Txt>

      <View style={{ flex: 1, minHeight: 0 }}>
        {step === 'welcome' ? (
          <>
            <View style={{ marginTop: 22, gap: 9 }}>
              {auth.appleAvailable ? (
                <PrimaryButton
                  label="Continue with Apple"
                  tone="dark"
                  icon={<AppleMark color={t.c.bg} />}
                  onPress={() => attempt(() => auth.signInWithApple())}
                />
              ) : null}
              <PrimaryButton
                label="Continue with Google"
                tone="surface"
                icon={<GoogleMark />}
                onPress={() => attempt(() => auth.signInWithGoogle())}
              />
            </View>
            <Row gap={12} style={{ marginTop: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
              <Txt v="label" c={t.c.fnt} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: '400' }}>
                or with email
              </Txt>
              <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
            </Row>
          </>
        ) : null}

        {hasFields ? (
          <View style={{ marginTop: 16, gap: 12 }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@school.edu"
              autoCapitalize="none"
              keyboardType="email-address"
              bordered
            />
            {hasPassword ? (
              <View>
                <Field
                  label="Password"
                  hint={password.length ? undefined : 'Used for sign-in only'}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  autoCapitalize="none"
                  secure
                  bordered
                />
                {/* An empty field has not failed anything yet — "Too short"
                    before a keystroke is an accusation, not feedback. */}
                {step === 'create' && password.length ? <Strength password={password} /> : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 'verify' ? <CodeBoxes value={code} onChange={setCode} email={email} /> : null}

        {step === 'create' ? <Benefits /> : null}

        {step === 'done' ? (
          <Card style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.pill,
                backgroundColor: t.c.accT,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt c={t.c.acc} style={{ fontWeight: '600', fontSize: 15 }}>
                {(auth.email ?? email).slice(0, 2).toUpperCase()}
              </Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="rowTitle" numberOfLines={1}>
                {auth.email ?? email}
              </Txt>
              <Row gap={6} style={{ marginTop: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: t.c.grn }} />
                <Txt v="secondary" c={t.c.fnt} numberOfLines={1} style={{ flex: 1 }}>
                  {auth.sync.status === 'syncing' ? 'Syncing…' : syncSummary(store.doc).split('.')[0]}
                </Txt>
              </Row>
            </View>
          </Card>
        ) : null}

      </View>

      <View style={{ gap: 8 }}>
        {/*
          The error sits with the button rather than at the end of the content
          above, which flexes: a long message there is pushed under this block
          and clipped mid-sentence, so the one thing you need to read is the
          one thing you cannot.
        */}
        {error ? (
          <View style={{ marginBottom: 8, borderRadius: radius.input, padding: 13, backgroundColor: t.c.redT }}>
            <Txt v="secondary" c={t.c.red} style={{ lineHeight: 19 }}>
              {error}
            </Txt>
          </View>
        ) : null}
        <PrimaryButton label={busy ? 'One moment…' : cta} disabled={disabled} onPress={submit} />
        <TextButton label={altLabel} onPress={alt} />
        {step === 'welcome' ? <TextButton label="Forgot password" color={t.c.acc} onPress={() => go('forgot')} /> : null}
        {step === 'create' ? (
          <Txt v="label" c={t.c.fnt} style={{ marginTop: 6, textAlign: 'center', textTransform: 'none', letterSpacing: 0, fontWeight: '400', lineHeight: 18 }}>
            Nothing you log is used to train anything. Export and deletion stay in Settings.
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------- password meter */

function Strength({ password }: { password: string }) {
  const t = useTheme();
  const score = Math.min(
    4,
    (password.length >= 8 ? 2 : password.length >= 4 ? 1 : 0) + (/[^a-z]/.test(password) ? 1 : 0) + (password.length >= 14 ? 1 : 0),
  );
  const color = score <= 1 ? t.c.red : score === 2 ? t.c.amb : t.c.grn;
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score];

  return (
    <Row gap={8} style={{ marginTop: 11 }}>
      <Row gap={3} style={{ flex: 1 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: i <= score ? color : t.c.sunk }} />
        ))}
      </Row>
      <Txt v="label" c={color} style={{ textTransform: 'none', letterSpacing: 0 }}>
        {label}
      </Txt>
    </Row>
  );
}

/* ----------------------------------------------------------- code boxes */

function CodeBoxes({ value, onChange, email }: { value: string; onChange: (v: string) => void; email: string }) {
  const t = useTheme();
  const auth = useAuth();
  const input = useRef<TextInput>(null);
  const [seconds, setSeconds] = useState(24);

  useEffect(() => {
    if (!seconds) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const digits = useMemo(() => Array.from({ length: 6 }, (_, i) => value[i] ?? ''), [value]);

  return (
    <View>
      <Pressable accessibilityLabel="Verification code" onPress={() => input.current?.focus()}>
        <Row gap={8} style={{ marginTop: 22 }}>
          {digits.map((d, i) => {
            const active = i === value.length;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: t.c.surf,
                  borderWidth: active ? 2 : 1,
                  borderColor: d || active ? t.c.acc : t.c.line,
                }}
              >
                <Txt style={{ fontSize: 20, fontWeight: '600' }}>{d}</Txt>
              </View>
            );
          })}
        </Row>
      </Pressable>

      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
      />

      <Row gap={8} style={{ marginTop: 16 }}>
        <Txt v="secondary" c={t.c.fnt}>
          Didn't arrive?
        </Txt>
        {seconds > 0 ? (
          <Txt v="secondary" c={t.c.fnt} style={{ fontWeight: '600' }}>
            Resend in 0:{String(seconds).padStart(2, '0')}
          </Txt>
        ) : (
          <Press
            onPress={() => {
              setSeconds(24);
              auth.resend(email).catch(() => setSeconds(0));
            }}
          >
            <Txt v="secondary" c={t.c.acc} style={{ fontWeight: '600' }}>
              Resend
            </Txt>
          </Press>
        )}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------- benefits */

function Benefits() {
  const t = useTheme();
  const rows = [
    ['Backup and restore', 'Reinstall on a new phone and the plan comes back where you left it.'],
    ['Phone and laptop', 'Log on either. Ratings merge by timestamp, latest wins.'],
    ['Streaks and history', 'Retention over months, not just the last two weeks.'],
  ];
  return (
    <Card padding={0} style={{ marginTop: 20, paddingHorizontal: 18 }}>
      {rows.map(([label, detail], i) => (
        <Row key={label} gap={12} align="flex-start" style={{ paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.c.line }}>
          <View style={{ width: 26, height: 26, borderRadius: radius.pill, backgroundColor: t.c.accT, alignItems: 'center', justifyContent: 'center' }}>
            <Check color={t.c.acc} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: '500', lineHeight: 20 }}>{label}</Txt>
            <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2, lineHeight: 19 }}>
              {detail}
            </Txt>
          </View>
        </Row>
      ))}
    </Card>
  );
}
