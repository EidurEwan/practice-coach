# Practice Coach — the whole thing

A complete description of the app: what it is, how it decides, and every feature
that exists. Written against the code as built, not as intended. Where something
is planned rather than built it says so.

Companion documents: `DESIGN.md` (the visual system), `ROADMAP.md` (positioning,
findings, monetisation), `PRODUCT.md` (the design brief).

---

## 1. The idea in one paragraph

Every exam student makes a revision timetable. It is calendar-based, hand-made,
wrong within a fortnight, and abandoned. Practice Coach generates one that
**rebuilds itself every morning** — scheduled by memory rather than by wishful
blocks of time, working backwards from the exam date.

It never teaches the subject. It owns three things: **what** to practise today,
**when** each thing comes back, and **how** that session should be run.

## 2. What makes it different

Generic flashcard apps schedule *items*. This schedules by **genre** — what kind
of skill it is determines the algorithm, the interval curve, and the practice
method:

| Genre | Algorithm | Method |
|---|---|---|
| Reasoning | compressed curve | never reviewed alone — interleaved with a second topic |
| Conceptual | compressed curve | retrieval + elaborative interrogation |
| Physical (closed) | expanding curve | blocked reps first, then randomised |
| Physical (open) | expanding curve | variable and reactive from day one |
| Language | per-item SM-2 | SRS plus an output sentence |
| Memorization | per-item SM-2 | SRS, refusing to schedule an unencoded fact |

Anki treats a maths proof like a vocabulary card. A-Level Maths revision is
interleaved problem sets, not flashcards. Interleaving here is the *mechanism*,
not a setting you can switch off.

Two further mechanisms:

- **Three "OK"s running is a plateau, not stability.** It escalates the practice
  format up a ladder rather than repeating the same schedule.
- **Every rating states its consequence before you choose it** — "back in 7d" —
  so the schedule is never a black box.

## 3. Who it is for

Decided 2026-08-08: **UK exam-prep students, 16+** — A-Level, IB, university,
professional. Taking under-16s puts the product under the UK Children's Code and
GDPR-K, which constrains exactly the engagement mechanics a study app reaches
for, and makes minors the contracting party for a subscription.

Used in short daily sessions, most often on a phone, away from a desk. The
surface is read hundreds of times, so familiarity and low friction beat first-run
impressiveness.

---

## 4. The daily loop

    log what you studied  →  it gets a review date and a method
                          →  each day the app surfaces what is due
                          →  rate it              →  the interval moves

A session that **ends** is the success condition. Someone who practises the right
three things for twenty minutes has beaten someone who re-read everything for an
hour, and the interface actively discourages extra work once the day is cleared.

---

## 5. The scheduling engine

### Interval curves
- **Expanding**: 1 → 3 → 7 → 16 → 35 → 70 → 154 → 339 days, roughly ×2.2 a step.
- **Compressed** for reasoning and conceptual: 1 → 2 → 5 → 10 → 22 → 48 → 106 → 233.
- **Per-item SM-2** for language and memorization, so each card carries its own
  ease factor rather than averaging across a topic.
- Ease is clamped 1.3–3.0. Ratings adjust the next interval: easy ×1.3, ok ×1.0,
  hard ×0.6, failed resets to 1 day.
- **Nothing ever repeats sooner than one day** — one sleep cycle minimum.

### Forgetting-rate calibration
A one-time diagnostic asks for a real recall attempt on something learned N days
ago, then back-solves memory stability from `R(d) = exp(−d/S)` against a
7-day reference. The result is square-root damped so one shaky answer cannot blow
up the schedule, clamped to 0.6×–1.5×, and scales **every** interval thereafter.

### Adaptive behaviours
- **Interleaving** — reasoning and conceptual topics are never scheduled alone.
  The engine picks a partner: another due topic, a light booster whose own
  schedule is untouched, or a cross-skill partner if the subject has only one topic.
- **Confusable pairs** — two things you mix up are held apart while either is
  shaky, then *deliberately collided* once both are stable, to force
  discrimination.
