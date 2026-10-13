import { skill, topic } from '../../engine/__tests__/factory';
import { LogEntry, Review } from '../../engine/types';
import { BATCH_SIZE, metaStore, SyncInterrupted, syncOnce } from '../engine';
import { parseMeta } from '../protocol';
import { Device, FakeServer, ids } from './fakeServer';

function review(id: string, topicId: string, at: string): Review {
  return {
    id,
    topic_id: topicId,
    rating: 'ok',
    felt_shaky: false,
    rated_at: at,
    prev_interval: 5,
    next_interval: 11,
    updated_at: at,
  };
}

function logEntry(id: string, skillId: string, topicId: string, at: string): LogEntry {
  return {
    id,
    skill_id: skillId,
    topic_id: topicId,
    sub_skill: null,
    studied_on: '2026-10-01',
    flags: [],
    created_at: at,
    updated_at: at,
  };
}

/** Two phones on one account, both holding a skill with one topic. */
async function twoPhones() {
  const server = new FakeServer();
  const a = new Device('2026-10-01T09:00:00.000Z');
  const b = new Device('2026-10-01T09:00:30.000Z');
  const at = a.stamp();
  a.edit((d) => ({
    ...d,
    skills: [skill({ id: 'maths', updated_at: at })],
    topics: [topic({ id: 'calc', skill_id: 'maths', updated_at: at })],
  }));
  await a.sync(server);
  await b.sync(server);
  return { server, a, b };
}

const expectSaved = (...devices: Device[]) => {
  for (const d of devices) expect(d.disk).toEqual(d.doc);
};

const rate = (d: Device, topicId: string, reviewId: string) => {
  const at = d.stamp();
  d.edit((doc) => ({
    ...doc,
    topics: doc.topics.map((t) => (t.id === topicId ? { ...t, interval_days: 11, updated_at: at } : t)),
    reviews: [...doc.reviews, review(reviewId, topicId, at)],
  }));
};

describe('two phones, one account', () => {
  test('what one phone does arrives on the other', async () => {
    const { a, b } = await twoPhones();
    expect(ids(b.doc)).toEqual(ids(a.doc));
    expect(b.doc.topics[0].title).toBe('Integration by parts');
    expectSaved(a, b);
  });

  test('a second sync with nothing new sends and fetches nothing', async () => {
    const { server, a } = await twoPhones();
    const before = { ...server.calls };
    const report = await a.sync(server);
    expect(report).toEqual({ pulled: 0, pushed: 0, rejected: 0 });
    // One empty read to learn there is nothing new; no push at all.
    expect(server.calls.pull - before.pull).toBe(1);
    expect(server.calls.push - before.push).toBe(0);
  });

  test('a phone does not download its own changes back', async () => {
    const { server, a } = await twoPhones();
    rate(a, 'calc', 'r1');
    const report = await a.sync(server);
    expect(report.pushed).toBe(2);
    expect(report.pulled).toBe(0);
  });

  test('ratings made offline on both phones are all kept', async () => {
    const { server, a, b } = await twoPhones();
    rate(a, 'calc', 'from-a');
    rate(b, 'calc', 'from-b');
    await a.sync(server);
    await b.sync(server);
    await a.sync(server);
    expect(a.doc.reviews.map((r) => r.id).sort()).toEqual(['from-a', 'from-b']);
    expect(ids(a.doc)).toEqual(ids(b.doc));
    expect(a.doc.topics).toEqual(b.doc.topics);
    expectSaved(a, b);
  });

  test('the later edit to the same row wins, on both phones', async () => {
    const { server, a, b } = await twoPhones();
    const early = a.stamp();
    a.edit((d) => ({ ...d, skills: [{ ...d.skills[0], name: 'Earlier', updated_at: early }] }));
    const late = b.stamp();
    b.edit((d) => ({ ...d, skills: [{ ...d.skills[0], name: 'Later', updated_at: late }] }));

    await b.sync(server);
    const report = await a.sync(server);
    expect(report.rejected).toBe(0); // a's read brought b's edit in before it pushed anything
    expect(a.doc.skills[0].name).toBe('Later');
    expect(b.doc.skills[0].name).toBe('Later');
    expectSaved(a, b);
  });
});

