# Interval — React Native / Expo

The mobile build of Practice Coach, from `design_handoff_interval`. iOS and Android,
offline-first, with Supabase as a backup and merge target rather than a gate.

```bash
npm install
npm start          # then i / a / w
npm test           # 116 tests — engine, merge, nav, persistence, reminders
npm run typecheck
```

Nothing here needs an account or a network connection. `npm start` on a clean
install lands on onboarding and writes nothing until you act.

## What is where

```
src/engine/     the scheduler — pure TypeScript, no React, no I/O
  dates.ts        calendar-day arithmetic (YYYY-MM-DD, DST-safe)
  genres.ts       genre detection, curves, methods, the format ladder
  schedule.ts     ratings, ease, penalties, plateaus, projection
  bands.ts        proficiency bands read off the current interval
  recall.ts       chart geometry — the sawtooth and the onboarding curves
  plan.ts         the day: ranking, capacity, backlog, interleaving, agenda
src/store/      local-first persistence (SQLite on device, JSON elsewhere)
src/sync/       Supabase client, auth, and the timestamp merge
src/theme/      the handoff's tokens, and light/dark/system
src/ui/         primitives, icons, charts, and the app shell
src/screens/    Today, Log, Upcoming, Skills, Settings, Onboarding, Account
supabase/       schema.sql — tables, indexes, RLS, account deletion
```

The engine has no React in it, which is what lets the rating buttons state
their consequence honestly: `previewRatings` and the commit path call the same
`applyRating`, so the number on the button is the number the schedule keeps.

## Local first

`src/store/store.tsx` holds the whole document in memory and writes through to
persistence on every mutation. The phone is the source of truth:

- **On device** — `expo-sqlite`, one table per collection, mirroring the
  Supabase schema minus `user_id`.
- **Web preview and fallback** — one JSON document in AsyncStorage, same
  interface. `expo-sqlite` on the web needs a wasm build and cross-origin
  isolation, neither of which a preview should require.

Every row carries `updated_at`, because the sync rule shown in the UI is
*ratings merge by timestamp, latest wins*, applied per row rather than per
document (`src/sync/merge.ts`). Two devices that were both offline keep
everything either of them did.

## Turning on sync

Sync is off until a project is configured, and the app says so rather than
failing:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

The schema lives in `supabase/migrations/`. Every table is scoped by `user_id`
behind row level security, and each one carries the `GRANT`s that RLS assumes —
policies alone are not enough, and without the grants every signed-in write
fails with *permission denied*. `request_account_deletion()` backs the "removes
the copy on the server within 30 days" line in Settings.

### Running the whole stack locally

```bash
npx supabase start          # Postgres, auth and Mailpit in Docker
npx supabase status         # copy API URL and ANON_KEY into .env.local
npx expo start --clear      # env vars are inlined at bundle time
```

Sign-up emails land in Mailpit at <http://127.0.0.1:54324> — that is where the
six-digit code comes from while developing.

### Confirmation emails

`supabase/config.toml` sets `enable_confirmations = true` and an OTP that
expires in ten minutes, matching what the Verify screen promises. The template
in `supabase/templates/confirmation.html` leads with `{{ .Token }}` so the
email carries a **code**, not only a link: the person is already holding the
phone that is signing up, and a link would bounce them into a browser.

A hosted project does not read `config.toml`. There you have to, in the
dashboard: turn on "Confirm email", set the OTP expiry, paste that template
into Authentication → Email Templates, and configure SMTP.

### Turning accounts on for a hosted project

Two things have to be true, they fail in different places, and they have
different fixes. `scripts/check-supabase.mjs` tells them apart:

```bash
node scripts/check-supabase.mjs https://<ref>.supabase.co <anon-key>
```

1. **The schema has to exist.** Paste
   `supabase/migrations/20260812000000_init.sql` into the SQL editor, or
   `supabase link` then `supabase db push`. Every table 404s with `PGRST205`
   until this is done. A table that answers **401** is correct — it exists and
   is closed to the anon role, which is what row level security is for.
2. **The project has to be able to send mail.** Authentication → Emails → SMTP
   Settings, with any provider (Resend, Brevo, Postmark, SendGrid, or a Gmail
   app password). Without it, `POST /auth/v1/signup` returns
   `500 unexpected_failure "Error sending confirmation email"` — for *every*
   address, including the project owner's, so it is not the built-in sender's
   own-organisation restriction. Nothing in the app can work around it: the
   account is created and the confirmation never leaves the server.

The anon key belongs in the client — it ships in the app and RLS is what
protects the data. The `service_role` key does not, and nothing here needs it.

Environment variables are inlined at bundle time, so after configuring the
project, rebuild (`npx expo export --platform web`) for the web build to pick
the change up.

### Apple and Google

