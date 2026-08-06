# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single self-directed learner running one or more skills at once — a student with an
exam date, someone learning a language, an instrumentalist, a person memorising a body of
facts. They use it in a short daily session, most often on a phone, away from a desk:
before a lesson, on a commute, at the end of a study block. They are not a teacher and
have no cohort; nobody else sees this data.

Sessions are short and repetitive, so the surface is read hundreds of times. Familiarity
and low friction matter more than first-run impressiveness.

## Product Purpose

Tells the user *what* to practise and *when*, and how the session should be structured.
It never teaches the skill itself — it owns the schedule, the method, and the encoding
around it.

Success is a session that ends: the user knows what to do, does it, records an honest
result, and stops. A user who practises the right three things for twenty minutes has
succeeded over one who re-reads everything for an hour.

## Positioning

Generic flashcard apps schedule *items*. This schedules by **genre**: what the skill is
determines the algorithm, the interval curve, and the practice method. Reasoning topics
are never reviewed alone (interleaving is the mechanism, not a setting); closed physical
skills start blocked then randomise; open physical skills are randomised from day one;
memorisation runs strict per-item SM-2 with individual ease factors.

Two further mechanisms a neighbouring product could not truthfully copy:

- Three "OK"s running is treated as a **plateau, not stability** — it escalates the
  practice format rather than repeating the schedule.
- Every rating states its own consequence before it is chosen ("back in 7d"), so the
  schedule is never a black box.

A written blind-recall attempt was previously required before any rating could be given.
The owner removed it as too much friction for daily use; ratings are now given directly.
Do not reintroduce it as a requirement without asking.

## Operating Context

The daily loop: log what you studied → it gets a first review date and a method →
each day the app surfaces what is due → blind-recall check → rate → the interval moves.

Runs fully local. Zero dependencies, no build step, no account, no network. State lives
in `localStorage` under `practice-coach:v1` and is reloaded on the next visit; schedules
are never recomputed from scratch. Data is exportable and importable as JSON.

## Capabilities and Constraints

- Five genres: language, reasoning, physical (closed/open), conceptual, memorization.
- Expanding-spacing curve (1→3→7→16→35→70, ×2.2), compressed to 1→2→5→10→22→48 for
  reasoning and conceptual. Memorization and language run per-item SM-2.
- A one-time forgetting-rate diagnostic scales every interval by 0.6×–1.5×.
- Flags: overdue, plateau, priority weak point, confusable pair, pre-deadline, overload.
- Forecast horizons of 2 weeks / 3 months / 1 year / 5 years. Only each item's *next*
  review is committed; everything beyond it is a projection assuming "OK" ratings, and
  the interface must never present a projection as a commitment.
- Daily load cap, counted in **things due, never in minutes**. How long practice takes
  depends on the material and the person, so the app does not estimate it; redistribution
  still refuses to move overdue or priority-weak work.
- Guardrail: re-drilling something not yet due is blocked, with an override.
- Technical constraint: **vanilla ES modules and plain CSS, no dependencies, no build
  step, no network requests.** Typography must come from system font stacks; webfonts
  and CDN assets are not available.

## Brand Commitments

Name: Practice Coach. Voice: plain, specific, and willing to say why — it explains the
reasoning behind a scheduling decision in one sentence rather than asserting it. It tells
the user to stop when the day is done. No streaks, no points, no guilt mechanics.

The user has chosen, and reaffirmed, that this should sit alongside **Things, Bear, and
Craft**: calm, precise, quietly premium, restrained with colour, generous with space, and
never cute. That is a standing preference, not a one-off styling note — the convention is
the commitment, and it is to be executed at that craft level rather than reinterpreted.

## Evidence on Hand

The scheduling engine is real and covered by 44 passing tests (`npm test`). Every flag,
interval, and forecast the interface displays is computed, not illustrative. There are no
users, testimonials, benchmarks, or usage numbers, and none may be invented.

## Product Principles

1. **The schedule is the product.** Effort goes into deciding what is due and why, not
   into content the user already owns.
2. **Rating is fast.** The daily loop is used tired and often one-handed; anything that
   adds a step between "I remember this" and recording it will not survive contact with
   real use.
3. **Say why, once.** Every flag carries its reasoning in one sentence; the user learns
   the method by using it.
4. **A session must end.** The interface actively discourages extra work once the day is
   cleared.
5. **Never overstate certainty.** A projection is labelled as a projection.

## Accessibility & Inclusion

Used daily and often one-handed on a phone, in varying light — light and dark themes are
a requirement, not a preference. Status must never be carried by colour alone; it is
already redundantly encoded as running order, badge text, and tint. Skill identity is
carried by a colour marker *and* the skill name, never colour alone. Rating the current
item must be reachable from the keyboard.
