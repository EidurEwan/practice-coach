import { CURRENT_VERSION, normaliseDoc, parseDocument, serialiseDocument, serialiseForExport } from '../format';
import { doc, skill, topic } from '../../engine/__tests__/factory';

describe('reading what earlier builds wrote', () => {
  it('opens a version 1 file — the bare document, no envelope', () => {
    const s = skill({ name: 'Chemistry' });
    const t = topic({ skill_id: s.id, title: 'Le Chatelier' });
    const v1 = JSON.stringify(doc({ skills: [s], topics: [t] }));

    const { doc: read, from, migrated } = parseDocument(v1);

    expect(from).toBe(1);
    expect(migrated).toBe(true);
    expect(read.skills).toHaveLength(1);
    expect(read.topics[0].title).toBe('Le Chatelier');
  });

  it('loses nothing crossing versions', () => {
    const s = skill();
    const before = doc({
      skills: [s],
      topics: [topic({ skill_id: s.id }), topic({ skill_id: s.id })],
    });
    before.settings.daily_capacity = 12;
    before.settings.onboarded = true;

    const migrated = parseDocument(JSON.stringify(before)).doc;
    const reread = parseDocument(serialiseDocument(migrated)).doc;

    expect(reread.skills).toEqual(before.skills);
    expect(reread.topics).toEqual(before.topics);
    expect(reread.settings.daily_capacity).toBe(12);
    expect(reread.settings.onboarded).toBe(true);
  });

  it('opens what it writes, and reports it as current', () => {
    const written = serialiseDocument(doc({ skills: [skill()] }));
    const { from, migrated } = parseDocument(written);
    expect(from).toBe(CURRENT_VERSION);
    expect(migrated).toBe(false);
  });

  it('imports an export from either version', () => {
    const s = skill({ name: 'Biology' });
    const old = JSON.stringify(doc({ skills: [s] }), null, 2);
    const current = serialiseForExport(doc({ skills: [s] }));

    expect(parseDocument(old).doc.skills[0].name).toBe('Biology');
    expect(parseDocument(current).doc.skills[0].name).toBe('Biology');
  });

  it('refuses only text that is not JSON', () => {
    expect(() => parseDocument('not json at all')).toThrow();
  });
});

describe('normalising a document', () => {
  it('fills in a collection that went missing', () => {
    // Precisely what the old concurrent-write bug left behind.
    const damaged = { skills: [skill()], settings: { daily_capacity: 6 } };
    const out = normaliseDoc(damaged);

    expect(out.topics).toEqual([]);
    expect(out.log_entries).toEqual([]);
    expect(out.pairs).toEqual([]);
    expect(out.settings.daily_capacity).toBe(6);
    // Settings absent from the file still get their defaults.
    expect(out.settings.theme).toBe('system');
  });

  it('keeps rows it cannot address out of the document', () => {
    const out = normaliseDoc({ skills: [skill(), { name: 'no id here' }, null] });
    expect(out.skills).toHaveLength(1);
  });

  it('survives nonsense where a document should be', () => {
    for (const junk of [null, undefined, 42, 'text', []]) {
      expect(normaliseDoc(junk).skills).toEqual([]);
    }
  });

  it('does not quietly delete a log entry whose topic is gone', () => {
    // Repairing by deletion would destroy the evidence of a past bug, and the
    // person's record of having studied.
    const s = skill();
    const orphan = {
      id: 'log-1', skill_id: s.id, topic_id: 'topic-that-vanished',
      sub_skill: null, studied_on: '2026-08-27', flags: [],
      created_at: '2026-08-27T09:00:00.000Z', updated_at: '2026-08-27T09:00:00.000Z',
    };
    expect(normaliseDoc({ skills: [s], log_entries: [orphan] }).log_entries).toHaveLength(1);
  });
});
