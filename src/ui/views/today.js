import { h, copyText } from '../dom.js';
import { humanDate, shortDate, weekday } from '../../engine/dates.js';
import { GENRE_LABEL } from '../../engine/genres.js';
import { itemStatus, STATUS_LABEL } from '../../engine/model.js';
import { buildSession, previewRating } from '../../engine/scheduler.js';
import { formatSessionCard } from '../../engine/card.js';
import { hueAttrs } from '../hues.js';

export const RATINGS = [
  { id: 'easy', label: 'Easy', hint: 'Instant and complete' },
  { id: 'ok', label: 'OK', hint: 'Got there, with effort' },
  { id: 'hard', label: 'Hard', hint: 'Partial, or needed a hint' },
  { id: 'failed', label: 'Failed', hint: 'Could not retrieve it' },
];

/**
 * What to show on the prompt side. Bulk-imported items store their title as
 * "cue — answer", so showing the title during a recall check would hand the
 * user the answer before they attempt it.
 */
function cardFace(item) {
  return item.cue || item.title;
}

export function todayView(app) {
  const { store, ui } = app;
  const date = ui.date;
  const session = buildSession(store.state, date);

  if (store.state.skills.length === 0) {
    return h('div', { class: 'empty' },
      h('h3', null, 'No skills yet'),
      h('p', null, 'Add a skill to start. Practice Coach designs the schedule, method and encoding around it — it does not teach the skill itself.'),
      h('button', { class: 'btn primary', onClick: () => app.go('skills') }, 'Add your first skill'),
    );
  }

  const done = store.state.reviews.filter((r) => r.date === date).length;
  const noItems = store.state.items.length === 0;

  return h('div', null,
    sessionHeader(app, session, done),
    ui.notice && h('div', { class: 'notice' },
      h('div', { class: `msg ${ui.notice.level}` },
        h('span', { class: 'ico' }, ui.notice.level === 'danger' ? '!' : '→'),
        h('div', null, ui.notice.message),
      ),
      h('button', { class: 'btn bare tiny', style: { marginTop: 'var(--s-sm)' }, onClick: () => app.clearNotice() }, 'Dismiss'),
    ),
    warningList(app, session),
    ui.lastResult && reviewResultCard(app),

    noItems
      ? h('div', { class: 'empty' },
          h('h3', null, 'Ready when you are'),
          h('p', null, 'You have a skill set up. Log the first thing you studied and it gets a review date, a method, and a place in the rotation.'),
          h('button', { class: 'btn primary', onClick: () => app.go('log') }, 'Log what you studied'),
        )
      : session.blocks.length === 0
        ? doneCard(app, done)
        : h('div', { class: 'slip' },
            session.blocks.map((block, i) => blockCard(app, block, i)),
          ),

    session.blocks.length > 0 && h('div', null,
      h('div', { class: 'row', style: { marginTop: 'var(--s-md)' } },
        h('button', { class: 'btn tiny', onClick: () => app.go('log') }, 'Log something new'),
      ),
      h('div', { style: { marginTop: 'var(--s-md)' } }, cardOutput(app, session)),
    ),
  );
}

function sessionHeader(app, session, done) {
  const pct = Math.min(100, (session.totalUnits / session.capacity) * 100);
  const over = session.totalUnits > session.capacity;
  const isToday = app.ui.date === app.todayISO;

  return h('div', null,
    h('div', { class: 'row datenav', style: { marginTop: 'var(--s-lg)' } },
      h('button', { class: 'btn bare tiny', onClick: () => app.shiftDate(-1), title: 'Previous day' }, '‹'),
      h('span', { class: 'small' }, `${weekday(app.ui.date)} ${shortDate(app.ui.date)}`),
      h('button', { class: 'btn bare tiny', onClick: () => app.shiftDate(1), title: 'Next day' }, '›'),
      !isToday && h('button', { class: 'btn tiny', onClick: () => app.resetDate() }, 'Back to today'),
    ),

    // The one display-scale moment on the screen.
    h('h1', { class: 'page-title', style: { marginTop: 'var(--s-xs)' } },
      isToday ? "Today's practice" : humanDate(app.ui.date, app.todayISO)),
    h('p', { class: 'lede', style: { marginTop: 'var(--s-xs)' } },
      session.blocks.length === 0
        ? done > 0 ? `${done} review${done === 1 ? '' : 's'} done. Nothing else due.` : 'Nothing due.'
        : `${session.blocks.length} thing${session.blocks.length === 1 ? '' : 's'} to review${done > 0 ? `, ${done} already done` : ''}. Overdue first.`),

    !isToday && h('div', { class: 'msg info', style: { marginTop: 'var(--s-sm)' } },
      h('span', { class: 'ico' }, '→'),
      h('span', null,
        `You are looking at ${humanDate(app.ui.date, app.todayISO)}, not today. Anything you rate here is recorded against that date.`),
    ),

    session.blocks.length > 0 && h('div', { class: 'capacity' },
      h('div', { class: 'bar' }, h('i', { class: over ? 'over' : '', style: { width: `${pct}%` } })),
      h('div', { class: 'labels' },
        h('span', null, `${session.totalUnits} due`),
        h('span', null, `your cap: ${session.capacity}`),
      ),
    ),
  );
}

