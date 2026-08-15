import { AuthStep, popRoute, pushRoute, Route, showsTabs } from '../router';

const today: Route = { name: 'today' };
const settings: Route = { name: 'settings' };
const account = (step: AuthStep): Route => ({ name: 'account', from: 'settings', step });

describe('the navigation stack', () => {
  test('tabs replace each other instead of building a history', () => {
    let stack: Route[] = [today];
    stack = pushRoute(stack, { name: 'upcoming' });
    stack = pushRoute(stack, { name: 'skills' });
    expect(stack).toEqual([{ name: 'skills' }]);
  });

  test('a screen pushes on top of a tab', () => {
    const stack = pushRoute([today], settings);
    expect(stack.map((r) => r.name)).toEqual(['today', 'settings']);
  });

  test('leaving the account screen unwinds to Settings rather than stacking a second one', () => {
    // Today → Settings → Manage → leave.
    let stack: Route[] = pushRoute([today], settings);
    stack = pushRoute(stack, account('done'));
    stack = pushRoute(stack, settings);

    expect(stack.map((r) => r.name)).toEqual(['today', 'settings']);

    // …and backing out of Settings reaches Today, not the account screen again.
    expect(popRoute(stack).map((r) => r.name)).toEqual(['today']);
  });

  test('steps of the account flow are distinct entries', () => {
    let stack: Route[] = pushRoute([today], settings);
    stack = pushRoute(stack, account('welcome'));
    stack = pushRoute(stack, account('create'));
    expect(stack).toHaveLength(4);

    // Going back to an earlier step unwinds to it.
    stack = pushRoute(stack, account('welcome'));
    expect(stack).toHaveLength(3);
    expect(stack[stack.length - 1]).toEqual(account('welcome'));
  });

  test('onboarding steps move forward by pushing and back by unwinding', () => {
    let stack: Route[] = [{ name: 'onboarding', step: 1 }];
    for (const step of [2, 3, 4]) stack = pushRoute(stack, { name: 'onboarding', step });
    expect(stack).toHaveLength(4);

    stack = pushRoute(stack, { name: 'onboarding', step: 2 });
    expect(stack.map((r) => (r.name === 'onboarding' ? r.step : r.name))).toEqual([1, 2]);
  });

  test('back never empties the stack', () => {
    expect(popRoute([today])).toEqual([today]);
  });

  test('the floating bar shows on tabs and nowhere else', () => {
    expect(showsTabs(today)).toBe(true);
    expect(showsTabs({ name: 'upcoming' })).toBe(true);
    expect(showsTabs(settings)).toBe(false);
    expect(showsTabs({ name: 'log' })).toBe(false);
    expect(showsTabs({ name: 'onboarding', step: 1 })).toBe(false);
    expect(showsTabs(account('welcome'))).toBe(false);
  });
});
