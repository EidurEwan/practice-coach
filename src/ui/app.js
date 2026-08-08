// Controller: owns transient UI state and wires user actions to the engine.
// Rendering happens only on explicit actions, so typing never destroys a field.

import { h, mount, svg } from './dom.js';
import { addDays, todayISO, shortDate, weekday } from '../engine/dates.js';
import { detectGenre } from '../engine/genres.js';
import { createSkill } from '../engine/model.js';
import {
  buildSession,
  deferItem,
  dueBlockCount,
  logNewItem,
  overdueItems,
  redistribute,
  restoreSchedule,
  reviewItem,
  setSkillSuspended,
  setSubSkill,
  setTargetDate,
  snapshotSchedule,
} from '../engine/scheduler.js';
import { formatLogCard, formatReviewCard } from '../engine/card.js';
import { runDiagnostic } from '../engine/diagnostic.js';
import { createStore, localStorageAdapter } from '../store.js';

import { RATINGS, todayView } from './views/today.js';
import { logView } from './views/log.js';
import { skillsView } from './views/skills.js';
import { upcomingView } from './views/upcoming.js';
import { ONBOARD_STEPS, onboardingView } from './views/onboarding.js';

const ROUTES = [
  { id: 'today', label: 'Today' },
  { id: 'log', label: 'Log' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'skills', label: 'Skills' },
];

// Drawn from the product's own vocabulary rather than a generic icon set: the
// point you are at, adding to the record, dates ahead, and one meter per track.
// Four text labels with two of them carrying badges were impossible to scan at
// a glance, and the badges pushed their labels off the shared baseline.
const TAB_ART = {
  today: (s) => [
    s('circle', { cx: 12, cy: 12, r: 7.6 }),
    s('circle', { cx: 12, cy: 12, r: 2.7, fill: 'currentColor', stroke: 'none' }),
  ],
  log: (s) => [s('path', { d: 'M12 5.6v12.8M5.6 12h12.8' })],
  upcoming: (s) => [
    s('rect', { x: 3.4, y: 5.4, width: 17.2, height: 15.2, rx: 3.2 }),
    s('path', { d: 'M3.4 10.2h17.2M8.4 3.6v3.4M15.6 3.6v3.4' }),
  ],
  skills: (s) => [s('path', { d: 'M4.6 7.2h14.8M4.6 12h10M4.6 16.8h5.6' })],
};

function tabIcon(id) {
  return svg('svg', {
    class: 'tab-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.7,
    'stroke-linecap': 'round',
    'aria-hidden': 'true',
  }, TAB_ART[id](svg));
}

const VIEWS = { today: todayView, log: logView, upcoming: upcomingView, skills: skillsView };

const THEMES = [
  { id: 'system', glyph: '◐', label: 'Theme: follow system' },
  { id: 'light', glyph: '☀', label: 'Theme: light' },
  { id: 'dark', glyph: '☾', label: 'Theme: dark' },
];

function freshIntake() {
  return {
    open: false,
    name: '',
    level: '',
    targetDate: '',
    genre: '',
    genreTouched: false,
    physicalType: null,
    detected: null,
    diagnosticOpen: false,
    diagnostic: [
      { prompt: '', daysSince: null, score: null },
      { prompt: '', daysSince: null, score: null },
      { prompt: '', daysSince: null, score: null },
    ],
  };
}

function freshOnboard() {
  return {
    step: 0,
    name: '',
    genre: '',
    genreTouched: false,
    physicalType: 'closed',
    detected: null,
    level: '',
    targetDate: '',
    diagnostic: [
      { prompt: '', daysSince: null, score: null },
      { prompt: '', daysSince: null, score: null },
    ],
    topic: '',
    subSkill: '',
    encoding: '',
    shaky: false,
    result: null,
  };
}

