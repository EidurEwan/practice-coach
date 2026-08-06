// First-run flow. Skippable at every step; nothing here is a prerequisite for
// using the app, it just saves the user from an empty screen with no context.

import { h, mount } from '../dom.js';
import { addDays, humanDate, shortDate, todayISO } from '../../engine/dates.js';
import { GENRE_LABEL, GENRES, detectGenre, methodStack } from '../../engine/genres.js';
import { calibrationFromDiagnostic } from '../../engine/curve.js';
import { SCORE_OPTIONS, verdictFor } from '../../engine/diagnostic.js';

export const ONBOARD_STEPS = ['welcome', 'skill', 'context', 'diagnostic', 'topic', 'done'];

// Kept short so five choices fit a phone screen without scrolling.
const GENRE_BLURB = {
  language: 'Spoken or written',
  reasoning: 'Maths, code, logic',
  physical: 'Sport, instrument, motor',
  conceptual: 'Science, history, systems',
  memorization: 'Vocab, facts, formulas',
};

export function onboardingView(app) {
  const ob = app.ui.onboard;
  const step = ONBOARD_STEPS[ob.step];

  const body = {
    welcome: stepWelcome,
    skill: stepSkill,
    context: stepContext,
    diagnostic: stepDiagnostic,
    topic: stepTopic,
    done: stepDone,
  }[step](app, ob);

  // No `shell` here: this renders inside main.shell, which already pads.
  return h('div', { class: 'onboard' },
    h('div', { class: 'ob-top' },
      h('div', { class: 'ob-steps' },
        ONBOARD_STEPS.map((_, i) => h('i', {
          class: i < ob.step ? 'done' : i === ob.step ? 'current' : '',
        })),
      ),
      step !== 'done' && h('button', { class: 'btn bare tiny', onClick: () => app.skipOnboarding() }, 'Skip'),
    ),
    h('div', { class: 'ob-body' }, body.content),
    h('div', { class: 'ob-foot' },
      ob.step > 0 && step !== 'done' && h('button', {
        class: 'btn', onClick: () => app.onboardBack(),
      }, 'Back'),
      body.action,
    ),
  );
}

// ---------------------------------------------------------------- welcome

/**
 * The welcome step demonstrates the mechanism rather than describing it: the
 * user actually stamps a sample row and watches its return date walk out along
 * the real curve. Purely local — it touches no store state.
 */
function stepWelcome(app) {
  const CURVE = [1, 3, 7, 16, 35];
  let step = -1;

  const stampEl = h('span', { class: 'stamp' }, 'not yet');
  const chainEl = h('span', { class: 'dates' });
  const noteEl = h('div', { class: 'ob-slip-note' });
  const okBtn = h('button', { class: 'btn tiny', onClick: () => advance('ok') }, 'Recalled it');
  const missBtn = h('button', { class: 'btn tiny', onClick: () => advance('failed') }, 'Drew a blank');

  function advance(rating) {
    step = rating === 'failed' ? 0 : Math.min(step + 1, CURVE.length - 1);
    paint(rating);
  }

  function paint(rating) {
    const days = CURVE[Math.max(0, step)];
    stampEl.className = `stamp ${step >= 0 ? 'committed' : ''}`;
    stampEl.textContent = step < 0 ? 'not yet' : days === 1 ? 'tomorrow' : `in ${days} days`;

    mount(chainEl, CURVE.map((d, i) => h('span', {
      class: `stamp ${i === step ? 'committed' : ''}`,
      style: i > step ? { opacity: '0.45' } : null,
    }, `${d}d`)));

    mount(noteEl, step < 0
      ? 'Try it — mark it recalled and watch the return date move.'
      : rating === 'failed'
        ? 'Missed — straight back to one day. Nothing is held against you; the interval just restarts.'
        : step === CURVE.length - 1
          ? 'Each success roughly doubles the gap. That expanding spacing is the whole mechanism.'
          : 'Recalled — so the gap widens. Keep going.');
  }

  paint();

  return {
    content: h('div', null,
      h('div', { class: 'ob-kicker' }, 'Welcome'),
      h('h2', { class: 'page-title' }, 'It decides what you practise, and when.'),
      h('p', { class: 'ob-lede' },
        'Practice Coach does not teach the skill. It owns the schedule around it — when each thing comes back, how the session is run, and what to do when something stops improving.'),

      h('div', { class: 'ob-slip' },
        h('div', { class: 'ob-slip-head' },
          'Try it out',
          h('span', null, 'Example — not your data'),
        ),
        h('ol', null,
          h('li', null,
            h('span', { class: 'n' }, '1'),
            h('span', { class: 't' }, 'Proofs — induction',
              h('div', { class: 'small faint' }, 'Interleaved with vectors, so you have to spot the method')),
            stampEl,
          ),
        ),
        h('div', { class: 'chain-year', style: { marginTop: 'var(--s-sm)' } },
          h('span', { class: 'y' }, 'Gap'),
          chainEl,
        ),
        h('div', { class: 'row', style: { marginTop: 'var(--s-sm)' } }, okBtn, missBtn),
        noteEl,
      ),

      h('p', { class: 'lede', style: { marginTop: 'var(--s-lg)' } },
        'Setup takes about a minute. You can skip it and start logging straight away.'),
    ),
    action: h('button', { class: 'btn primary', onClick: () => app.onboardNext() }, 'Set up my first skill'),
  };
}