describe('deletions', () => {
  test('an undone rating stays undone on the other phone', async () => {
    const { server, a, b } = await twoPhones();
    rate(a, 'calc', 'oops');
    await a.sync(server);
    await b.sync(server);
    expect(b.doc.reviews.map((r) => r.id)).toEqual(['oops']);

    // Undo: the rating goes, the topic goes back to how it was, restamped.
    const at = a.stamp();
    a.edit((d) => ({
      ...d,
      reviews: [],
      topics: d.topics.map((t) => ({ ...t, interval_days: 5, updated_at: at })),
    }));
    await a.sync(server);
    await b.sync(server);
    // The first version of sync put it back here, and then on `a` too.
    await a.sync(server);

    expect(a.doc.reviews).toEqual([]);
    expect(b.doc.reviews).toEqual([]);
    expect(b.doc.topics[0].interval_days).toBe(5);
    expect(server.get('user-a', 'reviews', 'oops')?.deleted).toBe(true);
    expectSaved(a, b);
  });

  test('deleting a skill takes everything under it off every phone', async () => {
    const { server, a, b } = await twoPhones();
    rate(a, 'calc', 'r1');
    await a.sync(server);
    await b.sync(server);

    a.edit((d) => ({ ...d, skills: [], topics: [], reviews: [] }));
    await a.sync(server);
    await b.sync(server);

    expect(ids(b.doc)).toEqual(ids(a.doc));
    expect(b.doc.skills).toEqual([]);
    expect(b.doc.reviews).toEqual([]);
    expectSaved(a, b);
  });

  test('a topic added offline to a skill deleted elsewhere is not left stranded', async () => {
    const { server, a, b } = await twoPhones();

    a.edit((d) => ({ ...d, skills: [], topics: [] })); // deleted, not yet synced
    const at = b.stamp();
    b.edit((d) => ({
      ...d,
      topics: [...d.topics, topic({ id: 'late', skill_id: 'maths', updated_at: at })],
      log_entries: [logEntry('log-late', 'maths', 'late', at)],
    }));

    await b.sync(server); // the server now holds a topic for a skill that is about to go
    await a.sync(server);
    await b.sync(server);

    for (const d of [a, b]) {
      expect(d.doc.topics).toEqual([]);
      expect(d.doc.log_entries).toEqual([]);
    }
    expect(server.docFor('user-a').topics).toEqual([]);
    expectSaved(a, b);
  });

  test('a deletion not yet uploaded survives an edit that reached the server first', async () => {
    const { server, a, b } = await twoPhones();
    a.edit((d) => ({ ...d, skills: [], topics: [] })); // deleted, still offline

    const at = b.stamp();
    b.edit((d) => ({ ...d, skills: [{ ...d.skills[0], name: 'Renamed first', updated_at: at }] }));
    await b.sync(server);
    await a.sync(server); // reads the rename before it uploads the deletion
    await b.sync(server);

    expect(a.doc.skills).toEqual([]);
    expect(b.doc.skills).toEqual([]);
    expect(server.get('user-a', 'skills', 'maths')?.deleted).toBe(true);
    expectSaved(a, b);
  });

  test('an edit made offline does not bring a deleted row back', async () => {
    const { server, a, b } = await twoPhones();
    a.edit((d) => ({ ...d, skills: [], topics: [] }));
    await a.sync(server);

    const at = b.stamp();
    b.edit((d) => ({ ...d, skills: [{ ...d.skills[0], name: 'Renamed offline', updated_at: at }] }));
    await b.sync(server);
    await a.sync(server);

    expect(b.doc.skills).toEqual([]);
    expect(a.doc.skills).toEqual([]);
    expectSaved(a, b);
  });
});

