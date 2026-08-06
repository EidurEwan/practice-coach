# Practice Coach — Skill Practice Scheduler

Tells you *what* to practise and *when*, based on the science of skill acquisition and
memory. It does not teach the skill — it designs the schedule, method and encoding
around it.

Zero dependencies. Plain ES modules, `localStorage` persistence, Node's built-in test
runner.

## Run it

```bash
node serve.js
```

Then open <http://localhost:4173>. State (skills, topics, review history, ease factors)
is saved in the browser and reloaded on the next visit — nothing is recomputed from
scratch.

```bash
npm test
```

45 tests covering the scheduling engine.

## How it works

### Tracks and genres

Each skill is its own track. The genre is auto-detected from the name (overridable) and
decides the method stack, the interval curve, and whether scheduling happens per topic
or per item.

| Genre | Scheduling | Method stack |
|---|---|---|
| `language` | per-item SM-2 | Comprehensible input + SRS + low-stakes output |
| `reasoning` | per-topic, compressed curve, **always interleaved** | Spaced retrieval + interleaving + worked-example fading |
| `physical — closed` | per-topic, ≥1 sleep cycle | Blocked for 2 sessions, then randomized |
| `physical — open` | per-topic, ≥1 sleep cycle | Variable/reactive from day one |
| `conceptual` | per-topic, compressed curve, **always interleaved** | Retrieval + elaborative interrogation + concept mapping |
| `memorization` | per-item SM-2 | SRS + mnemonic/chunk encoding at first exposure |

Blends are flagged at intake rather than forced into one genre.

### Intervals

- Base curve `1 → 3 → 7 → 16 → 35 → 70` days (≈ ×2.2), extrapolated beyond the table.
- Reasoning and conceptual use a compressed `1 → 2 → 5 → 10 → 22 → 48`.
- Memorization and language items run strict SM-2, each carrying its own ease factor —
  never averaged across a topic.
- Every interval is scaled by the skill's calibration factor and floored at one day, so
  nothing ever repeats without a sleep cycle.

### Calibration

The optional intake diagnostic asks for a real blind recall on 2–3 things learned *N*
days ago. It back-solves memory stability from `R(d) = exp(−d/S)` against a reference
single-exposure stability of 7 days, damps the result with a square root, and clamps to
`0.6×–1.5×`. Fast forgetters get compressed intervals; strong retainers get stretched
ones.

### Ratings

Each rating button states what it will do to the schedule before you press it ("back in
7d"), computed by the same arithmetic the real rating uses. Any rating can be undone.

(Earlier versions required a written blind-recall attempt before rating. That was removed
as too much friction for daily use.)

| Rating | Effect |
|---|---|
| Easy | next interval ×1.3, ease up |
| OK | schedule unchanged |
| Hard | next interval ×0.6, ease down |
| Failed | reset to 1 day, flagged weak, interleaved more often |

### Flags the engine raises

- **Plateau** — three "OK"s running is stalling, not stability. The practice format
  escalates one rung (worked example → guided → independent → mixed → timed); at the top
  of the ladder it asks for external feedback instead.
- **Priority weak point** — three hard/failed sessions running shortens that item's
  spacing *permanently* (×0.7 per strike, floored at 40%) and asks which sub-skill is
  actually failing.
- **Confusable pairs** — kept apart while either is still shaky so each becomes
  independently solid, then deliberately scheduled together as a discrimination drill
  once both are stable.
- **Overdue** — always ordered first, and never silently skipped.
- **Overload** — days over the daily cap get a warning plus a one-click redistribution
  that refuses to move overdue work or priority weak points. The cap counts **things due,
  never minutes**: how long practice takes is the user's business, not the app's.
- **Pre-deadline** — inside the target-date window every method switches to timed,
  exam/performance-format conditions, and logging new material gets challenged.

### Guardrails

Re-drilling something that is not due is blocked with a redirect to what actually is due
(an explicit override exists for the cases where you mean it).

### The forecast

The Upcoming tab is an agenda: one card per day, divided inside by skill, so you can see
what you are reviewing and when. It projects out to **2 weeks, 3 months, 1 year, or 5
years**, and the detail scales with the horizon — items are named per day up to three
months, then counted per skill beyond that. It can be filtered to a single skill.

Each row is marked `next` (actually scheduled) or `3rd` (the same item coming back again,
projected), because the same topic recurring on several days was the main source of
confusion.

Only each item's **next** review is a committed date. Everything past it assumes an
unbroken run of "OK" ratings, so the far end is a shape rather than a promise — one
"failed" collapses that item to a 1-day interval and shifts the rest of its chain. The UI
labels this explicitly and marks the committed date distinctly from projected ones.

A consequence worth expecting: mature items go quiet. Because intervals grow ×2.2, a
well-established topic can have reviews in 2027 and 2029 and then nothing inside the
5-year window at all. Empty quarters at the tail are the curve working, not missing data.

### Keyboard

While a review is open: `1`–`4` rate easy/OK/hard/failed, `Esc` cancels.

### First run

A guided five-step flow — welcome, skill, target date, optional forgetting-rate
diagnostic, first topic — ending on a confirmation that shows the first review chain
already stamped. Skippable at any step, and it never blocks: skipping just drops you into
the app. An existing saved store is treated as already-onboarded, so upgrading does not
replay it.

### Design

The interface is documented in [DESIGN.md](DESIGN.md), with product truth in
[PRODUCT.md](PRODUCT.md). The register is *the well-made tool* — the calm, quietly premium
feel of Things, Bear and Craft: near-white ground, white cards on soft shadows, one accent
spent only on the next action, and typography carrying the hierarchy.

Each skill also carries one of six categorical hues, used only as a marker or meter fill,
so the schedule and filters are scannable at a glance without reading labels.

Three navigation tiers: a bottom tab bar on phones, a row under the masthead from 720px,
and a fixed left side panel from 960px that holds still while content scrolls. Light and
dark both ship, following the system with a toggle that sticks; the choice is applied
before first paint so the wrong theme never flashes.

Typography is system-stack only — no webfonts, no network requests — on an eight-step ramp
where every `font-size` in the stylesheet resolves to a token.

## Layout

```
index.html          shell
styles.css
serve.js            zero-dep static server
src/
  store.js          persistence + migrations (localStorage / in-memory)
  engine/           pure, no DOM — imported by both the browser and the tests
    dates.js        day-granularity ISO date maths
    genres.js       genre detection + genre → method map
    curve.js        interval curves, SM-2, calibration
    model.js        skills, items, confusable pairs
    methods.js      genre + state → concrete instruction and work units
    scheduler.js    review updates, session building, interleaving, capacity
    diagnostic.js   forgetting-rate diagnostic
    card.js         the spec's output format as copyable text
  ui/
    dom.js          tiny element helper (no innerHTML anywhere)
    app.js          controller: transient state + actions
    views/          today, log, upcoming, skills
test/engine.test.js
```

The engine is pure and DOM-free, so the scheduling logic is testable without a browser
and reusable if you want a CLI or a different frontend on top.
