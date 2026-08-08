# Practice Coach — Flutter

A port of the vanilla-JS web app in the repository root. Flutter builds web,
Android and iOS from one codebase, which is what the roadmap needed: the web
version stays the free distribution channel while iOS gets real App Store
presence, notifications and widgets.

**The web app in the repo root is still the deployed one.** This lives alongside
it until it reaches parity, so nothing that works today stops working.

## Layout

    lib/engine/   pure Dart, no Flutter imports — mirrors src/engine/
    lib/store/    persistence
    lib/ui/       screens and the design system
    test/         parity tests ported from test/engine.test.js

## Data compatibility

The JSON shape is deliberately identical to the web app's, so an export from one
imports into the other without translation. There is a test pinning that.

## Running

    flutter test
    flutter run -d chrome