const app = {
  store: createStore(localStorageAdapter(globalThis.localStorage, {
    onWriteError: () => { showSaveAlert(true); },
  })),
  todayISO: todayISO(),
  ui: {
    route: 'today',
    date: todayISO(),
    activeBlock: null,
    batchIndex: {},
    revealed: {},
    lastResult: null,
    lastLog: null,
    focusAfter: null,
    notice: null,
    horizon: '2w',
    skillFilter: null,
    logDraft: { skillId: null, bulk: false },
    intake: freshIntake(),
    onboard: freshOnboard(),
    expandedSkill: null,
    importOpen: false,
    // Every render rebuilds the DOM, so a <details> would snap shut on the next
    // action. Starting a card inside the backlog re-renders, so without this the
    // disclosure closes around the panel the user just opened.
    backlogOpen: false,
  },

  get onboarding() {
    // Still in the flow while the confirmation step is showing: `onboarded` is
    // committed as soon as the skill is created, so that a reload at that point
    // keeps the user's data and drops them into the app rather than repeating.
    return !this.store.state.settings.onboarded || this.ui.onboard.result !== null;
  },

  // ------------------------------------------------------------- navigation
  go(route) {
    this.ui.route = route;
    this.ui.activeBlock = null;
    this.ui.notice = null;
    render();
    window.scrollTo({ top: 0 });
  },
  shiftDate(days) {
    this.ui.date = addDays(this.ui.date, days);
    this.ui.activeBlock = null;
    render();
  },
  resetDate() {
    this.ui.date = this.todayISO;
    this.ui.activeBlock = null;
    render();
  },

  // ------------------------------------------------------------------ theme
  cycleTheme() {
    const current = this.store.state.settings.theme || 'system';
    const next = THEMES[(THEMES.findIndex((t) => t.id === current) + 1) % THEMES.length].id;
    this.store.update((state) => { state.settings.theme = next; });
    applyTheme(next);
    render();
  },

  // -------------------------------------------------------------- onboarding
  setOnboard(patch) {
    Object.assign(this.ui.onboard, patch);
    return this.ui.onboard;
  },
  setDiagnosticRow(index, field, value) {
    this.ui.onboard.diagnostic[index][field] = value;
    return this.ui.onboard;
  },
  onboardNext() {
    this.ui.onboard.step = Math.min(this.ui.onboard.step + 1, ONBOARD_STEPS.length - 1);
    render();
    window.scrollTo({ top: 0 });
  },
  onboardBack() {
    this.ui.onboard.step = Math.max(0, this.ui.onboard.step - 1);
    render();
    window.scrollTo({ top: 0 });
  },
  skipOnboarding() {
    this.store.update((state) => { state.settings.onboarded = true; });
    this.ui.route = this.store.state.skills.length ? 'today' : 'skills';
    render();
  },
  finishOnboarding() {
    const ob = this.ui.onboard;
    const answered = ob.diagnostic.filter((r) => r.score != null && r.daysSince);
    const diagnostic = answered.length ? runDiagnostic(answered) : null;

    const skill = createSkill({
      name: ob.name,
      genre: ob.genre,
      physicalType: ob.physicalType,
      blend: ob.detected?.blend || [],
      level: ob.level,
      targetDate: ob.targetDate || null,
      calibration: diagnostic?.calibration ?? 1,
      diagnostic,
    });

    const result = this.store.update((state) => {
      state.skills.push(skill);
      state.settings.onboarded = true;
      return logNewItem(state, skill.id, {
        title: ob.topic,
        subSkill: ob.subSkill,
        encoding: ob.encoding,
        shaky: ob.shaky,
        firstExposure: this.todayISO,
      });
    });

    ob.result = result;
    ob.step = ONBOARD_STEPS.indexOf('done');
    this.ui.logDraft.skillId = skill.id;
    render();
    window.scrollTo({ top: 0 });
  },
  leaveOnboarding() {
    this.ui.route = 'today';
    this.ui.onboard = freshOnboard();
    render();
  },
  restartOnboarding() {
    this.store.update((state) => { state.settings.onboarded = false; });
    this.ui.onboard = freshOnboard();
    render();
  },

  // ----------------------------------------------------------- review flow
  startBlock(id) {
    this.ui.activeBlock = id;
    this.ui.batchIndex[id] = 0;
    this.ui.lastResult = null;
    render();
  },
  closeBlock() {
    this.ui.activeBlock = null;
    render();
  },
  reveal(itemId) {
    this.ui.revealed[itemId] = true;
    render();
  },
  rate(block, item, rating) {
    // Captured before the write so a mis-tap is always reversible.
    const undoSnapshot = snapshotSchedule(this.store.state);
    const result = this.store.update((state) => reviewItem(state, item.id, {
      rating,
      date: this.ui.date,
    }));

    if (result.blocked) {
      this.ui.lastResult = null;
      this.ui.activeBlock = null;
      this.ui.notice = { level: 'danger', message: result.message };
      render();
      return;
    }
    this.ui.notice = null;

    delete this.ui.revealed[item.id];

    this.ui.lastResult = {
      result,
      undoSnapshot,
      cardText: formatReviewCard(this.store.state, result, this.ui.date),
    };
    announce(`${item.title} rated ${rating}. Next review ${result.item.intervalDays} day${result.item.intervalDays === 1 ? '' : 's'} from now.`);
    this.ui.focusAfter = '.slip-row .btn.primary, .empty .btn.primary';

    // Batches shrink as items are rated, so restart at the top of what is left.
    if (block.kind === 'batch') {
      this.ui.batchIndex[block.id] = 0;
      const remaining = buildSession(this.store.state, this.ui.date)
        .blocks.find((b) => b.id === block.id);
      this.ui.activeBlock = remaining ? block.id : null;
    } else {
      this.ui.activeBlock = null;
    }
    render();
  },
  dismissResult() {
    this.ui.lastResult = null;
    render();
  },
  /** Roll back the last rating, including any confusable-pair side effects. */
  undoLastRating() {
    const snapshot = this.ui.lastResult?.undoSnapshot;
    if (!snapshot) return;
    const title = this.ui.lastResult.result.item.title;
    this.store.update((state) => restoreSchedule(state, snapshot));
    this.ui.lastResult = null;
    this.ui.activeBlock = null;
    this.ui.notice = { level: '', message: `Undone — "${title}" is back on its previous schedule.` };
    announce(`Undone. ${title} is back on its previous schedule.`);
    render();
  },
  setItemSubSkill(itemId, value) {
    const item = this.store.update((state) => setSubSkill(state, itemId, value));
    this.ui.lastResult = null;
    this.ui.notice = item?.subSkill
      ? { level: '', message: `Noted — the next session on "${item.title}" targets "${item.subSkill}".` }
      : { level: '', message: 'Cleared.' };
    announce(this.ui.notice.message);
    render();
  },
  clearNotice() {
    this.ui.notice = null;
    render();
  },
  setHorizon(id) {
    this.ui.horizon = id;
    render();
  },
  /** The undo on an auto-suspended subject: put it back on the schedule. */
  resumeSkill(skillId) {
    const skill = this.store.update((state) => setSkillSuspended(state, skillId, false));
    this.ui.notice = { level: '', message: `"${skill.name}" is back on the schedule.` };
    announce(this.ui.notice.message);
    render();
  },
  suspendSkill(skillId) {
    const skill = this.store.update((state) => setSkillSuspended(state, skillId, true));
    this.ui.notice = { level: '', message: `"${skill.name}" is paused. Nothing is lost.` };
    announce(this.ui.notice.message);
    render();
  },
  setSkillTarget(skillId, date) {
    const skill = this.store.update((state) => setTargetDate(state, skillId, date));
    this.ui.notice = {
      level: '',
      message: skill.targetDate
        ? `"${skill.name}" is scheduled towards ${skill.targetDate}.`
        : `"${skill.name}" has no target date — it runs on the normal curve.`,
    };
    announce(this.ui.notice.message);
    render();
  },
  /** Re-render without changing state; for views that patch in place. */
  rerender() {
    render();
  },
  setSkillFilter(skillId) {
    this.ui.skillFilter = skillId;
    const name = this.store.state.skills.find((s) => s.id === skillId)?.name;
    announce(name ? `Filtered to ${name}.` : 'Showing all skills.');
    render();
  },
  /** Keyboard path into the currently open recall check. */
  rateActive(rating) {
    const block = buildSession(this.store.state, this.ui.date)
      .blocks.find((b) => b.id === this.ui.activeBlock);
    if (!block) return;
    const idx = this.ui.batchIndex[block.id] || 0;
    const item = block.items[Math.min(idx, block.items.length - 1)];
    this.rate(block, item, rating);
  },
  runAction(action) {
    this.store.update((state) => {
      if (action.type === 'redistribute') redistribute(state, action.blockIds, this.ui.date);
      if (action.type === 'defer') deferItem(state, action.itemId, action.days);
    });
    announce(action.type === 'redistribute' ? 'Moved to tomorrow.' : 'Deferred.');
    render();
  },

  // ------------------------------------------------------------ logging
  setLogSkill(skillId) {
    this.ui.logDraft.skillId = skillId;
    render();
  },
  setLogBulk(bulk) {
    this.ui.logDraft.bulk = bulk;
    render();
  },
  dismissLog() {
    this.ui.lastLog = null;
    render();
  },
  submitLog(form, skill) {
    const date = form.get('date') || this.ui.date;
    const bulk = (form.get('bulk') || '').trim();
    const results = [];

    this.store.update((state) => {
      if (bulk) {
        for (const line of bulk.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const [cue, answer, encoding] = line.split('|').map((p) => p.trim());
          results.push(logNewItem(state, skill.id, {
            title: answer ? `${cue} — ${answer}` : cue,
            cue,
            answer: answer || null,
            encoding: encoding || null,
            firstExposure: date,
          }));
        }
      } else {
        results.push(logNewItem(state, skill.id, {
          title: form.get('title'),
          subSkill: form.get('subSkill'),
          encoding: form.get('encoding'),
          cue: form.get('cue'),
          answer: form.get('answer'),
          shaky: form.get('shaky') === 'on',
          confusableWith: form.getAll('confusableWith'),
          firstExposure: date,
        }));
      }
    });

    const seen = new Set();
    const flags = [];
    for (const r of results) {
      for (const f of r.flags) {
        if (seen.has(f.message)) continue;
        seen.add(f.message);
        flags.push(f);
      }
    }

    this.ui.lastLog = {
      count: results.length,
      flags,
      cards: results
        .slice(0, 5)
        .map((r) => formatLogCard(this.store.state, { skill, ...r }, date)),
    };
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // ------------------------------------------------------------- intake
  toggleIntake() {
    const open = !this.ui.intake.open;
    this.ui.intake = { ...freshIntake(), open };
    render();
  },
  // These run on every keystroke, so none of them may call render() —
  // re-rendering would replace the field being typed into.
  detectSkillGenre(name) {
    const intake = this.ui.intake;
    intake.name = name;
    intake.detected = detectGenre(name);
    if (!intake.genreTouched) {
      intake.genre = intake.detected.genre || '';
      intake.physicalType = intake.detected.physicalType;
    }
    return intake;
  },
  setIntakeField(field, value) {
    this.ui.intake[field] = value;
    return this.ui.intake;
  },
  setIntakeGenre(genre) {
    this.ui.intake.genre = genre;
    this.ui.intake.genreTouched = true;
    return this.ui.intake;
  },
  setDiagnostic(index, field, value) {
    this.ui.intake.diagnostic[index][field] = value;
    return this.ui.intake;
  },
  submitSkill(form) {
    const answered = this.ui.intake.diagnostic.filter((r) => r.score != null && r.daysSince);
    const diagnostic = answered.length ? runDiagnostic(answered) : null;

    const skill = createSkill({
      name: form.get('name'),
      genre: form.get('genre'),
      physicalType: form.get('physicalType'),
      blend: this.ui.intake.detected?.blend || [],
      level: form.get('level'),
      targetDate: form.get('targetDate') || null,
      calibration: diagnostic?.calibration ?? 1,
      diagnostic,
    });

    this.store.update((state) => { state.skills.push(skill); });
    this.ui.intake = freshIntake();
    this.ui.logDraft.skillId = skill.id;
    this.ui.expandedSkill = skill.id;
    this.go('log');
  },

  // ------------------------------------------------------------- skills
  toggleSkill(id) {
    this.ui.expandedSkill = this.ui.expandedSkill === id ? null : id;
    render();
  },
  deleteSkill(skill) {
    const items = this.store.state.items.filter((i) => i.skillId === skill.id);
    const ok = window.confirm(
      `Delete "${skill.name}" and its ${items.length} tracked item(s), including all review history? This cannot be undone.`,
    );
    if (!ok) return;
    this.store.update((state) => {
      const ids = new Set(items.map((i) => i.id));
      state.skills = state.skills.filter((s) => s.id !== skill.id);
      state.items = state.items.filter((i) => i.skillId !== skill.id);
      state.reviews = state.reviews.filter((r) => r.skillId !== skill.id);
      state.confusables = state.confusables.filter((c) => !ids.has(c.a) && !ids.has(c.b));
    });
    render();
  },

  // ------------------------------------------------------------ settings
  setSetting(key, value) {
    if (!Number.isFinite(value) || value <= 0) return;
    this.store.update((state) => { state.settings[key] = value; });
    render();
  },
  importData() {
    this.ui.importOpen = !this.ui.importOpen;
    render();
  },
  applyImport(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.skills)) {
        throw new Error('That does not look like a Practice Coach export.');
      }
      this.store.replace(parsed);
      this.ui.importOpen = false;
      this.ui.logDraft.skillId = null;
      applyTheme(this.store.state.settings.theme);
      render();
    } catch (err) {
      window.alert(`Import failed: ${err.message}`);
    }
  },
  resetAll() {
    if (!window.confirm('Erase every skill, item and review record? This cannot be undone.')) return;
    this.store.reset();
    this.ui = {
      ...this.ui,
      route: 'today',
      logDraft: { skillId: null, bulk: false },
      intake: freshIntake(),
      onboard: freshOnboard(),
      lastLog: null,
      lastResult: null,
    };
    render();
  },
};

