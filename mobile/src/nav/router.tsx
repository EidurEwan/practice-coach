import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';

export type AuthStep = 'welcome' | 'create' | 'verify' | 'forgot' | 'done';

export type Route =
  | { name: 'today' }
  | { name: 'upcoming' }
  | { name: 'skills' }
  | { name: 'log' }
  | { name: 'settings' }
  // The address is carried on the route because moving between steps remounts
  // the screen, which would otherwise lose what was typed on the step before.
  | { name: 'account'; from: 'settings' | 'onboarding'; step: AuthStep; email?: string }
  | { name: 'onboarding'; step: number };

export type RouteName = Route['name'];

export const TABS: RouteName[] = ['today', 'upcoming', 'skills'];

/** The floating bar is hidden wherever the screen owns the whole viewport. */
export function showsTabs(route: Route): boolean {
  return TABS.includes(route.name);
}

/**
 * The whole navigation rule, kept pure so it can be tested without a renderer.
 *
 * Going to a screen that is already open unwinds to it rather than stacking a
 * second copy — otherwise leaving the account screen puts Settings on top of
 * it, and backing out of Settings lands back on the account screen. It also
 * makes an onboarding step's Back chevron pop instead of growing the stack.
 */
export function pushRoute(stack: Route[], next: Route): Route[] {
  // Tabs replace each other rather than piling up a history to unwind.
  if (TABS.includes(next.name)) return [next];

  const key = routeKey(next);
  const open = stack.findIndex((r) => routeKey(r) === key);
  if (open >= 0) return stack.slice(0, open + 1);

  return [...stack, next];
}

export function popRoute(stack: Route[]): Route[] {
  return stack.length > 1 ? stack.slice(0, -1) : stack;
}

type Nav = {
  route: Route;
  /** Changes whenever the screen changes, so scroll position resets with it. */
  key: string;
  go: (route: Route) => void;
  back: () => void;
  canGoBack: boolean;
};

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ initial, children }: { initial: Route; children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([initial]);
  const route = stack[stack.length - 1];

  const go = useCallback((next: Route) => {
    setStack((prev) => pushRoute(prev, next));
  }, []);

  const back = useCallback(() => {
    setStack(popRoute);
  }, []);

  // Android's back gesture is a navigation control, not a quit button. It only
  // falls through to the system — closing the app — from a root tab.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length <= 1) return false;
      back();
      return true;
    });
    return () => sub.remove();
  }, [back, stack.length]);

  const value = useMemo<Nav>(
    () => ({
      route,
      key: routeKey(route),
      go,
      back,
      canGoBack: stack.length > 1,
    }),
    [back, go, route, stack.length],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

function routeKey(route: Route): string {
  if (route.name === 'onboarding') return `onboarding-${route.step}`;
  if (route.name === 'account') return `account-${route.step}`;
  return route.name;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav must be used inside <NavProvider>');
  return n;
}
