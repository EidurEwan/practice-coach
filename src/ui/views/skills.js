import { h, copyText, mount } from '../dom.js';
import { humanDate, todayISO } from '../../engine/dates.js';
import { GENRE_LABEL, GENRES, detectGenre, methodStack } from '../../engine/genres.js';
import { STATUS_LABEL, itemStatus, itemsForSkill } from '../../engine/model.js';
import { skillMode } from '../../engine/scheduler.js';
import { currentFormat } from '../../engine/methods.js';
import { SCORE_OPTIONS, previewCurves, verdictFor } from '../../engine/diagnostic.js';
import { calibrationFromDiagnostic } from '../../engine/curve.js';
import { hueAttrs } from '../hues.js';

export function skillsView(app) {
  const { store, ui } = app;
  return h('div', null,
    h('div', { class: 'spread', style: { marginTop: 'var(--s-lg)' } },
      h('h2', { style: { margin: 0 } }, 'Skills'),
      h('button', {
        class: `btn ${ui.intake.open ? '' : 'primary'}`,
        onClick: () => app.toggleIntake(),
      }, ui.intake.open ? 'Cancel' : '+ New skill'),
    ),
    h('p', { class: 'lede' },
      'Each has its own curve and method.'),

    ui.intake.open && intakeForm(app),

    store.state.skills.length === 0 && !ui.intake.open
      ? h('div', { class: 'empty' },
          h('h3', null, 'No skills yet'),
          h('p', null, 'Name it and the genre is detected for you.'),
        )
      : h('div', { class: 'stack', style: { marginTop: '1rem' } },
          store.state.skills.map((s) => skillCard(app, s))),

    settingsCard(app),
  );
}

// ---------------------------------------------------------------------- intake

function intakeForm(app) {
  const intake = app.ui.intake;

  // Everything below is built once. Typing must never rebuild the form, so the
  // genre-dependent parts are patched in place by sync() and the rest is left
  // alone — otherwise the field under the cursor gets replaced mid-keystroke.
  const hintEl = h('span', { class: 'hint' });
  const physicalWrap = h('div');
  const methodWrap = h('div');

  const genreSelect = h('select', {
    name: 'genre',
    required: true,
    onChange: (e) => { app.setIntakeGenre(e.target.value); sync(); },
  },
    h('option', { value: '' }, 'Choose…'),
    GENRES.map((g) => h('option', { value: g }, GENRE_LABEL[g])),
  );

  let renderedGenre = null;
  let renderedPhysical = null;

  function physicalTypeValue() {
    return physicalWrap.querySelector('select')?.value || null;
  }

  function sync() {
    const genre = intake.genre || '';
    mount(hintEl, detectionHint(intake));

    if (genreSelect.value !== genre) genreSelect.value = genre;

    // Only rebuilt when the genre actually changes, so an explicit
    // closed/open choice survives further edits to the name.
    if (genre !== renderedGenre) {
      mount(physicalWrap, genre === 'physical' ? physicalTypeField(app, intake, sync) : null);
      renderedGenre = genre;
      renderedPhysical = null;
    }

    const physicalType = physicalTypeValue();
    if (physicalType !== renderedPhysical) {
      mount(methodWrap, genre ? methodPreview(genre, physicalType) : null);
      renderedPhysical = physicalType;
    }
  }

  const form = h('form', {
    class: 'card',
    style: { marginTop: 'var(--s-md)' },
    onSubmit: (e) => {
      e.preventDefault();
      app.submitSkill(new FormData(e.target));
    },
  },
    h('h3', null, 'New skill'),

    h('label', { class: 'field' },
      h('span', { class: 'lbl' }, 'Skill name'),
      h('input', {
        type: 'text',
        name: 'name',
        required: true,
        autofocus: true,
        value: intake.name,
        placeholder: 'e.g. AQA A-Level Maths, Spanish, Guitar, Cell Biology',
        onInput: (e) => { app.detectSkillGenre(e.target.value); sync(); },
      }),
      hintEl,
    ),

    h('div', { class: 'grid2' },
      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Genre'),
        genreSelect,
      ),
      physicalWrap,
    ),

    methodWrap,

    h('div', { class: 'grid2' },
      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Level / goal context'),
        h('input', {
          type: 'text',
          name: 'level',
          value: intake.level,
          placeholder: 'e.g. AQA A-Level, Year 12',
          onInput: (e) => app.setIntakeField('level', e.target.value),
        }),
      ),
      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Target date (optional)'),
        h('input', {
          type: 'date',
          name: 'targetDate',
          value: intake.targetDate,
          onInput: (e) => app.setIntakeField('targetDate', e.target.value),
        }),
        h('span', { class: 'hint' }, 'Inside 3 weeks, practice goes timed.'),
      ),
    ),

    diagnosticPanel(app),

    h('button', { class: 'btn primary', type: 'submit' }, 'Create skill'),
  );

  sync();
  return form;
}

