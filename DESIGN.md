---
name: Practice Coach
description: A calm, quietly premium practice scheduler in the register of Things, Bear, and Craft.
colors:
  accent: "#3b62d9"
  accent-hover: "#2f51bd"
  accent-wash: "#eaeeff"
  on-solid: "#ffffff"
  bg: "#edecea"
  surface: "#fbfbf9"
  surface-sunken: "#e4e3df"
  text: "#1c1c1e"
  text-secondary: "#55555f"
  text-tertiary: "#66666f"
  hairline: "#dbdad5"
  overdue: "#b23a32"
  overdue-wash: "#fdecea"
  attention: "#8a5c07"
  attention-wash: "#fdf2dd"
  steady: "#3f6d60"
  steady-wash: "#e6f2ee"
typography:
  display:
    fontFamily: "\"Segoe UI Variable Display\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.021em"
  title:
    fontFamily: "\"Segoe UI Variable Display\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: 1.28
    letterSpacing: "-0.017em"
  headline:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.011em"
  body:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.003em"
  callout:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "normal"
  footnote:
    fontFamily: "\"Segoe UI Variable Small\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "\"Segoe UI Variable Small\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  input:
    fontFamily: "\"Segoe UI Variable Text\", \"Segoe UI\", -apple-system, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    typography: "{typography.callout}"
  button-secondary:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Practice Coach

## Overview

**Creative North Star: "The Well-Made Tool"**

The register of Things, Bear, and Craft: calm, precise, quietly premium. Something you are
glad to open when you are tired. The interface never performs; it gets out of the way and
leaves one obvious next action.

This is a deliberate, full replacement of an earlier "library date-due slip" concept,
which tested as too austere, too dense, and too flat in hierarchy. The paper metaphor is
gone. What replaces it is soft, generous, and modern: a soft off-white ground, warmer near-white cards
floating on it with very soft shadows, one accent used sparingly, and typography doing
almost all of the hierarchical work.

The single hardest rule here is restraint about words. This product has a lot it *could*
explain, and the previous version explained all of it at once. Now the screen states what
to do; the reasoning is one tap away and never competes with the action.

**Key Characteristics:**
- Soft off-white ground and cards — never pure white — with very soft shadows
- One accent, spent only on the primary action and the active state
- Large clear type steps; hierarchy comes from size and weight, never from boxes
- Generous padding and breathing room; density is low by choice
- Status colour appears as a small dot or short label, never as a filled panel
- Every explanation is progressive: headline first, reasoning on request

## Colors

A neutral, slightly cool near-white system with one confident accent and three quiet
status hues that appear only in small doses.

### Primary
- **Accent Blue** (`#3b62d9`): the primary action, the active nav item, the committed
  review date, focus rings. Nothing else. Its scarcity is what makes the next action
  obvious on every screen.

### Tertiary — skill hues
Six categorical identities, markers only: violet (`#7b3fd4`), teal (`#0d8f8f`), orange
(`#d1622a`), rose (`#c0397a`), olive (`#5c8a1f`), steel (`#2f6f9e`). Lightened in dark
mode. They give the agenda, filters and skill lists scannable identity at a glance.

### Secondary
- **Overdue Red** (`#b23a32`): overdue and failed only.
- **Attention Amber** (`#8a5c07`): weak points, capacity warnings — the middle severity.
- **Steady Green** (`#3f6d60`): on track, and the plateau flag. Calm, never celebratory.

### Neutral
- **Ink** (`#1c1c1e`): primary text.
- **Secondary Ink** (`#55555f`): supporting lines and descriptions.
- **Tertiary Ink** (`#66666f`): metadata, timestamps, placeholders.
- **Ground** (`#edecea`) / **Surface** (`#fbfbf9`): page behind, cards in front. Neither is
  pure white — a full screen of `#fff` is what makes a light UI tiring to read.
- **Sunken** (`#e4e3df`): inset fills — inputs, segmented controls, quiet buttons.
- **Hairline** (`#dbdad5`): list separators only. Never a card border.

### Named Rules
**The Single Accent Rule.** One accent, one job: the thing to do next. If two things on a
screen are accent-coloured, one of them is wrong. The categorical skill hues below are not
accents and do not count against this — they never mark an action.

**The Skill Hue Rule.** Each skill carries one of six categorical hues, assigned by its
position in the skill list so the first six are always distinct. A hue may only appear as
a marker (a dot), a meter fill, or a 4px band along the *top* edge of a card — never the
left or right edge, which is the coloured-border card everyone ships. It is never text
colour, never a solid fill behind text, and never indicates status — which is why it cannot fail contrast or be confused
with overdue, attention, or steady.

**The Small Dose Rule.** Status colour appears as a dot, a short label, or coloured text —
never as a filled background panel. A screen with three coloured blocks has lost its
hierarchy.

## Typography

**Font:** Segoe UI Variable (with Segoe UI, -apple-system, system-ui). One family
throughout, across eight sizes. No serif, no monospace as costume.

**Numerals:** tabular figures for dates, intervals, counts, and durations, so columns of
numbers line up and changing values do not shift the layout.

**Character:** The type is the design. A single humanist UI family, tightly tracked at
display sizes and comfortably loose in body copy, carrying the entire hierarchy so the
layout can stay free of rules and boxes.

### Hierarchy

Nine steps. Every `font-size` resolves to one of these tokens.