- **Plateau detection** — three "OK"s running escalates the format one rung
  (e.g. worked example → guided → independent → unlabelled set → timed).
  At the top of the ladder it says so and recommends external feedback.
- **Priority weak points** — three hard/failed in a row applies a *permanent*
  ×0.7 interval penalty, compounding to a floor of 0.4, and asks which sub-skill
  is actually failing so the next session targets that rather than the whole topic.
- **Pre-deadline mode** — inside 21 days of a target date, practice switches to
  timed, exam-format conditions and weak or overdue work takes priority over new
  material.
- **Blocked-practice limit** — closed physical skills get two blocked sessions,
  then move to randomised.

### Daily load
Capacity is set in **things due, never in minutes**. How long practice takes
depends on the material and the person, so the app does not estimate it. A
per-item deck counts as one block of work, not one unit per card.

### Guardrail
Re-drilling something not yet due is blocked — it buys fluency you already have
and wastes the spacing effect. There is an override.

---

## 6. Features, by screen

### Today
- Date navigation as an inset pill; any day can be viewed, and rating against a
  past date is recorded against that date with a warning that you are doing so.
- **The day's size as a single numeral** — the focus count, not the backlog size.
- Capacity bar: things due against your cap.
- **Backlog triage.** Only the day's capacity is shown; the rest folds into a
  quiet disclosure. The blocks are already ranked (overdue → priority-weak →
  weak → pre-deadline → plateau → normal), so the focus set is the front of that
  list. Sixty cards in one scroll reads as failure; the same sixty behind
  "today's twelve" reads as a plan.
- **Practice cards** — one per due item, carrying the skill's colour as a band,
  a status dot, the method in one line, and a single primary action. Pressing
  anywhere on the card starts it.
- **Recall panel** — the prompt, an optional reveal for cue/answer cards, and
  four rating buttons each stating its own consequence, coloured by what that
  consequence means (green for a longer interval, amber for shorter, red for a
  reset).
- **Session flow** — after rating, the result card names the next thing and
  starts it in one tap, counts down what is left, and says "that is everything
  due" when the day is clear.
- **Undo** on the last rating, including any confusable side effects.
- **Why this?** — a disclosure on every card carrying the reasoning: the full
  method, the interleaving partner and why it was chosen, every flag raised.
- **Warnings with actions** — overload offers redistribution (which refuses to
  move overdue or priority-weak work); a confusable collision offers a deferral.
- **Sub-skill capture** — after a third failure, "which part is actually failing?"
- **Season wind-down** — once a target date passes the subject stops scheduling,
  and a card says what finished, what the work amounted to, and offers
  "keep practising" as a one-tap undo. Nothing is deleted.
- **Done state** — an explicit end to the day, with the next review date.
- The day's card as copyable plain text.

### Log
- Skill picker, with the primary method as a one-line hint.
- **One topic** or **paste a syllabus** — for every genre, not just flashcards.
  The bulk parser strips numbering and bullets (`1.`, `2)`, `1.1`, `3.2.1`, `-`,
  `•`) so an exam-board spec pastes straight in, while leaving a bare leading
  number alone because "3 sets of reps" is a title.
- Topic or item, sub-skill, cue/answer for decks, encoding, "felt shaky"
  (which tightens the first interval), and confusable-pair selection as chips.
- Backdating for catching up.
- Result card with every flag raised, the generated text card, and a link to today.

### Upcoming
- Horizons: **2 weeks / 3 months / 1 year / 5 years**.
- Filter the whole tab to one skill.
- Per-skill totals as meters — "how much of this is Spanish?"
- **The agenda** — one card per day (or week/month/quarter as the horizon widens),
  divided by skill, answering when → which skill → what, in reading order.
- **Committed vs projected is always marked.** Only each item's *next* review is
  real; everything beyond assumes an unbroken run of "OK" ratings. A `next` chip
  means scheduled, `3rd` means projected, `overdue` means late.