Apple works on a device build once `usesAppleSignIn` is provisioned. Google
needs client ids in `app.json` under `extra` (`googleWebClientId`,
`googleIosClientId`, `googleAndroidClientId`); until then the button reports
what is missing instead of pretending to sign in.

## Decisions the handoff left open

Where the README and the HTML prototype disagreed, the README won, since it is
the written spec. Both places are noted here so they can be reversed in one
edit:

| Point | Chosen | The other source |
|---|---|---|
| Conceptual curve | Compressed, `1 → 2 → 5 → 10 → 22` (prototype `GENRES`, and it is what the UI copy claims) | The README's genre table says `1 → 3 → 5 → 7 …` |
| Learning band colour | Amber — the prototype's four-step ramp, confirmed since (`src/engine/bands.ts`) | The README's band table says red |
| Daily capacity options | 4 / 6 / 8 / 12, default 8 — per the README, and confirmed since | The prototype offers 8 / 12 / 16 / 20 |
| Skill hues | The README's token list | The prototype's light hues differ slightly |

Other calls made while building:

- **Delete is archive.** The skill overflow menu archives rather than deletes,
  because the screen's own footer promises archived work is kept. Archived
  skills collect behind a disclosure with a Restore action. Erase everything, in
  Settings, stays the only permanent one.
- **The header is hidden on onboarding and the account flow.** The prototype
  leaves it up, which puts a second logo above the gate's centred one.
- **Two extra columns.** `topics.format_rung` (which rung of the practice-format
  ladder a plateau has pushed it to) and `skills.hue_index` (so a colour cannot
  move when a skill is archived). Both are in `supabase/schema.sql`.
- **Streak is signed.** `+n` counts consecutive OKs toward a plateau, `−n`
  counts hard/failed toward a weak point, and the opposite rating clears it —
  one column instead of two.
- **Pre-deadline needs a date**, so Settings gained an exam-date row using the
  platform date picker. The pre-deadline window is a segmented control beside
  it rather than a static row.

## What running it on a device changed

The browser preview cannot reach any of these — it has no hardware back button
and it uses the JSON store rather than SQLite. All three were found by building
to an Android emulator and driving the app.

- **The system back button quit the app.** The router never handled
  `hardwareBackPress`, so Android's back gesture dropped you to the launcher
  from any screen. It now pops the stack, and only falls through to the system
  from a root tab (`src/nav/router.tsx`).
- **Concurrent SQLite transactions silently dropped writes.** One log fans out
  into three writes that the caller does not await; each opened its own
  `withTransactionAsync` on the same connection, and the overlap failed with
  *cannot rollback - no transaction is active* — losing the log entry. Writes
  are now serialised through one queue and use
  `withExclusiveTransactionAsync` (`src/store/sqlite.ts`).
- **The header logo rendered blank and pushed the layout.** The mark is a square
  icon cropped to its middle band; in flow, Android sized the row to the full
  image and clipped it to nothing. The image is now out of flow
  (`src/ui/shell.tsx`).
- **The verification code appeared to do nothing.** The number pad covers the
  Verify button, so typing all six digits left a full-looking form and no
  visible way to submit it. Six digits is the whole form, so the sixth one now
  submits and dismisses the keyboard (`src/screens/Account.tsx`); the button
  stays for anyone who reaches it another way.

Driving the emulator by pixel is unreliable — the register gate has two targets
ten pixels apart, and the keyboard shifts the sheet. Tap by accessibility text
instead:

```bash
adb shell uiautomator dump /sdcard/ui.xml   # then match text -> bounds -> tap
```

## Reminders and feedback

A schedule that rebuilds itself every morning is no use if nothing says so, so
there is an optional daily reminder (Settings → Daily reminder). Two rules it
keeps, both tested in `src/notify/__tests__`:

- **It never nags about nothing.** Days with nothing due are skipped, rather
  than buzzing to say there is no work.
- **It never claims a number it cannot keep.** The count comes from the same
  `buildPlan` the screen uses, and the whole week is rescheduled whenever the
  schedule changes — clear the last thing due and tomorrow's reminder already
  knows.

The decisions live in `src/notify/reminders.ts`, which is pure and testable
without a notification service; `src/notify/schedule.ts` is the only part that
touches the OS, and it loads `expo-notifications` lazily so a build made before
that module existed degrades to no reminders rather than to a white screen.

Ratings, logs, undo and failures also answer in the hand (`src/ui/feedback.ts`).
Clearing the last thing due gets a different feel from the rating before it.

## Not built

- Apple and Google sign-in are wired but unverified — they need a real Supabase
  project and native credentials to exercise.
- Import takes pasted JSON rather than a file picker; export goes through the
  system share sheet.
- No component tests. The engine and the merge are covered; the screens were
  verified by walking the flows in a browser at 402×874 and on an Android
  emulator (API 35), including a cold restart to prove SQLite persistence.
- iOS is unrun — it needs macOS. The bundle builds, but nothing on that
  platform has been driven.