function detectionHint(intake) {
  const detected = intake.detected;
  if (detected?.genre) {
    const base = `Looks like ${GENRE_LABEL[detected.genre]}${detected.physicalType ? ` (${detected.physicalType})` : ''}.`;
    if (intake.genreTouched) return `${base} Yours wins.`;
    return detected.blend.length
      ? `${base} Also ${detected.blend.map((g) => GENRE_LABEL[g]).join(' and ')} — both get used.`
      : base;
  }
  if (intake.name) return 'Pick one below.';
  return '';
}

function physicalTypeField(app, intake, sync) {
  return h('label', { class: 'field' },
    h('span', { class: 'lbl' }, 'Closed or open skill'),
    h('select', { name: 'physicalType', onChange: () => sync() },
      h('option', { value: 'closed', selected: intake.physicalType !== 'open' },
        'Closed — self-paced (free throw, scales)'),
      h('option', { value: 'open', selected: intake.physicalType === 'open' },
        'Open — reactive (tennis return, sparring)'),
    ),
    h('span', { class: 'hint' },
      'Open skills randomise from day one.'),
  );
}

function methodPreview(genre, physicalType) {
  const stack = methodStack(genre, physicalType || 'closed');
  return h('div', { class: 'msg info', style: { marginBottom: 'var(--s-md)' } },
    h('span', { class: 'ico' }, '→'),
    h('span', null,
      h('b', null, 'Method stack: '),
      h('ul', { class: 'method-stack' }, stack.primary.map((m) => h('li', null, m))),
      h('div', { class: 'why' }, stack.why),
    ),
  );
}

function diagnosticPanel(app) {
  const { ui } = app;
  const rows = ui.intake.diagnostic;

  // Same rule as the intake form: these inputs are typed into, so updating the
  // calibration readout must patch in place rather than re-render.
  const calWrap = h('div');
  const calInput = h('input', { type: 'hidden', name: 'calibration', value: '1' });

  function syncCalibration() {
    const answered = rows.filter((r) => r.score != null && r.daysSince);
    const calibration = answered.length ? calibrationFromDiagnostic(answered) : null;
    calInput.value = String(calibration ?? 1);
    mount(calWrap, calibration ? calibrationSummary(calibration) : null);
  }

  const rowNodes = rows.map((row, i) => {
    const scoreButtons = SCORE_OPTIONS.map((opt) => h('button', {
      type: 'button',
      class: 'btn tiny',
      'aria-pressed': String(row.score === opt.value),
      title: opt.hint,
      onClick: () => {
        app.setDiagnostic(i, 'score', opt.value);
        scoreButtons.forEach((btn, j) => {
          btn.setAttribute('aria-pressed', String(SCORE_OPTIONS[j].value === opt.value));
        });
        syncCalibration();
      },
    }, opt.label));

    return h('div', { class: 'card', style: { marginBottom: 'var(--s-sm)', background: 'var(--rule-soft)' } },
      h('div', { class: 'grid2' },
        h('label', { class: 'field' },
          h('span', { class: 'lbl' }, `Thing ${i + 1}`),
          h('input', {
            type: 'text',
            value: row.prompt,
            placeholder: 'What you tried to recall',
            onInput: (e) => app.setDiagnostic(i, 'prompt', e.target.value),
          }),
        ),
        h('label', { class: 'field' },
          h('span', { class: 'lbl' }, 'Days since you learned it'),
          h('input', {
            type: 'number',
            min: '1',
            max: '90',
            value: row.daysSince ?? '',
            onInput: (e) => {
              app.setDiagnostic(i, 'daysSince', Number(e.target.value) || null);
              syncCalibration();
            },
          }),
        ),
      ),
      h('span', { class: 'lbl', style: { display: 'block', color: 'var(--ink-soft)' } },
        'How much came back?'),
      h('div', { class: 'scores' }, scoreButtons),
    );
  });

  syncCalibration();

  return h('details', {
    style: { marginBottom: '1rem' },
    open: ui.intake.diagnosticOpen,
    onToggle: (e) => { ui.intake.diagnosticOpen = e.target.open; },
  },
    h('summary', { class: 'small muted', style: { cursor: 'pointer', marginBottom: 'var(--s-sm)' } },
      'Forgetting-rate diagnostic (optional, ~2 min) — calibrates how fast your curve runs'),
    h('div', { class: 'stack', style: { padding: 'var(--s-sm) 0 0' } },
      h('p', { class: 'lede small' },
        'Recall 2–3 recent things now, then score what came back.'),

      rowNodes,
      calWrap,
      calInput,
    ),
  );
}