/** Shown once the day is cleared, so finishing has a visible end point. */
function doneCard(app, done) {
  const next = app.store.state.items
    .filter((i) => !i.archived)
    .map((i) => i.dueDate)
    .sort()[0];

  return h('div', { class: 'done-state' },
    done > 0 && h('div', { class: 'done-mark', 'aria-hidden': 'true' }, '✓'),
    h('h3', null, done > 0 ? 'That is the day done' : 'Nothing due today'),
    h('p', null,
      done > 0
        ? `${done} review${done === 1 ? '' : 's'} logged. Stop here — extra reps on material that is not due work against the spacing effect.`
        : 'Everything is spaced out where it should be.'),
    next && h('p', { class: 'small faint' }, `Next review ${humanDate(next, app.ui.date)}.`),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn primary', onClick: () => app.go('log') }, 'Log something new'),
      h('button', { class: 'btn', onClick: () => app.go('upcoming') }, 'See what is coming'),
    ),
  );
}

function warningList(app, session) {
  if (session.warnings.length === 0) return null;
  const level = { warn: 'warn', info: 'info' };

  return h('div', { class: 'notice' },
    session.warnings.map((w) => {
      const action = session.actions.find(
        (a) => (w.type === 'overload' && a.type === 'redistribute')
          || (w.type === 'confusable-collision' && a.type === 'defer' && w.message.includes(itemTitle(app, a.itemId))),
      );
      const rest = restOf(w.message);
      return h('div', { class: `msg ${level[w.level] || ''}` },
        h('span', { class: 'ico' }, w.level === 'warn' ? '!' : '→'),
        h('div', null,
          firstSentence(w.message),
          rest && h('details', { class: 'why' },
            h('summary', null, 'More'),
            h('div', { class: 'why-body' }, h('p', null, rest)),
          ),
          action && h('div', { style: { marginTop: 'var(--s-sm)' } },
            h('button', { class: 'btn tiny', onClick: () => app.runAction(action) }, action.label),
          ),
        ),
      );
    }),
  );
}

function itemTitle(app, itemId) {
  return app.store.state.items.find((i) => i.id === itemId)?.title || '';
}

function blockCard(app, block, index) {
  const { ui } = app;
  const isActive = ui.activeBlock === block.id;
  const title = block.kind === 'batch'
    ? `${block.skill.name} — ${block.items.length} due item${block.items.length === 1 ? '' : 's'}`
    : block.item.title;

  const dotClass = block.overdueDays > 0
    ? 'late'
    : block.status === 'plateau' ? 'plateau' : block.status !== 'active' ? 'weak' : null;

  return h('div', {
    class: `slip-row ${index === 0 ? 'is-first' : ''}`,
    ...hueAttrs(app.store.state, block.skill.id),
  },
    h('div', { class: 'head' },
      dotClass && h('span', { class: `dot ${dotClass}`, title: STATUS_LABEL[block.status] }),
      h('span', { class: 'title' }, title),
      block.overdueDays > 0 && h('span', { class: 'badge late' }, `${block.overdueDays}d late`),
    ),
    h('div', { class: 'meta' },
      [
        block.kind === 'topic' ? block.skill.name : GENRE_LABEL[block.skill.genre],
        block.item.subSkill && block.kind === 'topic' ? block.item.subSkill : null,
      ].filter(Boolean).join(' · '),
    ),
    h('div', { class: 'body' },
      // The instruction, in one line. Everything else waits to be asked for.
      h('p', { class: 'method' },
        h('span', { class: 'label' }, block.method.label),
        ' — ',
        splitInstruction(block.method.detail).head,
      ),

      isActive
        ? recallPanel(app, block)
        : h('div', { style: { marginTop: 'var(--s-md)' } },
            // Only the top-priority card carries the accent, so "where do I
            // start" is answered by the page rather than left to the reader.
            h('button', {
              class: index === 0 ? 'btn primary' : 'btn',
              onClick: () => app.startBlock(block.id),
            }, block.kind === 'batch' ? `Start ${block.items.length} cards` : 'Start'),
          ),

      whyPanel(block),
    ),
  );
}

