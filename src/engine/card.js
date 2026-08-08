// The spec's output format (section 7), rendered as plain text so it can be
// copied out of the app into notes, a journal, or a chat.

import { humanDate, todayISO } from './dates.js';
import { GENRE_LABEL } from './genres.js';
import { practiceMethod } from './methods.js';
import { lastReview } from './model.js';
import { buildSession, dueItems } from './scheduler.js';

function genreTag(skill) {
  const base = GENRE_LABEL[skill.genre];
  if (skill.genre === 'physical') return `${base} — ${skill.physicalType}`;
  return base;
}

/** Card emitted right after logging something new. */
export function formatLogCard(store, { skill, item, flags = [], projection = [] }, date = todayISO()) {
  const lines = [];
  const descriptor = [genreTag(skill), skill.name, item.subSkill].filter(Boolean).join(', ');
  lines.push(`📌 Logged: ${item.title} (${descriptor})`);

  const method = practiceMethod(item, skill, {});
  lines.push(`📅 Next review: ${humanDate(item.dueDate, date)} — method: ${method.label} — ${method.detail}`);

  const alsoDue = dueItems(store, date).filter((i) => i.id !== item.id);
  lines.push(
    alsoDue.length
      ? `🔁 Also due today: ${alsoDue.map((i) => i.title).join(', ')}`
      : '🔁 Also due today: nothing else',
  );

  lines.push(
    `🗓 Upcoming schedule for this topic: ${projection.map((d) => humanDate(d, date)).join(' → ')}`,
  );

  lines.push(
    flags.length
      ? `⚠️ Flags:\n${flags.map((f) => `   • ${f.message}`).join('\n')}`
      : '⚠️ Flags: none',
  );

  if (item.encoding) lines.push(`🧠 Encoding: ${item.encoding}`);

  return lines.join('\n');
}

/** Card emitted after a review, showing what the rating did to the schedule. */
export function formatReviewCard(store, result, date = todayISO()) {
  const { item, skill, flags, projection } = result;
  const lines = [];
  const last = lastReview(store, item.id);

  lines.push(`📌 Reviewed: ${item.title} (${genreTag(skill)}${item.subSkill ? `, ${item.subSkill}` : ''}) — rated ${last.rating}`);
  lines.push(
    `📅 Next review: ${humanDate(item.dueDate, date)} — interval ${last.intervalBefore}d → ${item.intervalDays}d, ease ${item.ease.toFixed(2)}`,
  );
  lines.push(`🗓 Upcoming: ${projection.map((d) => humanDate(d, date)).join(' → ')}`);
  lines.push(
    flags.length
      ? `⚠️ Flags:\n${flags.map((f) => `   • ${f.message}`).join('\n')}`
      : '⚠️ Flags: none',
  );
  return lines.join('\n');
}

/** The full "today's practice card": what's due, in what order, how, how long. */
export function formatSessionCard(store, date = todayISO()) {
  const session = buildSession(store, date);
  const lines = [];

  lines.push(`🗓 Practice card — ${humanDate(date, date) === 'today' ? 'today' : date} (${date})`);
  lines.push(`${session.totalUnits} due across ${session.blocks.length} block(s) · cap ${session.capacity}`);
  lines.push('');

  if (session.blocks.length === 0) {
    lines.push('Nothing is due. Log what you study today and it will schedule itself.');
  }

  session.blocks.forEach((block, index) => {
    const title = block.kind === 'batch'
      ? `${block.skill.name} — ${block.items.length} due item(s)`
      : block.item.title;
    const badges = [];
    if (block.overdueDays > 0) badges.push(`OVERDUE ${block.overdueDays}d`);
    if (block.preDeadline) badges.push('PRE-DEADLINE');
    if (block.status !== 'active') badges.push(block.status.toUpperCase());

    lines.push(`${index + 1}. ${title}${badges.length ? `  [${badges.join(' · ')}]` : ''}`);
    lines.push(`   ${genreTag(block.skill)} · ${block.skill.name}`);
    lines.push(`   Method — ${block.method.label}: ${block.method.detail}`);
    if (block.interleaveWith) {
      const kind = block.interleaveWith.kind === 'booster'
        ? 'booster touch, its own schedule is unchanged'
        : block.interleaveWith.kind === 'cross-skill'
          ? 'from another skill'
          : 'also due today';
      lines.push(`   Interleave with — ${block.interleaveWith.item.title} (${kind})`);
    }
    block.flags.forEach((f) => lines.push(`   ⚠️ ${f.message}`));
    lines.push('');
  });

  if (session.warnings.length) {
    lines.push('⚠️ Flags:');
    session.warnings.forEach((w) => lines.push(`   • ${w.message}`));
  }

  return lines.join('\n').trimEnd();
}