function calibrationSummary(calibration) {
  const curves = previewCurves(calibration);
  return h('div', { class: 'msg good' },
    h('span', { class: 'ico' }, '→'),
    h('span', null,
      h('b', null, `Calibration ${calibration}× — `), verdictFor(calibration),
      h('div', { class: 'small num', style: { marginTop: 'var(--s-xs)' } },
        `Standard curve: ${curves.base.join(' → ')} days`),
      h('div', { class: 'small num' },
        `Reasoning/conceptual: ${curves.tight.join(' → ')} days`),
    ),
  );
}

// ------------------------------------------------------------------ skill card

function skillCard(app, skill) {
  const items = itemsForSkill(app.store.state, skill.id);
  const stack = methodStack(skill.genre, skill.physicalType);
  const mode = skillMode(skill, app.ui.date, app.store.state.settings.preDeadlineWindowDays);
  const expanded = app.ui.expandedSkill === skill.id;

  return h('div', { class: 'card', ...hueAttrs(app.store.state, skill.id) },
    h('div', { class: 'spread' },
      h('div', null,
        h('div', { class: 'row' },
          h('span', { class: 'skill-dot' }),
          h('span', { class: 'title', style: { fontWeight: '600' } }, skill.name),
          h('span', { class: 'badge' },
            GENRE_LABEL[skill.genre] + (skill.physicalType ? ` · ${skill.physicalType}` : '')),
          mode.mode === 'pre-deadline' && h('span', { class: 'badge deadline' },
            `${mode.daysToTarget}d to target`),
          mode.mode === 'past-deadline' && h('span', { class: 'badge' }, 'past target'),
        ),
        h('div', { class: 'small faint' },
          [
            skill.level,
            `${items.length} tracked`,
            `calibration ${skill.calibration}×`,
            skill.targetDate ? `target ${skill.targetDate}` : null,
          ].filter(Boolean).join(' · ')),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn tiny', onClick: () => app.toggleSkill(skill.id) },
          expanded ? 'Hide' : `Show ${items.length}`),
        // Bare, not filled: deleting a skill takes its whole review history
        // with it, and it should not sit beside "Show" looking like a peer.
        h('button', { class: 'btn bare tiny danger', onClick: () => app.deleteSkill(skill) }, 'Delete'),
      ),
    ),

    // The primary method, in one line. The full stack is reference material
    // and ran to three lines of grey per card — on a phone with three skills
    // that was nine lines of the least actionable text on the screen. It moves
    // into the panel that "Show" already opens.
    h('div', { class: 'small muted', style: { marginTop: 'var(--s-xs)' } }, stack.primary[0]),

    mode.mode === 'pre-deadline' && h('div', { class: 'msg warn', style: { marginTop: 'var(--s-sm)' } },
      h('span', { class: 'ico' }, '!'),
      h('span', null,
        `Pre-deadline mode: ${mode.daysToTarget} days out. Practice runs timed and in ${skill.genre === 'physical' ? 'performance' : 'exam'} format, and weak or overdue topics take priority over new material.`),
    ),

    skill.diagnostic && h('div', { class: 'small faint', style: { marginTop: 'var(--s-xs)' } },
      `Diagnostic ${skill.diagnostic.takenAt}: ${skill.diagnostic.verdict}`),

    expanded && h('ul', { class: 'method-stack', style: { marginTop: 'var(--s-md)' } },
      stack.primary.map((m) => h('li', null, m))),

    expanded && (items.length === 0
      ? h('p', { class: 'small faint', style: { marginTop: 'var(--s-sm)' } }, 'Nothing logged in this track yet.')
      : itemTable(app, skill, items)),
  );
}

