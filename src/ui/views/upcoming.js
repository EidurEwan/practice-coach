import { h } from '../dom.js';
import { humanDate, shortDate, todayISO, weekday } from '../../engine/dates.js';
import { GENRE_LABEL } from '../../engine/genres.js';
import { STATUS_LABEL, getSkill, itemStatus } from '../../engine/model.js';
import { HORIZONS, projectItem, projectLoad } from '../../engine/scheduler.js';
import { hueAttrs } from '../hues.js';

/**
 * Past three months there are too many individual reviews to name, so the
 * agenda switches from listing items to counting them per skill.
 */
const NAMES_ITEMS = new Set(['day', 'week']);

export function upcomingView(app) {
  const { store, ui } = app;

  if (store.state.items.length === 0) {
    return h('div', { class: 'empty' },
      h('h3', null, 'Nothing scheduled yet'),
      h('p', null, 'Log something and its whole future review chain appears here — out to five years if you want to see it.'),
      h('button', { class: 'btn primary', onClick: () => app.go('log') }, 'Log what you studied'),
    );
  }

  const horizon = HORIZONS.find((x) => x.id === ui.horizon) || HORIZONS[0];
  const activeSkill = store.state.skills.find((s) => s.id === ui.skillFilter) || null;
  const forecast = projectLoad(store.state, ui.date, horizon.days, { skillId: activeSkill?.id || null });
  const multiSkill = !activeSkill && forecast.skillTotals.length > 1;

  return h('div', null,
    h('h1', { class: 'page-title' }, 'Upcoming'),
    h('p', { class: 'lede' },
      activeSkill
        ? `${activeSkill.name} only. Each day shows what comes back on it.`
        : 'Each day shows what comes back on it, grouped by skill.'),

    h('div', { class: 'segmented', style: { marginBottom: 'var(--s-md)' } },
      HORIZONS.map((opt) => h('button', {
        class: 'btn tiny',
        'aria-pressed': String(opt.id === horizon.id),
        onClick: () => app.setHorizon(opt.id),
      }, opt.label)),
    ),

    skillFilter(app, activeSkill),
    summaryLine(forecast, horizon, multiSkill),
    multiSkill && skillTotals(app, forecast),
    legend(),

    h('h2', null, 'Schedule'),
    agenda(app, forecast, multiSkill),

    h('h2', null, 'Every item'),
    itemsBySkill(app, horizon, activeSkill),
  );
}

/** Filter the whole tab down to one skill. */
function skillFilter(app, activeSkill) {
  const skills = app.store.state.skills;
  if (skills.length < 2) return null;

  return h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by skill' },
    h('button', {
      class: 'chip',
      'aria-pressed': String(!activeSkill),
      onClick: () => app.setSkillFilter(null),
    }, 'All skills'),
    skills.map((s) => h('button', {
      class: 'chip',
      ...hueAttrs(app.store.state, s.id),
      'aria-pressed': String(activeSkill?.id === s.id),
      onClick: () => app.setSkillFilter(s.id),
    }, h('span', { class: 'skill-dot' }), s.name)),
  );
}

/**
 * The single biggest source of confusion was the same topic appearing on
 * several days with nothing saying it was the same thing coming back. This
 * states the rule once, and every row is marked accordingly.
 */
function legend() {
  return h('div', { class: 'legend' },
    h('span', { class: 'legend-item' },
      h('span', { class: 'chip-mini next' }, 'next'),
      'actually scheduled',
    ),
    h('span', { class: 'legend-item' },
      h('span', { class: 'chip-mini' }, '3rd'),
      'the same item coming back again — projected, assuming you keep rating "OK"',
    ),
  );
}