describe('work done while a sync is in flight', () => {
  test('a rating made during the download is kept', async () => {
    const { server, a, b } = await twoPhones();
    rate(a, 'calc', 'from-a');
    await a.sync(server);

    // b rates while its request for a's change is still out.
    server.duringPull = () => rate(b, 'calc', 'mid-sync');
    await b.sync(server);
    expect(b.doc.reviews.map((r) => r.id).sort()).toEqual(['from-a', 'mid-sync']);

    await a.sync(server);
    expect(a.doc.reviews.map((r) => r.id).sort()).toEqual(['from-a', 'mid-sync']);
    expectSaved(a, b);
  });

  test('a rating made during the upload is sent on the next sync', async () => {
    const { server, a, b } = await twoPhones();
    rate(a, 'calc', 'first');
    server.duringPush = () => rate(a, 'calc', 'second');
    await a.sync(server);
    expect(a.doc.reviews.map((r) => r.id).sort()).toEqual(['first', 'second']);

    await a.sync(server);
    await b.sync(server);
    expect(b.doc.reviews.map((r) => r.id).sort()).toEqual(['first', 'second']);
    expect(b.doc.topics).toEqual(a.doc.topics);
    expectSaved(a, b);
  });
});

describe('size', () => {
  test('a new phone gets every row, however few the server sends at a time', async () => {
    const server = new FakeServer();
    server.maxRows = 7; // well under the page size the engine asks for
    const a = new Device();
    const at = a.stamp();
    a.edit((d) => ({
      ...d,
      skills: [skill({ id: 's', updated_at: at })],
      topics: [topic({ id: 't', skill_id: 's', updated_at: at })],
      reviews: Array.from({ length: 1234 }, (_, i) => review(`r${i}`, 't', at)),
    }));
    await a.sync(server);

    // Renaming the skill moves it to the end of the feed, after its topic and
    // every rating — so a phone reading page by page meets them first.
    const later = a.stamp();
    a.edit((d) => ({ ...d, skills: [{ ...d.skills[0], name: 'Renamed', updated_at: later }] }));
    await a.sync(server);

    const fresh = new Device();
    await fresh.sync(server);
    expect(fresh.doc.reviews).toHaveLength(1234);
    expect(fresh.doc.topics).toHaveLength(1);
    expect(fresh.doc.skills[0].name).toBe('Renamed');
    expectSaved(fresh);
  });

  test('a large first upload goes up in batches the server accepts', async () => {
    const server = new FakeServer();
    const a = new Device();
    const at = a.stamp();
    a.edit((d) => ({
      ...d,
      skills: [skill({ id: 's', updated_at: at })],
      topics: [topic({ id: 't', skill_id: 's', updated_at: at })],
      reviews: Array.from({ length: 1000 }, (_, i) => review(`r${i}`, 't', at)),
    }));
    await a.sync(server);
    expect(server.calls.push).toBe(Math.ceil(1003 / BATCH_SIZE));
    expect(server.docFor('user-a').reviews).toHaveLength(1000);
  });
});

