import { SyncInterrupted, SyncReport, SyncRunner } from '../engine';

const ok: SyncReport = { pulled: 0, pushed: 0, rejected: 0 };

function harness(cycle: () => Promise<SyncReport>) {
  const events: string[] = [];
  const runner = new SyncRunner(cycle, {
    onStart: () => events.push('start'),
    onSuccess: () => events.push('ok'),
    onError: (_e, retry) => events.push(`error, retry in ${retry}`),
  }, [1000, 5000]);
  return { runner, events };
}

/** Lets the cycle's promise settle between timer steps. */
const settle = () => new Promise<void>((r) => jest.requireActual<typeof globalThis>('timers').setImmediate(r));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('requests made close together become one sync', async () => {
  const cycle = jest.fn(async () => ok);
  const { runner } = harness(cycle);
  runner.request(4000);
  jest.advanceTimersByTime(1000);
  runner.request(4000);
  runner.request(4000);
  jest.advanceTimersByTime(3000);
  await settle();
  expect(cycle).toHaveBeenCalledTimes(1);
});

test('a steady stream of edits still syncs, rather than waiting for a pause', async () => {
  const cycle = jest.fn(async () => ok);
  const { runner } = harness(cycle);
  for (let i = 0; i < 10; i++) {
    runner.request(4000);
    jest.advanceTimersByTime(1000);
    await settle();
  }
  expect(cycle.mock.calls.length).toBeGreaterThanOrEqual(2);
});

test('a sooner request overtakes a later one', async () => {
  const cycle = jest.fn(async () => ok);
  const { runner } = harness(cycle);
  runner.request(60_000);
  runner.request(0);
  jest.advanceTimersByTime(0);
  await settle();
  expect(cycle).toHaveBeenCalledTimes(1);
});

test('a request made during a sync runs straight after it, not never', async () => {
  let finish!: () => void;
  const cycle = jest
    .fn<Promise<SyncReport>, []>()
    .mockImplementationOnce(() => new Promise((r) => (finish = () => r(ok))))
    .mockImplementation(async () => ok);
  const { runner } = harness(cycle);

  runner.request(0);
  jest.advanceTimersByTime(0);
  runner.request(4000); // arrives mid-sync
  finish();
  await settle();
  jest.advanceTimersByTime(0);
  await settle();
  expect(cycle).toHaveBeenCalledTimes(2);
});

test('failures retry on their own, further apart each time, and reset on success', async () => {
  const cycle = jest
    .fn<Promise<SyncReport>, []>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(ok);
  const { runner, events } = harness(cycle);

  runner.request(0);
  jest.advanceTimersByTime(0);
  await settle();
  jest.advanceTimersByTime(1000);
  await settle();
  jest.advanceTimersByTime(5000);
  await settle();
  jest.advanceTimersByTime(5000); // the backoff tops out at its last step
  await settle();

  expect(events).toEqual([
    'start', 'error, retry in 1000',
    'start', 'error, retry in 5000',
    'start', 'error, retry in 5000',
    'start', 'ok',
  ]);
});

test('an edit during a failing sync does not skip the backoff', async () => {
  let fail!: () => void;
  const cycle = jest
    .fn<Promise<SyncReport>, []>()
    .mockImplementationOnce(() => new Promise((_, reject) => (fail = () => reject(new Error('offline')))))
    .mockResolvedValue(ok);
  const { runner } = harness(cycle);

  runner.request(0);
  jest.advanceTimersByTime(0);
  runner.request(0);
  fail();
  await settle();
  jest.advanceTimersByTime(999);
  await settle();
  expect(cycle).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(1);
  await settle();
  expect(cycle).toHaveBeenCalledTimes(2);
});

test('nothing runs after stop', async () => {
  const cycle = jest.fn(async () => ok);
  const { runner } = harness(cycle);
  runner.request(1000);
  runner.stop();
  runner.request(0);
  jest.advanceTimersByTime(5000);
  await settle();
  expect(cycle).not.toHaveBeenCalled();
});

test('a sync cut short by an erase starts again at once, and is not reported as a failure', async () => {
  const cycle = jest
    .fn<Promise<SyncReport>, []>()
    .mockRejectedValueOnce(new SyncInterrupted())
    .mockResolvedValue(ok);
  const { runner, events } = harness(cycle);
  runner.request(0);
  jest.advanceTimersByTime(0);
  await settle();
  jest.advanceTimersByTime(0);
  await settle();
  expect(events).toEqual(['start', 'start', 'ok']);
});
