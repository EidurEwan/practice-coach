# Roadmap

Working document. Positioning, findings, and build order for turning Practice
Coach from a personal tool into a published product.

Decisions taken 2026-08-08: **UK exam-prep students** as the beachhead,
**local-first with optional accounts and sync**, **freemium** as the model.

---

## 1. Positioning

Sell a **revision timetable that rebuilds itself**, not "spaced repetition".

Every exam student makes a revision timetable. It is calendar-based, hand-made,
wrong within a fortnight, and abandoned. The engine already has everything
needed to generate a real one — exam date, daily capacity, forecast projection,
redistribution, pre-deadline mode — scheduled by memory rather than by wishful
blocks of time.

The genre-aware scheduling is the *proof*, not the headline: Anki treats a maths
proof like a vocabulary card, and A-Level Maths revision is interleaved problem
sets, not flashcards. No competitor distinguishes closed motor skills from
reasoning from per-item recall.

**Launch 16+ first** (A-Level, IB, university, professional). Taking under-16s
puts the product under the UK Children's Code and GDPR-K, which constrains
exactly the engagement mechanics a study app reaches for, and makes minors the
contracting party for a subscription. Add GCSE deliberately, later, or not at
all.

---

## 2. Findings from the review

Measured against a generated dataset of 4 subjects / 585 topics / 3,672 reviews —
roughly a two-year user.

### Severity 1 — the backlog collapse
A normal backlog rendered **61 practice cards in one scrolling list**. The only
remedy offered was "Redistribute to tomorrow", which moved **9 of 64**. No
triage, no partial-credit path. This is where a student who takes a week off
quits, and the engine already ranks blocks well enough to fix it — it just never
uses the ranking to cut the list.

Three string bugs in the same warnings:
- `scheduler.js` overload warning said `~N min` — a leftover from before capacity
  moved from minutes to items. Understated the load by roughly 10×.
- `non-urgent block(s)` — the pluralisation style fixed elsewhere.
- "N **items** are overdue" counted *blocks*; an SRS deck of 30 overdue cards
  counts as 1, so the number could not be reconciled with anything visible.

### Severity 1 — the post-exam dead end
With exam dates two weeks past, the app added a `past target` badge and carried
on scheduling 61 cards a day forever. No wind-down, no archive, no "keep this
for next year". The only exit is `deleteSkill`, which destroys the history —
i.e. the asset that would bring the student back next September.

### Severity 2 — performance at retention scale
| | 195 items | 585 items |
|---|---|---|
| Upcoming | 74 ms | 250 ms |
| Rating an item | — | 59 ms |

Scaling is linear, nothing is quadratic. But a mid-range Android runs 4–6×
slower: ~1s per horizon tap, ~300ms for the most repeated action in the product.
Cause is structural — `mount()` rebuilds the whole view every interaction and
`buildSession` re-runs from scratch, with no memoization.

### Severity 2 — data duplication blocks clean sync
Every review is written twice, to `item.history` and to `store.reviews`.
Measured: **37% of the payload is the duplicate**. Wasted space is minor; two
copies of one fact in a synced document is a divergence waiting to happen.
Normalise before sync exists, not after.

Also: 1.72 MB at two years against a ~5 MB `localStorage` ceiling.

### Severity 3 — the app is write-once
No edit path anywhere: not a skill name, a topic title, or an exam date.
`archived` exists in the model and nothing can set it. `deleteSkill` is the only
removal mechanism and it destroys all review history. The item table is entirely
read-only. No search.

### Severity 3 — bulk entry only exists for the wrong genres
Paste-a-list is gated on `perItem`, true only for language and memorization.
Reasoning, conceptual and physical — every academic subject — can only be added
**one topic per form submission**. A student setting up A-Level Maths faces ~40
submissions before the app does anything for them. This is the activation wall.

### Clean
Accessibility holds up: every control named, every input labelled, landmarks and
live region present, reduced motion honoured, no contrast failures in either
theme with the ambient wash composited at its worst point.

---

## 3. Build order

1. ~~**Backlog triage**~~ — done. Focus set capped at the day's capacity using
   the existing rank, rest behind a disclosure. Three warning strings fixed.