// ------------------------------------------------------------------ skill

function stepSkill(app, ob) {
  const hintEl = h('div', { class: 'small faint', style: { marginTop: 'var(--s-xs)' } });
  const choiceWrap = h('div', { class: 'ob-choice cols' });
  const physicalWrap = h('div');
  const methodWrap = h('div');
  let renderedGenre = null;

  // Built before sync() so the same pass that patches the form can also flip
  // the footer button — nothing here re-renders, so it would otherwise stay
  // stuck in whatever state it was created in.
  const action = h('button', {
    class: 'btn primary',
    onClick: () => app.onboardNext(),
  }, 'Continue');

  function sync() {
    action.disabled = !ob.name.trim() || !ob.genre;
    mount(hintEl, ob.detected?.genre
      ? (ob.genreTouched
        ? `Detected ${GENRE_LABEL[ob.detected.genre]} from the name; you have chosen ${GENRE_LABEL[ob.genre] || 'another genre'} instead.`
        : ob.detected.blend.length
          ? `Looks like ${GENRE_LABEL[ob.detected.genre]}, with some ${ob.detected.blend.map((g) => GENRE_LABEL[g]).join(' and ')}. Methods from both get combined.`
          : `Looks like ${GENRE_LABEL[ob.detected.genre]}. Change it below if that is wrong.`)
      : ob.name ? 'Could not tell from the name — pick one below.' : '');

    mount(choiceWrap, GENRES.map((g) => h('button', {
      type: 'button',
      'aria-pressed': String(g === ob.genre),
      onClick: () => { app.setOnboard({ genre: g, genreTouched: true }); sync(); },
    },
      h('span', { class: 'n' }, GENRE_LABEL[g]),
      h('span', { class: 'd' }, GENRE_BLURB[g]),
    )));

    if (ob.genre !== renderedGenre) {
      mount(physicalWrap, ob.genre === 'physical' ? physicalField(app, ob, sync) : null);
      renderedGenre = ob.genre;
    }
    mount(methodWrap, ob.genre ? methodPreview(ob.genre, ob.physicalType) : null);
  }

  const content = h('div', null,
    h('div', { class: 'ob-kicker' }, 'Step 1 of 4'),
    h('h2', { class: 'page-title' }, 'What are you learning?'),
    h('p', { class: 'ob-lede' },
      'The kind of skill decides the interval curve, the interleaving, and how sessions are run.'),

    h('label', { class: 'field' },
      h('span', { class: 'lbl' }, 'Skill name'),
      h('input', {
        type: 'text',
        value: ob.name,
        autofocus: true,
        placeholder: 'AQA A-Level Maths, Spanish, Guitar…',
        onInput: (e) => {
          const name = e.target.value;
          const detected = detectGenre(name);
          const patch = { name, detected };
          if (!ob.genreTouched) {
            patch.genre = detected.genre || '';
            patch.physicalType = detected.physicalType || 'closed';
          }
          app.setOnboard(patch);
          sync();
        },
      }),
      hintEl,
    ),

    h('div', { class: 'field' },
      h('span', { class: 'lbl' }, 'Kind of skill'),
      choiceWrap,
      physicalWrap,
    ),
    methodWrap,
  );

  sync();

  return { content, action };
}