function summaryLine(forecast, horizon, multiSkill) {
  const n = (v) => h('b', { class: 'num' }, String(v));
  return h('p', { class: 'summary-line' },
    'Over the next ', horizon.label, ': ', n(forecast.totalReviews),
    forecast.totalReviews === 1 ? ' review' : ' reviews',
    multiSkill ? [' across ', n(forecast.skillTotals.length), ' skills'] : '',
    '. ',
    forecast.committed > 0
      ? [n(forecast.committed), ' due right now.']
      : 'Nothing due right now.',
  );
}

/** Answers "how much of this is Spanish?" before the day-by-day detail. */
function skillTotals(app, forecast) {
  const max = Math.max(...forecast.skillTotals.map((s) => s.count));
  return h('div', { class: 'skill-totals' },
    forecast.skillTotals.map(({ skill, count }) => h('button', {
      class: 'skill-total',
      ...hueAttrs(app.store.state, skill.id),
      title: `Show only ${skill.name}`,
      onClick: () => app.setSkillFilter(skill.id),
    },
      h('span', { class: 'name' }, h('span', { class: 'skill-dot' }), skill.name),
      h('span', { class: 'meter' }, h('i', { style: { width: `${(count / max) * 100}%` } })),
      h('span', { class: 'n num' }, String(count)),
    )),
  );
}

// ---------------------------------------------------------------- agenda

function agenda(app, forecast, multiSkill) {
  const filled = forecast.buckets.filter((b) => b.count > 0);
  if (filled.length === 0) {
    return h('p', { class: 'lede' }, 'Nothing falls inside this horizon.');
  }

  const namesItems = NAMES_ITEMS.has(forecast.granularity);
  const today = app.ui.date;

  return h('div', { class: 'agenda' },
    filled.map((bucket) => {
      const isNow = bucket.start <= today && bucket.end >= today;
      const overdue = bucket.entries.some((e) => e.item.dueDate < today) && isNow;

      return h('section', { class: `agenda-day ${isNow ? 'now' : ''}` },
        h('div', { class: 'agenda-head' },
          h('span', { class: 'when' }, bucketLabel(bucket, forecast, today)),
          overdue && h('span', { class: 'badge late' }, 'overdue'),
          h('span', { class: 'tally num' },
            `${bucket.count} ${bucket.count === 1 ? 'review' : 'reviews'}`),
        ),
        h('div', { class: 'agenda-body' },
          bucket.skills.map((group) => h('div', {
            class: 'agenda-skill',
            ...hueAttrs(app.store.state, group.skill.id),
          },
            multiSkill && h('div', { class: 'skill-name' },
              h('span', { class: 'skill-dot' }),
              group.skill.name,
              h('span', { class: 'genre' }, GENRE_LABEL[group.skill.genre]),
            ),
            namesItems
              ? h('ul', { class: 'agenda-items' },
                  dedupe(group.entries).map((e) => {
                    // Position in the chain, not the date: an overdue item's
                    // first entry lands on today rather than its due date, and
                    // it is still the committed review.
                    const isNext = e.repetition === e.item.repetition;
                    const late = isNext && e.item.dueDate < today;
                    return h('li', { class: isNext ? '' : 'projected' },
                      h('span', { class: 'dot-slot' },
                        itemStatus(e.item) !== 'active' && h('span', {
                          class: `dot ${statusDot(e.item)}`,
                          title: STATUS_LABEL[itemStatus(e.item)],
                        }),
                      ),
                      h('span', { class: 'label' }, e.item.title),
                      forecast.granularity === 'week' && h('span', { class: 'day' }, weekday(e.date)),
                      h('span', {
                        class: `chip-mini ${late ? 'late' : isNext ? 'next' : ''}`,
                        title: late
                          ? `Was due ${humanDate(e.item.dueDate, today)}`
                          : isNext
                            ? 'This date is actually scheduled'
                            : `Projected ${ordinal(e.repetition + 1)} review of the same item`,
                      }, late ? 'overdue' : isNext ? 'next' : ordinal(e.repetition + 1)),
                    );
                  }),
                )
              : h('div', { class: 'agenda-count' },
                  `${group.count} ${group.count === 1 ? 'review' : 'reviews'} across ${group.days.length} ${group.days.length === 1 ? 'day' : 'days'}`),
          )),
        ),
      );
    }),
  );
}

