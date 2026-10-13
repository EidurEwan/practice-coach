import { nowIso, observeTime } from '../uid';

const at = (iso: string) => jest.spyOn(Date, 'now').mockReturnValue(Date.parse(iso));

afterEach(() => jest.restoreAllMocks());

/**
 * Each test runs further into the future than the last, because the clock is
 * deliberately one-way: a test that stepped back in time would be measuring
 * the previous test's stamps, not its own.
 */
describe('stamps for local edits', () => {
  test('are wall-clock time in the ordinary case', () => {
    at('2030-01-01T12:00:00.000Z');
    expect(nowIso()).toBe('2030-01-01T12:00:00.000Z');
  });

  test('never repeat, even within one millisecond', () => {
    at('2030-02-01T12:00:00.000Z');
    const a = nowIso();
    const b = nowIso();
    expect(b > a).toBe(true);
  });

  test('land after an edit seen from a device whose clock is ahead', () => {
    // This phone runs five minutes slow. It downloads an edit stamped 12:00,
    // and the user changes the same thing at what this phone thinks is 11:56.
    at('2030-03-01T11:56:00.000Z');
    observeTime('2030-03-01T12:00:00.000Z');
    expect(nowIso() > '2030-03-01T12:00:00.000Z').toBe(true);
  });

  test('do not follow a clock that is wrong by more than a day', () => {
    at('2030-04-01T12:00:00.000Z');
    observeTime('2031-04-01T12:00:00.000Z');
    expect(nowIso()).toBe('2030-04-01T12:00:00.000Z');
  });

  test('ignore timestamps that do not parse', () => {
    at('2030-05-01T12:00:00.000Z');
    observeTime('garbage');
    observeTime(null);
    expect(nowIso()).toBe('2030-05-01T12:00:00.000Z');
  });
});