function physicalField(app, ob, sync) {
  const options = [
    { id: 'closed', name: 'Closed', desc: 'Self-paced — scales, free throws' },
    { id: 'open', name: 'Open', desc: 'Reactive — tennis, sparring' },
  ];
  return h('div', null,
    h('span', { class: 'lbl', style: { display: 'block', marginTop: 'var(--s-sm)' } }, 'Which kind?'),
    h('div', { class: 'ob-choice cols' }, options.map((o) => h('button', {
      type: 'button',
      'aria-pressed': String(ob.physicalType === o.id),
      onClick: () => { app.setOnboard({ physicalType: o.id }); sync(); },
    },
      h('span', { class: 'n' }, o.name),
      h('span', { class: 'd' }, o.desc),
    ))),
  );
}

/** Folded away: useful reassurance, but it must not push the button off-screen. */
function methodPreview(genre, physicalType) {
  const stack = methodStack(genre, physicalType || 'closed');
  return h('details', { class: 'why' },
    h('summary', null, 'What your sessions will look like'),
    h('div', { class: 'why-body' },
      h('ul', { class: 'method-stack' }, stack.primary.map((m) => h('li', null, m))),
      h('p', null, stack.why),
    ),
  );
}

// ---------------------------------------------------------------- context

function stepContext(app, ob) {
  return {
    content: h('div', null,
      h('div', { class: 'ob-kicker' }, 'Step 2 of 4'),
      h('h2', { class: 'page-title' }, 'Is there a date to work towards?'),
      h('p', { class: 'ob-lede' },
        'Optional. If you set one, practice switches to timed, exam-format conditions in the last three weeks — matching the real conditions measurably improves recall under them.'),

      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Level or goal'),
        h('input', {
          type: 'text',
          value: ob.level,
          placeholder: 'AQA A-Level, Year 12',
          onInput: (e) => app.setOnboard({ level: e.target.value }),
        }),
      ),
      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Exam, performance or deadline'),
        h('input', {
          type: 'date',
          value: ob.targetDate,
          min: todayISO(),
          onInput: (e) => app.setOnboard({ targetDate: e.target.value }),
        }),
        h('span', { class: 'hint' }, 'Leave blank if there is no fixed date.'),
      ),
    ),
    action: h('button', { class: 'btn primary', onClick: () => app.onboardNext() }, 'Continue'),
  };
}

// ------------------------------------------------------------- diagnostic

function stepDiagnostic(app, ob) {
  const calWrap = h('div');

  function syncCal() {
    const answered = ob.diagnostic.filter((r) => r.score != null && r.daysSince);
    const calibration = answered.length ? calibrationFromDiagnostic(answered) : null;
    mount(calWrap, calibration
      ? h('div', { class: 'msg good' },
          h('span', { class: 'ico' }, '→'),
          h('span', null, h('b', null, `Intervals scaled ${calibration}×. `), verdictFor(calibration)))
      : null);
  }

  const visible = ob.diagnosticRows ?? 1;
  const rows = ob.diagnostic.slice(0, visible).map((row, i) => {
    const buttons = SCORE_OPTIONS.map((opt) => h('button', {
      type: 'button',
      class: 'btn tiny',
      'aria-pressed': String(row.score === opt.value),
      onClick: () => {
        app.setDiagnosticRow(i, 'score', opt.value);
        buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(SCORE_OPTIONS[j].value === opt.value)));
        syncCal();
      },
    }, opt.label));

    return h('div', { class: 'field' },
      h('span', { class: 'lbl' }, `Thing ${i + 1}`),
      h('input', {
        type: 'text',
        value: row.prompt,
        placeholder: 'What you tried to recall',
        onInput: (e) => app.setDiagnosticRow(i, 'prompt', e.target.value),
      }),
      h('div', { class: 'grid2', style: { marginTop: 'var(--s-sm)' } },
        h('label', { class: 'field' },
          h('span', { class: 'lbl' }, 'Days since you learned it'),
          h('input', {
            type: 'number', min: '1', max: '90',
            value: row.daysSince ?? '',
            onInput: (e) => { app.setDiagnosticRow(i, 'daysSince', Number(e.target.value) || null); syncCal(); },
          }),
        ),
        h('div', { class: 'field' },
          h('span', { class: 'lbl' }, 'How much came back?'),
          h('div', { class: 'scores' }, buttons),
        ),
      ),
    );
  });

  syncCal();

  return {
    content: h('div', null,
      h('div', { class: 'ob-kicker' }, 'Step 3 of 4 — optional'),
      h('h2', { class: 'page-title' }, 'How fast do you forget?'),
      h('p', { class: 'ob-lede' },
        'Think of something you learned recently. Try to recall it now, before checking, then score how much came back — a real attempt, not a guess at how well you know it.'),
      rows,
      visible < ob.diagnostic.length && h('button', {
        class: 'btn tiny',
        type: 'button',
        onClick: () => { app.setOnboard({ diagnosticRows: visible + 1 }); app.rerender(); },
      }, '+ Add another (more accurate)'),
      calWrap,
    ),
    action: h('button', { class: 'btn primary', onClick: () => app.onboardNext() }, 'Continue'),
  };
}

