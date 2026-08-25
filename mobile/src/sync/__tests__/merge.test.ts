import { emptyDoc } from '../../engine/types';
import { skill, topic } from '../../engine/__tests__/factory';
import { mergeDocs, rowsToPush, isNewer } from '../merge';

const early = '2026-08-09T08:00:00.000Z';
const late = '2026-08-09T20:00:00.000Z';

describe('merging two devices', () => {
  test('the newer copy of a row wins', () => {
    const mine = topic({ id: 't', title: 'Rated on the phone', interval_days: 22, updated_at: late });
    const theirs = topic({ id: 't', title: 'Rated on the laptop', interval_days: 5, updated_at: early });

    const forward = mergeDocs({ ...emptyDoc(), topics: [mine] }, { ...emptyDoc(), topics: [theirs] });
    expect(forward.merged.topics[0].title).toBe('Rated on the phone');
    expect(forward.push.topics.map((r) => r.id)).toEqual(['t']);

    const backward = mergeDocs({ ...emptyDoc(), topics: [theirs] }, { ...emptyDoc(), topics: [mine] });
    expect(backward.merged.topics[0].title).toBe('Rated on the phone');
    expect(backward.push.topics).toEqual([]);
  });

  test('rows only one side has are kept, not dropped', () => {
    const local = { ...emptyDoc(), skills: [skill({ id: 'a' })] };
    const remote = { ...emptyDoc(), skills: [skill({ id: 'b' })] };
    const { merged, push } = mergeDocs(local, remote);
    expect(merged.skills.map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(push.skills.map((r) => r.id)).toEqual(['a']);
  });

  test('a review logged offline on either side survives', () => {
    const review = (id: string) => ({
      id,
      topic_id: 't',
      rating: 'ok' as const,
      felt_shaky: false,
      rated_at: early,
      prev_interval: 5,
      next_interval: 10,
      updated_at: early,
    });
    const { merged } = mergeDocs(
      { ...emptyDoc(), reviews: [review('mine')] },
      { ...emptyDoc(), reviews: [review('theirs')] },
    );
    expect(merged.reviews).toHaveLength(2);
  });

  test('settings follow the same rule and are pushed only when local is newer', () => {
    const local = emptyDoc();
    local.settings = { ...local.settings, daily_capacity: 12, updated_at: late };
    const remote = emptyDoc();
    remote.settings = { ...remote.settings, daily_capacity: 4, updated_at: early };

    expect(mergeDocs(local, remote).merged.settings.daily_capacity).toBe(12);
    expect(mergeDocs(local, remote).pushSettings).toBe(true);
    expect(mergeDocs(remote, local).merged.settings.daily_capacity).toBe(12);
    expect(mergeDocs(remote, local).pushSettings).toBe(false);
  });

  test('a first sync from an empty phone adopts everything on the server', () => {
    const remote = { ...emptyDoc(), skills: [skill({ id: 'a' })], topics: [topic({ id: 't' })] };
    const { merged, push } = mergeDocs(emptyDoc(), remote);
    expect(merged.skills).toHaveLength(1);
    expect(merged.topics).toHaveLength(1);
    expect(push.skills).toEqual([]);
    expect(push.topics).toEqual([]);
  });

  test('rowsToPush resolves back to the merged copies', () => {
    const mine = topic({ id: 't', interval_days: 22, updated_at: late });
    const theirs = topic({ id: 't', interval_days: 5, updated_at: early });
    const { merged, push } = mergeDocs({ ...emptyDoc(), topics: [mine] }, { ...emptyDoc(), topics: [theirs] });
    expect(rowsToPush(merged, push, 'topics')).toEqual([mine]);
  });
});

describe('isNewer', () => {
  it('treats the two spellings of one instant as equal', () => {
    // Both came off the device in this project's own database.
    const pg = '2026-08-13T00:18:28.27632+00:00';
    const device = '2026-08-13T00:18:28.276Z';
    expect(isNewer(pg, device)).toBe(false);
    expect(isNewer(device, pg)).toBe(false);
  });

  it('compares the moment, not the spelling', () => {
    expect(isNewer('2026-08-13T00:18:29.000Z', '2026-08-13T00:18:28.9+00:00')).toBe(true);
    expect(isNewer('2026-08-13T00:18:28.9+00:00', '2026-08-13T00:18:29.000Z')).toBe(false);
  });

  it('is right about an offset that is not UTC, where sorting the text is not', () => {
    // 09:00+02:00 is 07:00Z — earlier than 08:00Z, though the text sorts later.
    const offset = '2026-08-13T09:00:00+02:00';
    const utc = '2026-08-13T08:00:00.000Z';
    expect(isNewer(offset, utc)).toBe(false);
    expect(offset > utc).toBe(true); // what the old string comparison did
  });

  it('falls back to text rather than throwing on something unparseable', () => {
    expect(isNewer('not-a-date', 'also-not')).toBe(true);
  });
});