describe('accounts', () => {
  test('the same phone can sync with a second account', async () => {
    const { server, a } = await twoPhones();
    const report = await a.sync(server, 'user-b');
    expect(report.rejected).toBe(0);
    expect(ids(server.docFor('user-b'))).toEqual(ids(a.doc));
    // Each account has its own record of what it holds.
    expect([...a.meta.keys()].sort()).toEqual(['sync:user-a', 'sync:user-b']);
  });

  test('a phone signing in adopts the account’s settings over its onboarding defaults', async () => {
    const server = new FakeServer();
    const old = new Device('2026-06-01T00:00:00.000Z');
    const set = old.stamp();
    old.edit((d) => ({
      ...d,
      settings: { ...d.settings, daily_capacity: 12, exam_date: '2027-05-01', onboarded: true, updated_at: set },
    }));
    await old.sync(server);

    const phone = new Device('2026-10-01T00:00:00.000Z');
    const onboarded = phone.stamp(); // months later than the account's settings
    phone.edit((d) => ({ ...d, settings: { ...d.settings, onboarded: true, updated_at: onboarded } }));
    await phone.sync(server);

    expect(phone.doc.settings.daily_capacity).toBe(12);
    expect(phone.doc.settings.exam_date).toBe('2027-05-01');
    expect(server.docFor('user-a').settings.daily_capacity).toBe(12);
    expectSaved(phone);

    // From then on, it is the ordinary rule.
    const changed = phone.stamp();
    phone.edit((d) => ({ ...d, settings: { ...d.settings, daily_capacity: 4, updated_at: changed } }));
    await phone.sync(server);
    await old.sync(server);
    expect(old.doc.settings.daily_capacity).toBe(4);
  });

  test('settings go up from a phone when the account has none', async () => {
    const server = new FakeServer();
    const a = new Device();
    const at = a.stamp();
    a.edit((d) => ({ ...d, settings: { ...d.settings, daily_capacity: 6, updated_at: at } }));
    await a.sync(server);
    expect(server.docFor('user-a').settings.daily_capacity).toBe(6);
  });
});

describe('failure', () => {
  test('a sync that fails part-way loses nothing and finishes next time', async () => {
    const server = new FakeServer();
    const a = new Device();
    const at = a.stamp();
    a.edit((d) => ({
      ...d,
      skills: [skill({ id: 's', updated_at: at })],
      topics: [topic({ id: 't', skill_id: 's', updated_at: at })],
      reviews: Array.from({ length: 450 }, (_, i) => review(`r${i}`, 't', at)),
    }));

    // The first batch lands, the second does not.
    const remote = server.remote('user-a');
    let pushes = 0;
    const flaky = {
      pull: remote.pull,
      push: async (...args: Parameters<typeof remote.push>) => {
        if (++pushes === 2) throw new Error('network went away');
        return remote.push(...args);
      },
    };
    const meta = metaStore(
      { readMeta: async (k) => a.meta.get(k) ?? null, writeMeta: async (k, v) => void a.meta.set(k, v) },
      'user-a',
    );
    await expect(syncOnce({ local: a.local, remote: flaky, meta, now: () => a.stamp() })).rejects.toThrow(
      'network went away',
    );

    const report = await a.sync(server);
    expect(report.rejected).toBe(0); // the first batch again is a no-op, not a conflict
    expect(server.docFor('user-a').reviews).toHaveLength(450);
    expect(a.doc.reviews).toHaveLength(450);
  });

  test('erasing this phone mid-sync does not erase the account', async () => {
    for (const moment of ['duringPull', 'duringPush'] as const) {
      const { server, a } = await twoPhones();
      rate(a, 'calc', 'r1'); // something to push, so the push happens
      server[moment] = () => a.erase();
      await expect(a.sync(server)).rejects.toBeInstanceOf(SyncInterrupted);

      expect(server.docFor('user-a').skills).toHaveLength(1);
      expect(a.meta.size).toBe(0); // the stale base was not written back

      await a.sync(server); // the account is still there to come back from
      expect(a.doc.skills).toHaveLength(1);
    }
  });

  test('lost bookkeeping costs a download, never a deletion', async () => {
    const { server, a } = await twoPhones();
    a.meta.clear();
    await a.sync(server);
    expect(server.docFor('user-a').skills).toHaveLength(1);
    expect(a.doc.skills).toHaveLength(1);
  });

  test('saved bookkeeping is what the next sync reads', async () => {
    const { a } = await twoPhones();
    const meta = parseMeta(a.meta.get('sync:user-a') ?? null)!;
    expect(meta.cursor).toBeGreaterThan(0);
    expect(Object.keys(meta.base.topics)).toEqual(['calc']);
  });
});