// ------------------------------------------------------------------ topic

function stepTopic(app, ob) {
  const perItem = ob.genre === 'memorization' || ob.genre === 'language';

  const action = h('button', {
    class: 'btn primary',
    disabled: !ob.topic.trim(),
    onClick: () => app.finishOnboarding(),
  }, 'Create my schedule');

  return {
    content: h('div', null,
      h('div', { class: 'ob-kicker' }, 'Step 4 of 4'),
      h('h2', { class: 'page-title' }, 'What have you studied so far?'),
      h('p', { class: 'ob-lede' },
        `Log one thing you have already covered in ${ob.name || 'this skill'}. It gets a first review date immediately, so you land on a real practice card instead of an empty one.`),

      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, perItem ? 'One item' : 'One topic'),
        h('input', {
          type: 'text',
          value: ob.topic,
          autofocus: true,
          placeholder: perItem ? 'el bolígrafo — the pen' : 'Proofs',
          onInput: (e) => {
            app.setOnboard({ topic: e.target.value });
            action.disabled = !e.target.value.trim();
          },
        }),
      ),

      !perItem && h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Which part, if one stood out'),
        h('input', {
          type: 'text',
          value: ob.subSkill,
          placeholder: 'induction',
          onInput: (e) => app.setOnboard({ subSkill: e.target.value }),
        }),
        h('span', { class: 'hint' },
          'Naming the specific part means the next session targets it, instead of redoing the whole topic.'),
      ),

      ob.genre === 'memorization' && h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'How did you encode it?'),
        h('input', {
          type: 'text',
          value: ob.encoding,
          placeholder: 'A mnemonic, acronym, story link, or chunk grouping',
          onInput: (e) => app.setOnboard({ encoding: e.target.value }),
        }),
        h('span', { class: 'hint' },
          'Spacing only works on something that was encoded well to begin with. Do not schedule a raw fact.'),
      ),

      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: ob.shaky,
          onChange: (e) => app.setOnboard({ shaky: e.target.checked }),
        }),
        h('span', null, h('b', null, 'Some of it felt shaky. '),
          'Tightens the first interval and marks it for extra interleaving.'),
      ),
    ),
    action,
  };
}

// ------------------------------------------------------------------- done

function stepDone(app, ob) {
  const result = ob.result;
  const dates = (result?.projection || []).slice(0, 5);

  return {
    content: h('div', null,
      h('div', { class: 'ob-kicker' }, 'Ready'),
      h('h2', { class: 'page-title' }, 'You are all set.'),
      h('p', { class: 'ob-lede' },
        `${result?.item.title} comes back ${humanDate(result?.item.dueDate, todayISO())}. After that it spreads out, as long as you keep recalling it.`),

      h('div', { class: 'ob-slip' },
        h('div', { class: 'ob-slip-head' },
          result?.item.title || 'Your topic',
          h('span', null, ob.name),
        ),
        h('div', { class: 'chain-year' },
          h('span', { class: 'y' }, 'Due'),
          h('span', { class: 'dates' }, dates.map((d, i) => h('span', {
            class: `stamp ${i === 0 ? 'committed' : ''}`,
          }, shortDate(d)))),
        ),
        h('div', { class: 'ob-slip-note' },
          'The first date is committed. The rest assume you keep rating "OK" — a miss pulls them back in.'),
      ),

      result?.flags.length ? h('div', { style: { marginTop: 'var(--s-md)' } },
        result.flags.map((f) => h('div', { class: 'msg warn' },
          h('span', { class: 'ico' }, '!'), h('span', null, f.message))),
      ) : null,
    ),
    action: h('button', { class: 'btn primary', onClick: () => app.leaveOnboarding() }, 'Start practising'),
  };
}