function itemTable(app, skill, items) {
  const sorted = items.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return h('table', { class: 'items', style: { marginTop: 'var(--s-sm)' } },
    h('thead', null, h('tr', null,
      h('th', null, skill.genre === 'memorization' || skill.genre === 'language' ? 'Item' : 'Topic'),
      h('th', null, 'Due'),
      h('th', null, 'Interval'),
      h('th', null, 'Ease'),
      h('th', null, 'Reviews'),
      h('th', null, 'Status'),
      h('th', null, 'Format'),
    )),
    // data-label drives the phone layout, where each row restacks as a
    // labelled list rather than scrolling sideways.
    h('tbody', null, sorted.map((item) => h('tr', null,
      h('td', { 'data-label': '' },
        item.title,
        item.subSkill && h('div', { class: 'small faint' }, `sub-skill: ${item.subSkill}`),
        item.encoding && h('div', { class: 'small faint' }, `Encoding: ${item.encoding}`),
      ),
      h('td', { class: 'num', 'data-label': 'Due' }, humanDate(item.dueDate, app.ui.date)),
      h('td', { class: 'num', 'data-label': 'Interval' }, `${item.intervalDays}d`),
      h('td', { class: 'num', 'data-label': 'Ease' }, item.ease.toFixed(2)
        + (item.difficultyPenalty < 1 ? ` ·${Math.round(item.difficultyPenalty * 100)}%` : '')),
      h('td', { class: 'num', 'data-label': 'Reviews' }, String(item.history.length)),
      h('td', { 'data-label': 'Status' }, h('span', {
        class: `badge ${statusClass(itemStatus(item))}`,
      }, STATUS_LABEL[itemStatus(item)])),
      h('td', { class: 'small faint', 'data-label': 'Format' }, currentFormat(item, skill)),
    ))),
  );
}

function statusClass(status) {
  if (status === 'active') return 'ok';
  if (status === 'plateau') return 'plateau';
  return 'weak';
}

// -------------------------------------------------------------------- settings

function settingsCard(app) {
  const { settings } = app.store.state;
  return h('div', null,
    h('h2', null, 'Settings'),
    h('div', { class: 'card' },
      h('div', { class: 'grid2' },
        h('label', { class: 'field' },
          h('span', { class: 'lbl' }, 'Daily review cap (things due)'),
          h('input', {
            type: 'number',
            min: '1',
            max: '60',
            value: settings.dailyCapacityItems,
            onChange: (e) => app.setSetting('dailyCapacityItems', Number(e.target.value)),
          }),
          h('span', { class: 'hint' }, 'Over this, you get an offer to redistribute.'),
        ),
        h('label', { class: 'field' },
          h('span', { class: 'lbl' }, 'Pre-deadline window (days)'),
          h('input', {
            type: 'number',
            min: '3',
            max: '60',
            value: settings.preDeadlineWindowDays,
            onChange: (e) => app.setSetting('preDeadlineWindowDays', Number(e.target.value)),
          }),
          h('span', { class: 'hint' }, 'When timed practice kicks in.'),
        ),
      ),
      h('div', { class: 'row', style: { marginTop: 'var(--s-xs)' } },
        h('button', {
          class: 'btn tiny',
          onClick: (e) => copyText(app.store.export(), e.target),
        }, 'Copy data as JSON'),
        h('button', { class: 'btn tiny', onClick: () => app.importData() },
          app.ui.importOpen ? 'Cancel import' : 'Import JSON'),
        h('button', { class: 'btn tiny danger', onClick: () => app.resetAll() }, 'Erase everything'),
      ),
      app.ui.importOpen && h('div', { style: { marginTop: 'var(--s-sm)' } },
        h('textarea', {
          id: 'import-json',
          rows: 5,
          placeholder: 'Paste a Practice Coach JSON export here. This replaces everything currently stored.',
        }),
        h('button', {
          class: 'btn tiny',
          style: { marginTop: 'var(--s-xs)' },
          onClick: () => app.applyImport(document.getElementById('import-json').value),
        }, 'Replace all data'),
      ),
      h('p', { class: 'small faint', style: { margin: '0.5rem 0 0' } },
        'Saved in this browser.'),
    ),
  );
}