/** One line per item per bucket, even if it recurs inside a long bucket. */
function dedupe(entries) {
  const seen = new Set();
  return entries.filter((e) => (seen.has(e.item.id) ? false : seen.add(e.item.id)));
}

function ordinal(n) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

function bucketLabel(bucket, forecast, today) {
  if (forecast.granularity !== 'day') return bucket.label;
  if (bucket.start === today) return 'Today';
  const delta = humanDate(bucket.start, today);
  if (delta === 'tomorrow') return 'Tomorrow';
  return `${weekday(bucket.start)} ${shortDate(bucket.start)}`;
}

function statusDot(item) {
  const s = itemStatus(item);
  return s === 'plateau' ? 'plateau' : 'weak';
}

// ------------------------------------------------------------- item list

function itemsBySkill(app, horizon, activeSkill) {
  const { state } = app.store;
  const groups = new Map();

  for (const item of state.items) {
    if (item.archived) continue;
    if (activeSkill && item.skillId !== activeSkill.id) continue;
    const skill = getSkill(state, item.skillId);
    if (!skill) continue;
    if (!groups.has(skill.id)) groups.set(skill.id, { skill, items: [] });
    groups.get(skill.id).items.push(item);
  }

  return h('div', { class: 'stack' },
    [...groups.values()]
      .sort((a, b) => a.skill.name.localeCompare(b.skill.name))
      .map(({ skill, items }) => h('section', {
        class: 'skill-group',
        ...hueAttrs(app.store.state, skill.id),
      },
        h('h3', { class: 'skill-group-head' },
          h('span', { class: 'skill-dot' }),
          skill.name,
          h('span', { class: 'genre' },
            `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${GENRE_LABEL[skill.genre]}`),
        ),
        h('div', { class: 'stack' },
          items
            .slice()
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .map((item) => itemRow(app, item, horizon)),
        ),
      )),
  );
}

function itemRow(app, item, horizon) {
  const status = itemStatus(item);
  const overdue = item.dueDate < app.ui.date;

  return h('details', { class: 'item-row' },
    h('summary', null,
      status !== 'active' && h('span', { class: `dot ${statusDot(item)}` }),
      h('span', { class: 'title' }, item.title),
      h('span', { class: 'when' },
        overdue
          ? h('b', { style: { color: 'var(--overdue)' } }, humanDate(item.dueDate, app.ui.date))
          : humanDate(item.dueDate, app.ui.date)),
    ),
    h('div', { class: 'small faint', style: { margin: 'var(--s-xs) 0 var(--s-sm)' } },
      [
        item.subSkill,
        `interval ${item.intervalDays}d`,
        `${item.history.length} review${item.history.length === 1 ? '' : 's'} so far`,
        status !== 'active' ? STATUS_LABEL[status] : null,
      ].filter(Boolean).join(' · ')),
    chainFor(app, item, horizon),
  );
}

function chainFor(app, item, horizon) {
  const chain = projectItem(app.store.state, item.id, app.ui.date, horizon.days);
  if (chain.length === 0) {
    return h('p', { class: 'small faint' }, `No reviews inside the next ${horizon.label}.`);
  }

  const byYear = new Map();
  for (const hit of chain) {
    const year = hit.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(hit);
  }

  return h('div', { class: 'chain' },
    [...byYear.entries()].map(([year, hits]) => h('div', { class: 'chain-year' },
      h('span', { class: 'y' }, year),
      h('span', { class: 'dates' }, hits.map((hit) => h('span', {
        class: `stamp ${hit.date === chain[0].date ? 'committed' : ''}`,
        title: hit.date === chain[0].date ? 'Actually scheduled' : 'Projected',
      }, shortDate(hit.date)))),
    )),
  );
}
