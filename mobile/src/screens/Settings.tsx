import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';
import { formatWithYear, parseDay, toDay } from '../engine/dates';
import { ThemeChoice } from '../engine/types';
import { useNav } from '../nav/router';
import { useStore } from '../store/store';
import { useAuth } from '../sync/auth';
import { syncSummary } from '../sync/sync';
import { useTheme } from '../theme/theme';
import { radius } from '../theme/tokens';
import {
  Card,
  Disclose,
  Dot,
  Field,
  Press,
  PrimaryButton,
  Row,
  Segmented,
  TextButton,
  Txt,
} from '../ui/primitives';
import { Screen, Sheet, TitleBar } from '../ui/shell';

export function SettingsScreen() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const auth = useAuth();
  const { settings } = store.doc;
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [pickingDate, setPickingDate] = useState(false);

  const initials = auth.email ? auth.email.slice(0, 2).toUpperCase() : '—';
  const syncedAt = auth.sync.at ? relativeMinutes(auth.sync.at) : null;

  const exportAll = async () => {
    const json = store.exportJson();
    try {
      await Share.share({ message: json, title: 'Interval — everything, as JSON' });
    } catch {
      // The user dismissed the share sheet; nothing was exported and that is fine.
    }
  };

  const confirm = (title: string, body: string, label: string, action: () => void) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: action },
    ]);

  return (
    <Screen>
      <TitleBar title="Settings" onBack={nav.back} />

      {/* --------------------------------------------------------- account */}
      <Card style={{ marginTop: 18 }}>
        <Row gap={13}>
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
              {initials}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="rowTitle" numberOfLines={1}>
              {auth.email ?? 'No account yet'}
            </Txt>
            <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2 }}>
              {auth.signedIn ? 'Signed in · free plan' : 'Everything works offline without one'}
            </Txt>
          </View>
          {/*
            Only shown signed out, where it is the way into the sign-in flow.
            Signed in there is nothing behind it that is not already on this
            screen — sign out and delete are both below.
          */}
          {auth.signedIn ? null : (
            <Press onPress={() => nav.go({ name: 'account', from: 'settings', step: 'welcome' })}>
              <Txt v="body" c={t.c.acc} style={{ fontWeight: '500', fontSize: 14 }}>
                Sign in
              </Txt>
            </Press>
          )}
        </Row>

        <Row gap={9} style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.c.line }}>
          <Dot color={auth.signedIn ? (auth.sync.status === 'error' ? t.c.red : t.c.grn) : t.c.fnt} size={7} />
          <Txt style={{ flex: 1, fontSize: 14 }}>
            {!auth.configured
              ? 'Not syncing'
              : auth.sync.status === 'syncing'
                ? 'Syncing…'
                : auth.sync.status === 'error'
                  ? 'Sync failed'
                  : auth.signedIn
                    ? 'Synced'
                    : 'Not syncing'}
          </Txt>
          <Txt v="secondary" c={t.c.fnt}>
            {auth.signedIn ? (syncedAt ?? 'just now') : 'Local only'}
          </Txt>
        </Row>
        <Txt v="secondary" c={auth.sync.error ? t.c.red : t.c.fnt} style={{ marginTop: 8, lineHeight: 19 }}>
          {auth.sync.error
            ? // A failure the user can act on beats a status word they cannot.
              `${auth.sync.error} — everything is still safe on this phone, and syncing resumes on its own.`
            : auth.signedIn
              ? syncSummary(store.doc)
              : 'Ratings are held on this phone. Export from below if you want a copy.'}
        </Txt>
        {auth.sync.error ? (
          <PrimaryButton
            label="Try again"
            tone="surface"
            style={{ marginTop: 12, minHeight: 44 }}
            onPress={() => void auth.syncNow()}
          />
        ) : null}
      </Card>

      {/* -------------------------------------------------------- capacity */}
      <Card style={{ marginTop: 16 }}>
        <Row align="baseline" style={{ justifyContent: 'space-between' }}>
          <Txt v="rowTitle">Daily capacity</Txt>
          <Txt v="rowTitle" c={t.c.acc}>
            {settings.daily_capacity} things
          </Txt>
        </Row>
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 4, lineHeight: 19 }}>
          Set in things due, never in minutes.
        </Txt>
        <View style={{ marginTop: 14 }}>
          <Segmented
            value={String(settings.daily_capacity)}
            onChange={(v) => store.updateSettings({ daily_capacity: Number(v) })}
            options={[4, 6, 8, 12].map((n) => ({ key: String(n), label: String(n) }))}
          />
        </View>
      </Card>

      {/* ----------------------------------------------------------- rows */}
      <Card padding={0} style={{ marginTop: 16, paddingHorizontal: 18 }}>
        <View style={{ paddingVertical: 15 }}>
          <Row align="baseline" gap={10}>
            <Txt style={{ flex: 1 }}>Exam date</Txt>
            <Press onPress={() => setPickingDate((v) => !v)}>
              <Txt c={t.c.acc}>{settings.exam_date ? formatWithYear(settings.exam_date) : 'Not set'}</Txt>
            </Press>
          </Row>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2 }}>
            What the schedule works backwards from
          </Txt>
          {pickingDate ? (
            <Disclose style={{ marginTop: 10 }}>
              <DateTimePicker
                value={settings.exam_date ? parseDay(settings.exam_date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                themeVariant={t.dark ? 'dark' : 'light'}
                onChange={(event, date) => {
                  if (Platform.OS !== 'ios') setPickingDate(false);
                  // Android fires this on cancel as well, carrying the current
                  // value — committing it would set an exam date nobody chose,
                  // which silently switches every topic to timed conditions.
                  if (event.type !== 'set' || !date) return;
                  store.updateSettings({ exam_date: toDay(date) });
                }}
              />
              {settings.exam_date ? (
                <TextButton
                  label="Clear the date"
                  onPress={() => {
                    store.updateSettings({ exam_date: null });
                    setPickingDate(false);
                  }}
                />
              ) : null}
            </Disclose>
          ) : null}
        </View>

        <View style={{ paddingVertical: 15, borderTopWidth: 1, borderTopColor: t.c.line }}>
          <Row align="baseline" gap={10}>
            <Txt style={{ flex: 1 }}>Pre-deadline window</Txt>
            <Txt v="secondary" c={t.c.fnt}>
              {settings.pre_deadline_days} days
            </Txt>
          </Row>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 2 }}>
            Timed exam conditions inside this
          </Txt>
          <View style={{ marginTop: 10 }}>
            <Segmented
              value={String(settings.pre_deadline_days)}
              onChange={(v) => store.updateSettings({ pre_deadline_days: Number(v) })}
              options={[7, 14, 21, 30].map((n) => ({ key: String(n), label: `${n}d` }))}
            />
          </View>
        </View>

        <View style={{ paddingVertical: 15, borderTopWidth: 1, borderTopColor: t.c.line }}>
          <Row align="baseline" gap={10}>
            <Txt style={{ flex: 1 }}>Theme</Txt>
            <Txt v="secondary" c={t.c.fnt}>
              {settings.theme === 'system' ? `Following the system — ${t.dark ? 'dark' : 'light'}` : 'Set by you'}
            </Txt>
          </Row>
          <View style={{ marginTop: 10 }}>
            <Segmented
              value={settings.theme}
              onChange={(v) => store.updateSettings({ theme: v as ThemeChoice })}
              options={[
                { key: 'system', label: 'System' },
                { key: 'light', label: 'Light' },
                { key: 'dark', label: 'Dark' },
              ]}
            />
          </View>
        </View>

        <Press scale={1} onPress={exportAll} style={{ paddingVertical: 15, borderTopWidth: 1, borderTopColor: t.c.line, flexDirection: 'row', alignItems: 'center' }}>
          <Txt style={{ flex: 1 }}>Export everything</Txt>
          <Txt c={t.c.fnt}>JSON</Txt>
        </Press>

        <Press scale={1} onPress={() => setImportOpen(true)} style={{ paddingVertical: 15, borderTopWidth: 1, borderTopColor: t.c.line, flexDirection: 'row', alignItems: 'center' }}>
          <Txt style={{ flex: 1 }}>Import</Txt>
          <Txt c={t.c.fnt}>From JSON</Txt>
        </Press>
      </Card>

      {/* --------------------------------------------------------- danger */}
      <Card padding={0} style={{ marginTop: 16, paddingHorizontal: 18 }}>
        <Press
          scale={1}
          disabled={!auth.signedIn}
          onPress={() => auth.signOut()}
          style={{ paddingVertical: 15, flexDirection: 'row', alignItems: 'center', opacity: auth.signedIn ? 1 : 0.5 }}
        >
          <Txt style={{ flex: 1 }}>Sign out</Txt>
          <Txt v="secondary" c={t.c.fnt}>
            Schedule stays on this phone
          </Txt>
        </Press>

        <Press
          scale={1}
          disabled={!auth.signedIn}
          onPress={() =>
            confirm(
              'Delete account',
              'Removes the copy on the server within 30 days. What is on this phone stays until you erase it.',
              'Delete',
              () => {
                auth.deleteAccount().catch((e) => Alert.alert('Could not delete the account', String(e.message ?? e)));
              },
            )
          }
          style={{ paddingVertical: 15, borderTopWidth: 1, borderTopColor: t.c.line, opacity: auth.signedIn ? 1 : 0.5 }}
        >
          <Txt c={t.c.red}>Delete account</Txt>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3, lineHeight: 19 }}>
            Removes the copy on the server within 30 days. Export first if you want to keep it.
          </Txt>
        </Press>

        <Press
          scale={1}
          onPress={() =>
            confirm(
              'Erase everything',
              'Every skill, topic and rating on this phone. This one cannot be undone.',
              'Erase',
              () => void store.eraseEverything(),
            )
          }
          style={{ paddingVertical: 15, borderTopWidth: 1, borderTopColor: t.c.line }}
        >
          <Txt c={t.c.red}>Erase everything</Txt>
          <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 3, lineHeight: 19 }}>
            Archived work lives in Skills. This is the only permanent one.
          </Txt>
        </Press>
      </Card>

      <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 16, textAlign: 'center' }}>
        Interval · works offline · {auth.signedIn ? 'synced' : 'no account'}
      </Txt>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)}>
        <Txt v="sheetTitle">Import</Txt>
        <Txt v="secondary" c={t.c.fnt} style={{ marginTop: 4, lineHeight: 19 }}>
          Paste an export. It replaces what is on this phone — export first if you want to keep it.
        </Txt>
        <View style={{ marginTop: 16 }}>
          <Field value={importText} onChangeText={setImportText} placeholder='{"skills":[…]}' autoCapitalize="none" />
        </View>
        <PrimaryButton
          label="Replace everything"
          disabled={!importText.trim()}
          style={{ marginTop: 16 }}
          onPress={async () => {
            try {
              await store.importJson(importText);
              setImportText('');
              setImportOpen(false);
            } catch {
              Alert.alert('That is not a valid export', 'The file should be the JSON produced by Export everything.');
            }
          }}
        />
        <TextButton label="Cancel" style={{ marginTop: 6 }} onPress={() => setImportOpen(false)} />
      </Sheet>
    </Screen>
  );
}

function relativeMinutes(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}