- **Hero** (700, 3rem, −0.03em): the count of things due on Today, and nothing else.
- **Display** (700, 1.75rem, −0.021em): the one page title per screen.
- **Title** (600, 1.3125rem): section headings, onboarding headings.
- **Headline** (600, 1.0625rem): the name of a practice item, card titles.
- **Body** (400, 0.9375rem, 1.6): prose. Measure capped at 66ch.
- **Callout** (500, 0.875rem): buttons, method instructions, denser interactive text.
- **Footnote** (400, 0.8125rem): supporting lines, hints, metadata.
- **Caption** (600, 0.75rem): labels, badges, nav items, column headers.
- **Input** (400, 1rem): every text field. Exactly 16px, because anything smaller
  makes iOS zoom the page when the field takes focus.

### Named Rules
**The Short Copy Rule.** A hint is one short line. Anything longer belongs behind a
disclosure or does not belong. Where a number can carry the meaning, use the number: the
day's size is a 3rem numeral, not a sentence.

**The Two-Step Rule.** Adjacent levels in the hierarchy differ by size *and* weight, never
by colour alone. If two things look similar, one of them moves a full step.

## Layout

Phone-first, single column. Content is capped at 34rem on phones, 40rem on tablet, and
sits in the right-hand column of a two-column grid on desktop.

Three navigation tiers: a fixed bottom tab bar below 720px; a horizontal row under the
masthead from 720px; and a **fixed left side panel from 960px**, 15rem wide, with the
brand and theme control above the nav items and a full-height hairline dividing it from
the content.

Spacing runs 4 / 8 / 12 / 20 / 32 / 48. Cards carry 20px of internal padding, sections are
separated by 32px, and headings always have more space above than below. Density is
deliberately low: whitespace is the main tool for showing what belongs together.

## Elevation & Depth

Soft shadows, never borders, define cards. A card sits *on* the ground rather than being
cut into it. In dark mode, shadows are nearly invisible and separation comes from a
lighter surface instead.

### Shadow Vocabulary
- **Card rest** (`0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px rgb(0 0 0 / 0.05)`): every card.
- **Card raised** (`0 2px 4px rgb(0 0 0 / 0.05), 0 12px 28px rgb(0 0 0 / 0.09)`): the
  active recall panel and the fixed bottom bar, which float above their surroundings.

### Named Rules
**The No Border Rule.** Cards get a shadow, never a 1px border, and never both. Hairlines
exist only to separate rows inside a single card.

## Shapes

Softly rounded and consistent: 18px on cards, 12px on buttons, inputs, and inset fills,
8px on small chips and badges, and full pills only on status dots and counts. Nothing in
the system is square.

## Components

### Buttons
- **Primary:** accent fill, white text, 10px radius, 12/20px padding, 44px minimum height.
- **Secondary:** sunken fill, ink text, same geometry. The default for anything not primary.
- **Plain:** text only in secondary ink, for dismiss and cancel.
- **States:** hover darkens the fill by one step; focus draws a 2px accent ring at 2px
  offset; active presses to 0.98 scale. Focus is never removed.

### Cards
20px padding, 14px radius, white surface, card-rest shadow, no border. Cards group
genuinely separable things — a practice item, a form, a result. Never used to fence off a
paragraph.

### Agenda (signature)
The Upcoming schedule. One card per day (or week / month / quarter as the horizon
widens), headed by the date and a review count, and divided inside by skill. Below three
months there are too many reviews to name, so each skill shows a count and a spread of
days instead of a list. The card answers three questions in reading order: when, which
skill, and what.

Never shows a duration. Effort estimates are the user's to make, so the app reports what
it knows — how many things are due, and which — and nothing it would have to invent.

### Practice item (signature)
A card per due item. Title in headline weight, a small coloured status dot before it when
it is not on track, a one-line method summary in secondary ink, and a single primary
button. Everything else — the full method detail, the interleaving partner, the reasoning
behind a flag — lives behind a quiet "Why this?" disclosure and is closed by default.

### Disclosure (signature)
The mechanism that keeps this product's explanatory weight off the screen. A small plain
control labelled in the product's own words ("Why this?", "Show detail") that expands in
place. The interface is expected to look under-explained until asked.

### Inputs
Sunken fill, no border at rest, 10px radius, 44px minimum height, 16px font size so iOS
does not zoom. Focus swaps the fill to surface and adds the accent ring.

### Navigation
Bottom tabs on phone, top row on tablet, left panel on desktop. The active item is accent
text on an accent-wash pill; inactive is tertiary ink. Counts sit right-aligned as pills.

## Do's and Don'ts

### Do:
- **Do** lead every screen with one display-size title and exactly one primary action.
- **Do** put reasoning behind a disclosure, closed by default.
- **Do** separate rows inside a card with hairlines, and separate cards with space.
- **Do** use tabular figures for every date, interval, count and duration.
- **Do** keep touch targets at 44px and the primary action inside the thumb arc.
- **Do** count load in items. Never print an estimated duration for practice.
- **Do** group any list that spans more than one skill by skill.

### Don't:
- **Don't** put a border and a shadow on the same element, or a border on a card at all.
- **Don't** fill a panel with a status colour; a dot or coloured label is the whole dose.
- **Don't** show two accent-coloured elements on one screen.
- **Don't** use a skill hue as text colour, as a fill behind text, or to mean status.
- **Don't** print more than two lines of explanation before the primary action.
- **Don't** reintroduce serif or monospace faces; one family carries the whole system.