/**
 * Split an instruction into what to do and why. Breaks at the first sentence
 * end or em-dash clause after a reasonable minimum, so the row states the
 * action and the rationale moves into the disclosure.
 */
function splitInstruction(text, minHead = 40) {
  const candidates = [];
  const sentence = /[.!?](\s|$)/g;
  let m;
  while ((m = sentence.exec(text)) !== null) {
    if (m.index >= minHead) { candidates.push(m.index + 1); break; }
  }
  const dash = text.indexOf(' — ', minHead);
  if (dash > -1) candidates.push(dash);

  const cut = candidates.length ? Math.min(...candidates) : -1;
  if (cut === -1 || cut >= text.length - 1) return { head: text, rest: '' };
  return { head: text.slice(0, cut).trim(), rest: text.slice(cut).replace(/^\s*—\s*/, '').trim() };
}

function firstSentence(text) {
  return splitInstruction(text).head;
}

function restOf(text) {
  return splitInstruction(text).rest;
}

/**
 * Progressive disclosure. This product has a great deal it could explain, and
 * showing all of it at once was the single biggest source of clutter. The
 * reasoning stays one tap away and closed by default.
 */
function whyPanel(block) {
  const extra = splitInstruction(block.method.detail).rest;
  const hasContent = extra || block.interleaveWith || block.flags.length || block.preDeadline;
  if (!hasContent) return null;

  return h('details', { class: 'why' },
    h('summary', null, 'Why this?'),
    h('div', { class: 'why-body' },
      extra && h('p', null, extra),
      block.interleaveWith && h('p', null,
        'Paired with ', h('b', null, block.interleaveWith.item.title),
        block.interleaveWith.kind === 'booster'
          ? ' as a light booster — its own schedule is unchanged.'
          : block.interleaveWith.kind === 'cross-skill'
            ? ' from another skill, since this one has no second topic yet.'
            : ', which is also due today.',
      ),
      block.preDeadline && h('p', null,
        'Running in timed, exam-format conditions because the target date is close.'),
      block.flags.map((f) => h('p', null, f.message)),
    ),
  );
}

function recallPanel(app, block) {
  const { ui } = app;
  const idx = ui.batchIndex[block.id] || 0;
  const item = block.items[Math.min(idx, block.items.length - 1)];
  const revealed = ui.revealed[item.id];

  // Each button states the consequence, so choosing a rating is an informed
  // decision rather than a guess about what the algorithm will do.
  const ratingsRow = h('div', { class: 'ratings' },
    RATINGS.map((r, i) => {
      const days = previewRating(app.store.state, item, r.id);
      return h('button', {
        class: 'btn',
        dataset: { rating: r.id },
        title: `${r.hint} — next review in ${days} day${days === 1 ? '' : 's'}`,
        onClick: () => app.rate(block, item, r.id),
      },
        h('span', { class: 'k' }, String(i + 1)),
        r.label,
        h('small', null, r.hint),
        h('span', { class: 'outcome' }, days === 1 ? 'back tomorrow' : `back in ${days}d`),
      );
    }),
  );

  return h('div', { class: 'recall' },
    block.kind === 'batch' && h('div', null,
      h('div', { class: 'progress-dots' },
        block.items.map((_, i) => h('i', { class: i < idx ? 'done' : i === idx ? 'current' : '' })),
      ),
      h('div', { class: 'small faint', style: { marginBottom: 'var(--s-xs)' } },
        `Card ${idx + 1} of ${block.items.length}`,
        item.dueDate < ui.date ? ` · overdue ${humanDate(item.dueDate, ui.date)}` : '',
      ),
    ),

    h('div', { class: 'prompt' }, cardFace(item)),

    item.answer && h('div', { class: 'row', style: { marginBottom: 'var(--s-md)' } },
      h('button', {
        class: 'btn tiny',
        onClick: () => app.reveal(item.id),
      }, revealed ? 'Answer shown' : 'Reveal answer'),
    ),
    revealed && item.answer && h('div', { class: 'reveal', style: { marginBottom: 'var(--s-md)' } },
      h('div', { class: 'lbl' }, 'Answer'),
      h('div', null, item.answer),
      item.encoding && h('div', { class: 'small faint', style: { marginTop: 'var(--s-xs)' } }, `Encoding: ${item.encoding}`),
    ),

    ratingsRow,
    h('div', { class: 'row', style: { marginTop: 'var(--s-md)' } },
      h('button', { class: 'btn bare tiny', onClick: () => app.closeBlock() }, 'Cancel'),
      h('span', { class: 'note', style: { margin: 0 } }, 'Keys 1–4, or Esc to cancel.'),
    ),
  );
}

