import { activeSkills } from '../../engine/scheduler.js';
import { h, copyText } from '../dom.js';
import { todayISO } from '../../engine/dates.js';
import { GENRE_LABEL, methodStack, usesPerItemSRS } from '../../engine/genres.js';
import { itemsForSkill } from '../../engine/model.js';
import { ENCODING_OPTIONS } from '../../engine/methods.js';

export function logView(app) {
  const { store, ui } = app;
  const skills = activeSkills(store.state);

  if (skills.length === 0) {
    return h('div', { class: 'empty' },
      h('h3', null, 'Add a skill first'),
      h('p', null, 'Each one gets its own schedule and method.'),
      h('button', { class: 'btn primary', onClick: () => app.go('skills') }, 'Add a skill'),
    );
  }

  const skill = skills.find((s) => s.id === ui.logDraft.skillId) || skills[0];
  const perItem = usesPerItemSRS(skill.genre);
  const stack = methodStack(skill.genre, skill.physicalType);
  const siblings = itemsForSkill(store.state, skill.id);

  return h('div', null,
    h('h2', null, 'What did you study today?'),
    h('p', { class: 'lede' },
      'It gets a review date and a method straight away.'),

    ui.lastLog && logResultCard(app),

    h('form', {
      class: 'card',
      onSubmit: (e) => {
        e.preventDefault();
        app.submitLog(new FormData(e.target), skill);
      },
    },
      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Skill track'),
        h('select', {
          name: 'skillId',
          value: skill.id,
          onChange: (e) => app.setLogSkill(e.target.value),
        }, skills.map((s) => h('option', { value: s.id, selected: s.id === skill.id },
          `${s.name} — ${GENRE_LABEL[s.genre]}${s.physicalType ? ` (${s.physicalType})` : ''}`))),
        h('span', { class: 'hint' }, stack.primary[0]),
      ),

      perItem && h('div', { class: 'row', style: { marginBottom: 'var(--s-md)' } },
        h('button', {
          type: 'button',
          class: `btn tiny ${ui.logDraft.bulk ? '' : 'primary'}`,
          onClick: () => app.setLogBulk(false),
        }, 'One item'),
        h('button', {
          type: 'button',
          class: `btn tiny ${ui.logDraft.bulk ? 'primary' : ''}`,
          onClick: () => app.setLogBulk(true),
        }, 'Paste a list'),
      ),

      perItem && ui.logDraft.bulk
        ? bulkFields(skill)
        : singleFields(app, skill, siblings),

      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Date studied'),
        h('input', { type: 'date', name: 'date', value: ui.date || todayISO() }),
        h('span', { class: 'hint' }, 'Backdate if you are catching up.'),
      ),

      h('button', { class: 'btn primary', type: 'submit' }, 'Log it'),
    ),
  );
}

function singleFields(app, skill, siblings) {
  const perItem = usesPerItemSRS(skill.genre);
  const needsEncoding = skill.genre === 'memorization';

  return h('div', null,
    h('label', { class: 'field' },
      h('span', { class: 'lbl' }, perItem ? 'Item' : 'Topic'),
      h('input', {
        type: 'text',
        name: 'title',
        required: true,
        autofocus: true,
        placeholder: perItem ? 'e.g. el bolígrafo — the pen' : 'e.g. Proofs',
      }),
    ),

    perItem && h('div', { class: 'grid2' },
      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Cue (prompt side)'),
        h('input', { type: 'text', name: 'cue', placeholder: 'What you will be shown' }),
      ),
      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Answer (recall side)'),
        h('input', { type: 'text', name: 'answer', placeholder: 'What you must produce' }),
      ),
    ),

    !perItem && h('label', { class: 'field' },
      h('span', { class: 'lbl' }, 'Sub-skill (optional)'),
      h('input', {
        type: 'text',
        name: 'subSkill',
        placeholder: skill.genre === 'reasoning' ? 'e.g. induction' : 'the specific part you worked on',
      }),
      h('span', { class: 'hint' },
        'Naming it narrows the next session.'),
    ),

    (needsEncoding || perItem) && h('label', { class: 'field' },
      h('span', { class: 'lbl' }, `Encoding${needsEncoding ? '' : ' (optional)'}`),
      h('input', {
        type: 'text',
        name: 'encoding',
        placeholder: 'e.g. "Beer Mugs Can Serve Barmen" for Be Mg Ca Sr Ba',
      }),
      h('div', { class: 'row', style: { marginTop: 'var(--s-xs)' } },
        ENCODING_OPTIONS.map((opt) => h('span', { class: 'badge', title: opt.hint }, opt.label)),
      ),
      h('span', { class: 'hint' },
        'Never schedule a raw fact.'),
    ),

    h('label', { class: 'check' },
      h('input', { type: 'checkbox', name: 'shaky' }),
      h('span', null,
        h('b', null, 'Some of it felt shaky.'),
        ' Brings it back sooner.'),
    ),

    // Toggles rather than a native multi-select. A <select multiple> on a phone
    // is a small scrolling list that gives no sign more than one can be picked,
    // and needs a precise tap per row. Checkboxes carry the same name, so
    // form.getAll('confusableWith') keeps working untouched.
    siblings.length > 0 && h('div', { class: 'field' },
      h('span', { class: 'lbl' }, 'Easily confused with (optional)'),
      h('div', { class: 'opt-set' },
        siblings.map((s) => h('label', { class: 'opt' },
          h('input', { type: 'checkbox', name: 'confusableWith', value: s.id }),
          h('span', null, s.title),
        )),
      ),
      h('span', { class: 'hint' },
        'Kept apart until solid, then drilled together.'),
    ),
  );
}

function bulkFields(skill) {
  return h('label', { class: 'field' },
    h('span', { class: 'lbl' }, 'One item per line'),
    h('textarea', {
      name: 'bulk',
      required: true,
      rows: 8,
      placeholder: skill.genre === 'language'
        ? 'el bolígrafo | the pen | "bowl of graph paper"\nla mochila | the backpack'
        : 'Beryllium | Be, 4 | "Berry"\nMagnesium | Mg, 12',
    }),
    h('span', { class: 'hint' }, 'cue | answer | encoding'),
  );
}

function logResultCard(app) {
  const { cards, flags, count } = app.ui.lastLog;
  const text = cards.join('\n\n');

  return h('div', { class: 'card', style: { marginBottom: 'var(--s-md)' } },
    h('div', { class: 'spread' },
      h('h3', { style: { margin: 0 } }, `Logged ${count} item${count === 1 ? '' : 's'}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn tiny', onClick: (e) => copyText(text, e.target) }, 'Copy card'),
        h('button', { class: 'btn bare tiny', onClick: () => app.dismissLog() }, 'Dismiss'),
      ),
    ),
    flags.map((f) => h('div', {
      class: `msg ${f.type === 'encoding-missing' || f.type === 'pre-deadline' ? 'warn' : 'info'}`,
      style: { marginTop: 'var(--s-sm)' },
    }, h('span', { class: 'ico' }, '!'), h('span', null, f.message))),
    h('pre', { class: 'card-out', style: { marginTop: 'var(--s-sm)' } }, text),
    h('button', {
      class: 'btn tiny',
      style: { marginTop: 'var(--s-sm)' },
      onClick: () => app.go('today'),
    }, "See today's card"),
  );
}
