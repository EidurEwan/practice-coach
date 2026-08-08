import { h, copyText } from '../dom.js';
import { humanDate, shortDate, weekday } from '../../engine/dates.js';
import { GENRE_LABEL } from '../../engine/genres.js';
import { itemStatus, STATUS_LABEL } from '../../engine/model.js';
import { buildSession, previewRating, activeSkills } from '../../engine/scheduler.js';
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

  if (activeSkills(store.state).length === 0) {
    return h('div', { class: 'empty' },
      h('h3', null, 'No skills yet'),
      h('p', null, 'Add a skill and it builds the schedule around it.'),
      h('button', { class: 'btn primary', onClick: () => app.go('skills') }, 'Add your first skill'),
    );
  }

  const done = store.state.reviews.filter((r) => r.date === date).length;
  const noItems = store.state.items.length === 0;

  return h('div', null,
    session.windDown.length > 0 && windDownCard(app, session),
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
          h('p', null, 'Log the first thing you studied.'),
          h('button', { class: 'btn primary', onClick: () => app.go('log') }, 'Log what you studied'),
        )
      : session.blocks.length === 0
        ? doneCard(app, done)
        : sessionList(app, session),

    session.blocks.length > 0 && h('div', null,
      h('div', { class: 'row', style: { marginTop: 'var(--s-md)' } },
        h('button', { class: 'btn tiny', onClick: () => app.go('log') }, 'Log something new'),
      ),
      h('div', { style: { marginTop: 'var(--s-md)' } }, cardOutput(app, session)),
    ),
  );
}

/**
 * Shown once a target date has passed. The exam is the end of something, and
 * the app used to carry on demanding daily work on a finished syllabus with no
 * exit but a delete that destroyed the history. Nothing here is scheduled any
 * more; the point of the card is to say so, show what the work amounted to, and
 * keep the way back open in one tap.
 */
function windDownCard(app, session) {
  const many = session.windDown.length > 1;
  const totalReviews = session.windDown.reduce((n, w) => n + w.reviews, 0);

  return h('div', { class: 'card wind-down' },
    h('div', { class: 'wind-mark', 'aria-hidden': 'true' }, '✓'),
    h('h3', null, many ? 'That is your exams done' : `${session.windDown[0].skill.name} is done`),
    h('p', { class: 'muted' },
      `${totalReviews} review${totalReviews === 1 ? '' : 's'} logged. `
      + 'Nothing from these is scheduled any more, and none of it is deleted.'),

    h('ul', { class: 'wind-list' }, session.windDown.map((w) => h('li', null,
      h('div', null,
        h('span', { class: 'wind-name' }, w.skill.name),
        // Not humanDate: it renders a past date as "12d overdue", which is
        // right for a review and nonsense for an exam that has been sat.
        h('span', { class: 'small faint' },
          ` · sat ${weekday(w.finishedOn)} ${shortDate(w.finishedOn)}`
          + (w.daysSince > 0 ? `, ${w.daysSince} day${w.daysSince === 1 ? '' : 's'} ago` : '')
          + ` · ${w.topics} topic${w.topics === 1 ? '' : 's'}`),
      ),
      h('button', {
        class: 'btn tiny',
        onClick: () => app.resumeSkill(w.skill.id),
      }, 'Keep practising'),
    ))),

    h('p', { class: 'small faint' },
      'Set a new target date under Skills when the next one is booked.'),
  );
}

/**
 * Today's work, then the backlog behind a disclosure.
 *
 * Rendering an entire backlog as one scrolling list is what makes people
 * abandon it — sixty cards reads as failure, where the same sixty behind
 * "today's twelve" reads as a plan. The engine ranks the blocks and decides
 * where the day's capacity runs out; this only draws the line.
 */