2. ~~**Season wind-down**~~ — done. Derived suspension once a target date
   passes, one-tap resume, target-date control for the next season.
3. **Write-once fixes** — mostly done. Editing (skill name/level, topic
   title/sub-skill), archive replacing delete for both skills and topics, real
   erase moved behind archiving. **Search still outstanding** — starts to matter
   past ~60 items.
4. ~~**Bulk paste for all genres** + continuous session flow~~ — done.
5. **Normalise the review log** — single source of truth, before sync exists.
6. **Memoize `buildSession`**, patch instead of remount.
7. **Coverage / readiness** — needs a `notStarted` item state and a store
   migration. The number a student checks daily and a parent would pay for.
8. **Progress view + recall-attempt playback** — every review already records
   `recallAttempt` and the app throws it away.
9. **Accounts + sync.**
10. **Class codes + teacher dashboard.** See §4 — this is the revenue product.

Items 1–8 need no backend and no billing. They make the free tier good enough to
be worth recommending, which is the only acquisition channel that works here.

---

## 4. Monetisation

Model in `docs/forecast.mjs`. Assumptions are guesses; the structure is robust.

**Blended net per consumer sale: £20.67.** Season Pass £19.99 (60%), annual
£24.99 (35%), monthly ~£15 (5%), less fees.

| | Y1 | Y2 | Y3 | Y3 from schools |
|---|---|---|---|---|
| Conservative | £764 | £4,401 | £13,511 | 74% |
| Base | £4,365 | £21,955 | £61,691 | 53% |
| Optimistic | £25,780 | £109,523 | £274,147 | 36% |

### The number that decides everything
**Consumer revenue per signup: £0.50.**

- **Paid acquisition is impossible.** Student CAC runs £1–5. Growth must be
  entirely organic, word-of-mouth, or teacher-driven.
- **£100k of consumer revenue needs ~201,600 signups** — two-thirds of the
  entire UK A-Level cohort.
- **£100k of school revenue needs 182 accounts** at £550.

### Sensitivity (Year 2, base case)
| Lever | Change |
|---|---|
| Schools 15 → 40 | **+63%** |
| Signups +50% | +31% |
| Conversion 6% → 9% | +31% |
| Activation 40% → 55% | +23% |
| Renewal 35% → 55% | **+4%** |

Student renewal barely moves revenue. Schools dominate. The two cycles are also
counter-cyclical — school budgets release Sept–Oct, exactly the dead trough of
the student calendar.

### What follows
- **The free tier's job is distribution, not revenue.** At 50p per signup
  against £550 per school, squeezing students adds friction to the only
  acquisition channel that works. Free = **3 subjects**; charge for exam mode,
  past papers, readiness, weak-point report — the things that appear at peak
  panic.
- **Sync is free.** A free tier that loses work ends word of mouth. ~£0.02/user/yr.
- **Price against `targetDate`**, which the app already collects: "everything
  unlocked until 31 July". Matches the student's mental model, no auto-renew
  anxiety, and converts churn into re-acquisition.
- **30-day full trial, no card.** The product's value is not observable until
  week three; any paywall before that asks people to pay for an unkept promise.
  Ask on day 31, on a screen built from their own review history.
- **Highest-intent moment is pre-deadline mode, 21 days out.** Put the upgrade there.
- **Parent-pays link.** Under-18s often have no card, and in the UK contracts
  with minors are voidable.
- **Merchant of record (Paddle / Lemon Squeezy), not raw Stripe.** ~5% vs ~2.9%,
  but they handle VAT — which is due on EU digital sales from the first
  transaction, and forces registration past £90k UK turnover.

Year 1 is not a revenue year in any scenario. Judge it on signups, activation,
and whether any teacher asks about a class version.

---

## 5. Not doing

Ads. Coins, XP, streak freezes, or any consumable. Social feeds and
leaderboards. AI question generation. Paywalled data export. Gating the
scheduling engine itself.

Streaks, if built, count **sessions completed when something was due** — never
calendar days. The algorithm giving you a rest day must not break a streak.
