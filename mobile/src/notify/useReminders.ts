import { useEffect } from 'react';
import { useStore } from '../store/store';
import { applyReminders } from './schedule';
import { loadPrefs } from './schedule';

/**
 * Keeps what is scheduled in step with what is due.
 *
 * Reminders are laid down a week at a time from the current schedule, so every
 * rating potentially invalidates them: clear the last thing due and tomorrow's
 * "3 things to go over" is a lie the phone will still tell. Rebuilding on
 * every change is what stops that.
 *
 * Debounced, because rating four things in a row is one change as far as
 * tomorrow morning is concerned — and the delay costs nothing when the soonest
 * reminder is hours away.
 */
export function useReminders() {
  const store = useStore();
  const { ready, revision, day, doc } = store;

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    const id = setTimeout(async () => {
      const prefs = await loadPrefs();
      if (!alive || !prefs.enabled) return;
      await applyReminders(doc, prefs, day);
    }, 3000);

    return () => {
      alive = false;
      clearTimeout(id);
    };
    // `revision` covers every local edit; `day` covers waking up tomorrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, revision, day]);
}
