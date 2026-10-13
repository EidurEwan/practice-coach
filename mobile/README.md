# Interval — React Native / Expo

The mobile build of Practice Coach, from `design_handoff_interval`. iOS and Android,
offline-first, with Supabase as a backup and merge target rather than a gate.

```bash
npm install
npm start          # then i / a / w
npm test           # 216 tests — engine, analytics, sync, nav, persistence, reminders
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
  analytics.ts    Progress: estimated recall, the two futures, workload, streaks
src/store/      local-first persistence (SQLite on device, JSON elsewhere)
src/sync/       sync rules, engine and transport; Supabase client and auth
src/theme/      the handoff's tokens, and light/dark/system
src/ui/         primitives, icons, charts, and the app shell
src/screens/    Today, Log, Upcoming, Progress, Skills, Settings, Onboarding, Account
supabase/       migrations (schema, RLS, sync_push, account deletion) and verify/
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
*merges by timestamp, latest wins*, applied per row rather than per document.
Two devices that were both offline keep everything either of them did.

## Upcoming and Progress

**Upcoming** opens on a strip of the next fourteen days — scheduled reviews,
projected ones stacked above in a lighter step, and the daily capacity as a
line — so a heavy day shows before it arrives. Below it, the agenda changes
shape with the window: named reviews per day, grouped by skill, for two
weeks; per week for three months; counted per skill for a year or five, on
one scale so months compare honestly. Overdue work gets its own card, and
everything projected after it starts from today. Projections can be hidden.

**Progress** estimates how much is sticking. Nothing is measured — the app
never quizzes — so it reads recall off the forgetting curve the schedule is
built on: each gap is chosen to land at about 90% recall, so a topic's gap
sets how fast it fades (`src/engine/analytics.ts`). From that it shows recall
today; two futures, keeping up with reviews or stopping today; proficiency
bands now and at a chosen horizon; what keeping up costs per week; activity,
ratings and streaks; and the few topics most worth a look. The "keep up"
future runs the real rating function, so it cannot disagree with the buttons.

Chart colours live in `src/theme/viz.ts`, each set validated for contrast and
colour-blind separation against both themes' surfaces.

## The rest of APP.md

**Today** can be stepped to any day. A past day takes ratings, recorded against
that date with a warning saying so; a future day is a read-only preview. Cards
with a cue and answer hide the answer until revealed. After a rating, a short
card names the result and the next thing due — or, after a third miss in a
row, asks which part is actually failing and saves it as the sub-skill. A skill
whose target date has passed stops scheduling and gets a card saying what the
season amounted to, with "Keep practising" to bring it back. The day copies as
plain text (web) or goes to the share sheet. On the web, `1`–`4` rate the open
card in the order of its rows (Failed, Hard, OK, Easy) and `Esc` closes it.

**Log** takes one topic or a pasted list. The list parser
(`src/engine/intake.ts`) strips `1.`, `2)`, `1.1`, `a)`, `(iv)` and bullets but
leaves a bare leading number, since "3 sets of reps" is a title. Language and
memorization topics take a cue and answer; memorization will not schedule a
new fact without an encoding, and so is not offered the paste mode. Logging
something that is not yet due is blocked, with "Log it anyway" to override.

**Skills** can be edited (name, level, target date — a new date starts a new
season and clears a pause), paused and resumed. New skills, here and in
onboarding, take an optional level, target date and the forgetting-rate
diagnostic, whose factor scales every interval for that skill. Topics open to
an editor with archive; archived topics collect under their skill. Confusable
pairs are held apart while either is shaky and then scheduled together as a
discrimination drill. Older saved data and synced rows from older builds get
the new fields filled with defaults on read (`withDefaults` in
`src/store/format.ts`).

## How sync works

Sync was rebuilt from scratch; the first version lost work in ordinary use
(deletions came back, edits made during a sync were overwritten, and a new
phone received at most 1000 rows). What replaced it:

- **The server is a feed.** Every record is a row in `sync_rows` — a JSON
  document keyed by account, kind and id, with a tombstone flag and a feed
  position, `seq`. A device reads everything after the last position it saw,
  a page at a time, so a sync costs what changed rather than everything.
- **Writes go through one function.** `sync_push` applies *latest timestamp
  wins* on the server, holding a per-account lock so feed positions are
  handed out in commit order. It sends back its own copy of anything it
  refuses, and tells the device whether it can skip reading back its own
  writes.
- **Deletions are recorded, and final.** A deleted row becomes a tombstone,
  and an edit to it from a device that had not heard yet is refused, so
  deleting a skill cannot come back one topic at a time.
- **The device knows what it last agreed with the server.** Sync keeps, per
  account, each row's timestamp as of the last sync (the *base*), stored
  beside the data itself (`readMeta`/`writeMeta`). Device against base tells
  an edit made here from one made elsewhere, and a row in the base but gone
  from the device is a deletion to upload. If the data is erased or lost,
  the base goes with it, and the next sync downloads instead of deleting.
- **Merges land on the live document.** Each download is applied to what is
  on screen at that moment, never to a copy taken before the request, so a
  rating made mid-sync survives.
- **Timestamps never go backwards.** Local stamps stay ahead of every
  timestamp the device has seen (`nowIso`/`observeTime`), so a phone whose
  clock runs slow does not lose its own later edit.
- **Orphans are swept.** A topic added offline to a skill deleted elsewhere
  is removed after the download, and its tombstone goes up — the old
  `on delete cascade`, done where the data lives.

| File | Holds |
|---|---|
| `src/sync/protocol.ts` | the rules — pure, no I/O |
| `src/sync/engine.ts` | one sync (`syncOnce`), and when to run it (`SyncRunner`: one at a time, coalesced, backoff on failure) |
| `src/sync/remote.ts` | the two calls to Supabase |
| `src/sync/auth.tsx` | sessions, and starting a runner per signed-in account |

The tests drive two simulated phones against an in-memory server
(`src/sync/__tests__/fakeServer.ts`) that follows the same rules as
`sync_push`. `supabase/verify/verify.sh` checks those rules against the real
SQL on a real Postgres; CI runs both.

Two choices to know about:

- **Signing in on a phone adopts the account's settings.** The first time a
  device syncs with an account, the account's settings win over the device's,
  which are usually onboarding defaults stamped a minute earlier.
- **Import replaces the synced copy as well.** Imported rows are stamped as
  new edits, so they win over what the account holds — except rows the
  account has deleted, which stay deleted.

## Turning on sync

The project this app syncs with is set in `mobile/.env` (committed — both
values ship in every build anyway). Put overrides in `.env.local`, and after
changing either, bundle with `--clear`: Metro caches the inlined values.

Sync is off until a project is configured, and the app says so rather than
failing:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

The schema lives in `supabase/migrations/`. Every table is scoped by `user_id`
behind row level security, and each one carries the `GRANT`s that RLS assumes —
policies alone are not enough, and without the grants every signed-in request
fails with *permission denied*. `sync_rows` is readable by its owner and
writable only through `sync_push`. `request_account_deletion()` backs the "removes
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

1. **The schema has to exist.** `supabase link` then `supabase db push`, or
   paste each file in `supabase/migrations/` into the SQL editor, oldest
   first. The second carries any rows the first schema held across before
   dropping its tables. Everything 404s with `PGRST205` until this is done. A table that answers **401** is correct — it exists and
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
  move when a skill is archived). Both travel in the synced record.
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
- No component tests. The engine and sync are covered; the screens were
  verified by walking the flows in a browser at 402×874 and on an Android
  emulator (API 35), including a cold restart to prove SQLite persistence.
- iOS is unrun — it needs macOS. The bundle builds, but nothing on that
  platform has been driven.