function reviewResultCard(app) {
  const { result, cardText } = app.ui.lastResult;
  const item = result.item;

  // This node only ever renders in the instant after a rating, so it carries
  // the system's single authored motion: the stamp coming down on the slip.
  return h('div', { class: 'card pressed', style: { marginTop: 'var(--s-md)' } },
    h('div', { class: 'spread' },
      h('h3', { style: { margin: 0 } }, `Logged — ${item.title}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn tiny', onClick: () => app.undoLastRating() }, 'Undo'),
        h('button', { class: 'btn bare tiny', onClick: () => app.dismissResult() }, 'Dismiss'),
      ),
    ),
    h('div', { class: 'row', style: { marginTop: 'var(--s-xs)' } },
      h('span', { class: 'stamp committed' }, humanDate(item.dueDate, app.ui.date)),
      h('span', { class: 'small muted' },
        `interval ${item.intervalDays}d · ease ${item.ease.toFixed(2)} · ${STATUS_LABEL[itemStatus(item)]}`),
    ),
    result.flags.map((f) => h('div', {
      class: `msg ${f.type === 'plateau' ? 'info' : f.type === 'reset' ? 'danger' : 'warn'}`,
      style: { marginTop: 'var(--s-sm)' },
    }, h('span', { class: 'ico' }, '!'), h('span', null, f.message))),

    // The engine asks "which part is failing?" — this is where the answer is
    // recorded, so the next session can target it instead of the whole topic.
    result.flags.some((f) => f.type === 'decompose') && subSkillPrompt(app, item),
    h('details', { style: { marginTop: 'var(--s-sm)' } },
      h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, 'Show card'),
      h('pre', { class: 'card-out', style: { marginTop: 'var(--s-sm)' } }, cardText),
    ),
  );
}

/** Capture the specific weak part of a topic (spec section 4). */
function subSkillPrompt(app, item) {
  const input = h('input', {
    type: 'text',
    value: item.subSkill || '',
    placeholder: 'e.g. induction, not proofs generally',
    onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } },
  });
  const save = () => app.setItemSubSkill(item.id, input.value);

  return h('div', { class: 'sub-skill' },
    h('label', { class: 'field', style: { margin: 0 } },
      h('span', { class: 'lbl' }, 'Which part is failing?'),
      input,
      h('span', { class: 'hint' },
        'Naming it narrows the next session to that part rather than repeating the whole topic.'),
    ),
    h('div', { class: 'row', style: { marginTop: 'var(--s-sm)' } },
      h('button', { class: 'btn tiny primary', onClick: save }, 'Save'),
      h('button', { class: 'btn bare tiny', onClick: () => app.dismissResult() }, 'Not now'),
    ),
  );
}

function cardOutput(app, session) {
  const text = formatSessionCard(app.store.state, session.date);
  return h('details', { class: 'card', style: { marginTop: '1rem' } },
    h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, "Today's card as text"),
    h('div', { style: { marginTop: 'var(--s-sm)' } },
      h('button', {
        class: 'btn tiny',
        style: { marginBottom: 'var(--s-sm)' },
        onClick: (e) => copyText(text, e.target),
      }, 'Copy'),
      h('pre', { class: 'card-out' }, text),
    ),
  );
}