// ---------------------------------------------------------------- chrome

/** Screen readers get nothing from a silent re-render; say what changed. */
function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  // Re-setting the same string is ignored by some readers; defer to force it.
  requestAnimationFrame(() => { live.textContent = message; });
}

function showSaveAlert(failed) {
  const el = document.getElementById('save-alert');
  if (el) el.hidden = !failed;
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

// ------------------------------------------------------------------ motion

// A screen animates when the user *arrives* at it, never when it merely
// re-renders. Without that distinction, rating an item — which re-renders
// Today — would replay the entrance of the whole page after every single tap.
let lastScreen = null;

/**
 * Identifies "the screen the user is looking at". Two renders with the same key
 * are the same screen updating; a different key is somewhere new. The horizon
 * and the skill filter are part of the key because changing either replaces the
 * entire agenda — that is an arrival, not an update.
 */
function screenKey() {
  const { ui } = app;
  if (app.onboarding) return `onboard:${ui.onboard.step}`;
  if (ui.route === 'today') return `today:${ui.date}`;
  if (ui.route === 'upcoming') return `upcoming:${ui.horizon}:${ui.skillFilter || 'all'}`;
  return `route:${ui.route}`;
}

// Containers whose children are the real units: a list of practice cards should
// arrive card by card rather than as one slab.
const UNROLL = new Set(['slip', 'agenda', 'skill-totals', 'stack', 'ob-body']);
// Past this many the stagger stops accumulating, so the last card on a long
// screen is never more than a fifth of a second behind the first.
const STAGGER_CAP = 7;

/**
 * Mark the blocks a screen is built from so CSS can bring them in one at a
 * time. Nothing needs cleaning up afterwards: every render replaces these
 * nodes, so the class can only ever sit on elements that were just created.
 */
function markEntrance(host) {
  const root = host.firstElementChild;
  if (!root) return;

  // Onboarding animates only the step's own content — the progress bar and the
  // footer are fixtures of the flow and should hold still while it advances.
  const top = root.classList.contains('onboard')
    ? [...(root.querySelector('.ob-body')?.children || [])]
    : host.children.length > 1
      ? [...host.children]
      : [...root.children];

  let units = [];
  for (const el of top) {
    if ([...el.classList].some((c) => UNROLL.has(c))) units.push(...el.children);
    else units.push(el);
  }

  // A step or section that is one anonymous wrapper is not one unit — it is a
  // container the view happened to need. Descend until there is real structure.
  for (let depth = 0; depth < 2; depth += 1) {
    const [only] = units;
    if (units.length !== 1 || only.tagName !== 'DIV' || only.className || only.children.length < 2) break;
    units = [...only.children];
  }

  units.forEach((el, i) => {
    el.classList.add('enter-unit');
    el.style.setProperty('--i', String(Math.min(i, STAGGER_CAP)));
  });
}

// ---------------------------------------------------------------- rendering

// The tab bar is built once and patched thereafter. Re-mounting it on every
// render would replace the buttons mid-transition, so the indicator could never
// slide and the colour change would always land instantly.
let tabNodes = null;

function buildTabs(tabs) {
  tabs.style.setProperty('--tab-count', String(ROUTES.length));
  tabNodes = ROUTES.map((r) => {
    const count = h('span', { class: 'count', hidden: true });
    const button = h('button', {
      onClick: () => app.go(r.id),
    }, tabIcon(r.id), h('span', { class: 'tab-label' }, r.label), count);
    return { id: r.id, button, count };
  });
  mount(tabs, tabNodes.map((t) => t.button));
}

function renderChrome() {
  const onboarding = app.onboarding;
  const masthead = document.getElementById('masthead');
  const tabs = document.getElementById('tabs');

  masthead.hidden = onboarding;
  tabs.hidden = onboarding;
  document.body.classList.toggle('is-onboarding', onboarding);
  if (onboarding) {
    mount(tabs);
    tabNodes = null;
    return;
  }

  const state = app.store.state;
  const due = dueBlockCount(state, app.ui.date);
  const overdue = overdueItems(state, app.ui.date).length;

  if (!tabNodes) buildTabs(tabs);

  const badges = { today: due, skills: state.skills.length };
  for (const { id, button, count } of tabNodes) {
    button.setAttribute('aria-current', String(id === app.ui.route));
    const n = badges[id] || 0;
    count.hidden = n === 0;
    count.textContent = String(n);
    count.className = `count ${id === 'today' && overdue ? 'alert' : ''}`;
  }
  tabs.style.setProperty('--tab-index', String(ROUTES.findIndex((r) => r.id === app.ui.route)));

  document.getElementById('stamped-date').textContent =
    app.ui.date === app.todayISO
      ? `${weekday(app.todayISO)} ${shortDate(app.todayISO)}`
      : `viewing ${shortDate(app.ui.date)}`;

  const theme = THEMES.find((t) => t.id === (state.settings.theme || 'system')) || THEMES[0];
  const toggle = document.getElementById('theme-toggle');
  toggle.textContent = theme.glyph;
  toggle.setAttribute('aria-label', `${theme.label}. Activate to change.`);
  toggle.title = theme.label;
}

function render() {
  renderChrome();
  showSaveAlert(app.store.saveFailed);
  const view = app.onboarding ? onboardingView : (VIEWS[app.ui.route] || todayView);
  const host = document.getElementById('view');
  mount(host, view(app));

  const key = screenKey();
  if (key !== lastScreen) {
    lastScreen = key;
    markEntrance(host);
  }

  // Re-rendering destroys the focused node, which would strand a keyboard user
  // after every single review. Put focus back on a sensible anchor.
  const target = app.ui.focusAfter;
  app.ui.focusAfter = null;
  if (target) {
    const el = document.querySelector(target);
    if (el) el.focus();
  }
}

document.getElementById('theme-toggle').addEventListener('click', () => app.cycleTheme());

// Keyboard shortcuts for the review loop. Plain 1-4 would fight with typing the
// recall attempt, so inside a text field the rating keys require a modifier.
document.addEventListener('keydown', (e) => {
  if (!app.ui.activeBlock) return;
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if (e.key === 'Escape') {
    e.preventDefault();
    app.closeBlock();
    return;
  }
  const index = ['1', '2', '3', '4'].indexOf(e.key);
  if (index === -1) return;
  if (typing && !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  app.rateActive(RATINGS[index].id);
});

// Roll the "today" anchor over if the tab is left open past midnight.
setInterval(() => {
  const now = todayISO();
  if (now !== app.todayISO) {
    const wasToday = app.ui.date === app.todayISO;
    app.todayISO = now;
    if (wasToday) app.ui.date = now;
    render();
  }
}, 60_000);

// Offline shell. Registered after first paint so it never delays startup, and
// only over http(s) — opening index.html from disk has no service-worker scope.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Offline mode unavailable:', err.message);
    });
  });
}

applyTheme(app.store.state.settings.theme);
render();