- Every tracked item with its full projected chain, grouped by skill.

### Skills
- One card per subject: name, genre badge, level, tracked count, calibration,
  deadline state, and the primary method.
- **Create a skill** with automatic genre detection from the name (keyword
  scored, blends flagged), a closed/open choice for physical skills, a method
  preview, and the optional forgetting-rate diagnostic with a live preview of
  what it does to both curves.
- **Edit** name, level and target date. Setting a new target date starts a new
  season and clears any pause.
- **Pause / resume** a subject by hand.
- **Item table** — due date, interval, ease, review count, status, current format.
- **Edit or archive a topic** from its row, one at a time.
- **Archive replaces delete.** Archived subjects and topics keep everything and
  collect in their own section. Permanent erase is offered *only there*, so
  destroying history always takes two deliberate steps.
- **Settings** — daily capacity, pre-deadline window, theme, export as JSON,
  import, erase everything.

### Onboarding
Six steps, skippable. The welcome step is an **interactive demo of the spacing
curve** — you stamp a sample row and watch the return date walk out along the
real curve. Then: name the skill (genre auto-detected), context and target date,
the optional diagnostic, the first topic, and a confirmation.

---

## 7. Cross-cutting

- **Light and dark themes**, following the system by default, with a manual
  override. Applied before first paint so a chosen theme never flashes.
- **Fully offline.** Installable as a PWA. No account, no network requests at
  runtime, zero dependencies, no build step.
- **Local storage** under `practice-coach:v1`, with read-back verification —
  storage can accept a write and silently not keep it, and a lost review is a
  corrupted schedule.
- **Store migrations** run on load and commit immediately: capacity in minutes
  converts to items; a v1 store's duplicated review history normalises to a
  single log, recovering anything the log was missing.
- **Accessibility** — every control named, every input labelled, landmarks and a
  live region, keyboard shortcuts (1–4 to rate, Esc to cancel), focus restored
  after every re-render, reduced motion honoured, 44px touch targets, and zero
  contrast failures in either theme with the ambient background composited at its
  worst point.

---

## 8. Data model

Five collections in one JSON document.

- **skills** — name, genre, physical type, level, target date, calibration,
  diagnostic, archived, suspended.
- **items** — a topic or an SRS card: title, sub-skill, cue, answer, encoding,
  plus the scheduling state (repetition, interval, ease, difficulty penalty, due
  date) and the streaks driving plateau and weak-point detection.
- **reviews** — the single record of every review: date, rating, recall attempt,
  interval before and after, ease, format.
- **confusables** — linked pairs.
- **settings** — capacity, pre-deadline window, theme, onboarded.

Derived state — status, suspension, stability — is **never stored**. It is always
recomputed, so it cannot drift out of step with the facts it is derived from.

---

## 9. Deliberately absent

No streaks, points, XP, leaderboards, or guilt mechanics. No social feed. No AI
question generation. No ads. No estimated practice duration. No paywalled data
export.

If a streak is ever built, it counts **sessions completed when something was
due** — never calendar days. The algorithm giving you a rest day must not break
it.

---

## 10. Status

**Built and shipped**: everything in sections 5–8. 70 passing engine tests; every
flag, interval and forecast shown is computed, not illustrative. Live at
`eidurewan.github.io/practice-coach`.

**In progress**: a Flutter port under `app/` — one codebase for web, iOS and
Android. Engine core done with 15 parity tests; the UI is not started.

**Built to the Interval design handoff**: a React Native / Expo app under
`mobile/`, iOS and Android, offline-first with Supabase as a backup and merge
target rather than a gate. Every screen in the handoff is built; the engine is
its own TypeScript implementation of the handoff's spec, with 68 tests. See
`mobile/README.md` for what the handoff left open and which way each call went.

**Planned**, in order: search; memoized session building; coverage/readiness
against a full syllabus; a progress view with recall-attempt playback; accounts
and sync; class codes and a teacher dashboard.

There are no users, testimonials, benchmarks or usage numbers, and none may be
invented.