function sessionList(app, session) {
  const focus = session.blocks.slice(0, session.focusCount);
  const rest = session.blocks.slice(session.focusCount);
  if (rest.length === 0) {
    return h('div', { class: 'slip' }, focus.map((block, i) => blockCard(app, block, i)));
  }

  // Forced open while the card being worked on lives down here, so the section
  // cannot close over an active recall panel.
  const activeInBacklog = rest.some((b) => b.id === app.ui.activeBlock);

  return h('div', null,
    h('div', { class: 'slip' }, focus.map((block, i) => blockCard(app, block, i))),
    h('details', {
      class: 'backlog',
      open: app.ui.backlogOpen || activeInBacklog,
      onToggle: (e) => { app.ui.backlogOpen = e.target.open; },
    },
      h('summary', null,
        h('span', { class: 'backlog-n' }, String(rest.length)),
        h('span', null, `more due, beyond today's ${session.capacity}`),
      ),
      h('div', { class: 'backlog-body' },
        h('p', { class: 'small muted' },
          'Ranked hardest-first. Clearing the ones above is the whole job — these move themselves up tomorrow.'),
        h('div', { class: 'slip' }, rest.map((block, i) => blockCard(app, block, session.focusCount + i))),
      ),
    ),
  );
}

function sessionHeader(app, session, done) {
  const pct = Math.min(100, (session.totalUnits / session.capacity) * 100);
  const over = session.totalUnits > session.capacity;
  const isToday = app.ui.date === app.todayISO;

  return h('div', null,
    // One control rather than three loose bits of text: the chevrons had no
    // chrome at all, so nothing on the screen said the date could be moved.
    h('div', { class: 'row datenav', style: { marginTop: 'var(--s-lg)' } },
      h('div', { class: 'date-pill' },
        h('button', {
          class: 'btn bare tiny date-arrow',
          onClick: () => app.shiftDate(-1),
          title: 'Previous day',
          'aria-label': 'Previous day',
        }, '‹'),
        h('span', { class: 'date-now' }, `${weekday(app.ui.date)} ${shortDate(app.ui.date)}`),
        h('button', {
          class: 'btn bare tiny date-arrow',
          onClick: () => app.shiftDate(1),
          title: 'Next day',
          'aria-label': 'Next day',
        }, '›'),
      ),
      !isToday && h('button', { class: 'btn tiny', onClick: () => app.resetDate() }, 'Back to today'),
    ),

    // The one display-scale moment on the screen.
    h('h1', { class: 'page-title', style: { marginTop: 'var(--s-md)' } },
      isToday ? "Today's practice" : humanDate(app.ui.date, app.todayISO)),
    // A number carries this better than a sentence does — and the number has to
    // be the day's work, not the size of the backlog behind it.
    session.blocks.length > 0 && h('div', { class: 'tally-row' },
      h('span', { class: 'tally-n' }, String(session.focusCount)),
      h('span', { class: 'tally-l' },
        session.focusCount === 1 ? 'thing to review' : 'things to review',
        session.deferredCount > 0 && h('em', null, `${session.deferredCount} more waiting`),
        done > 0 && h('em', null, `${done} done already`),
      ),
    ),
    session.blocks.length === 0 && h('p', { class: 'lede', style: { marginTop: 'var(--s-xs)' } },
      done > 0 ? `${done} done. Nothing else due.` : 'Nothing due.'),

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
        ? `${done} logged. Stop here — extra reps work against the spacing.`
        : 'Everything is spaced where it should be.'),
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
    class: `slip-row ${index === 0 ? 'is-first' : ''} ${isActive ? 'is-active' : ''}`,
    ...hueAttrs(app.store.state, block.skill.id),
    // The card lifts under the pointer, so it has to do something when pressed:
    // the whole card starts the block, not just the button in it. Controls
    // inside keep their own behaviour, and an open card is left alone so a
    // stray click near the rating buttons cannot restart the check.
    onClick: isActive ? null : (e) => {
      if (e.target.closest('button, summary, a, input, textarea, select')) return;
      app.startBlock(block.id);
    },
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
              class: `start-btn ${index === 0 ? 'btn primary' : 'btn'}`,
              onClick: () => app.startBlock(block.id),
            }, block.kind === 'batch' ? `Start ${block.items.length} card${block.items.length === 1 ? '' : 's'}` : 'Start'),
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
