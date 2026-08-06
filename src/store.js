// Persistence. State survives between sessions; the engine never recomputes
// schedules from scratch, it loads the saved review history and ease factors.

import { emptyStore, STORE_VERSION } from './engine/model.js';

const KEY = 'practice-coach:v1';

export function memoryAdapter(initial = null) {
  let data = initial;
  return {
    read: () => data,
    write: (value) => {
      data = value;
    },
  };
}

/**
 * @param {object} [options]
 * @param {(err: Error) => void} [options.onWriteError] - called when a write
 *   fails. Every review the user records lives here, so a failure that is only
 *   logged to the console is indistinguishable from success and silently
 *   destroys their history.
 */
export function localStorageAdapter(storage = globalThis.localStorage, options = {}) {
  const { onWriteError = null } = options;
  return {
    read() {
      try {
        const raw = storage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.error('Could not read saved state:', err);
        return null;
      }
    },
    write(value) {
      const payload = JSON.stringify(value);
      try {
        storage.setItem(KEY, payload);
      } catch (err) {
        console.error('Could not save state:', err);
        onWriteError?.(err);
        return false;
      }
      // Storage can accept a write and still not persist it (private modes,
      // eviction). Read it back rather than trusting setItem returning.
      if (storage.getItem(KEY) !== payload) {
        const err = new Error('Storage accepted the write but did not keep it.');
        console.error(err);
        onWriteError?.(err);
        return false;
      }
      return true;
    },
  };
}

/** Fill in anything a newer version added to an older saved store. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return emptyStore();
  const base = emptyStore();
  const store = {
    ...base,
    ...raw,
    version: STORE_VERSION,
    // An existing store predates onboarding, so its owner has already seen the app.
    settings: {
      ...base.settings,
      onboarded: Array.isArray(raw.skills) && raw.skills.length > 0,
      ...(raw.settings || {}),
      // Load used to be measured in minutes. How long practice takes is the
      // user's call, so the cap now counts things due; convert old settings at
      // roughly one item per eight minutes rather than dropping the preference.
      dailyCapacityItems: raw.settings?.dailyCapacityItems
        ?? (raw.settings?.dailyCapacityMinutes
          ? Math.max(2, Math.round(raw.settings.dailyCapacityMinutes / 8))
          : base.settings.dailyCapacityItems),
    },
    skills: raw.skills || [],
    items: raw.items || [],
    reviews: raw.reviews || [],
    confusables: raw.confusables || [],
  };
  // Defensive: items written by an earlier build may lack newer fields.
  store.items = store.items.map((item) => ({
    difficultyPenalty: 1,
    streakOK: 0,
    streakBad: 0,
    cleanStreak: 0,
    weakFlag: false,
    priorityWeak: false,
    plateauFlag: false,
    formatIndex: 0,
    blockedSessions: 0,
    archived: false,
    history: [],
    ...item,
  }));
  return store;
}

export function createStore(adapter) {
  let state = migrate(adapter.read());
  let saveFailed = false;
  const listeners = new Set();

  function persist() {
    // `write` returns false only for adapters that report failure; treat a
    // missing return as success so simple adapters stay simple.
    saveFailed = adapter.write(state) === false;
    return !saveFailed;
  }

  return {
    get state() {
      return state;
    },
    /** True when the last write did not reach storage. */
    get saveFailed() {
      return saveFailed;
    },
    /** Run a mutation against the store, then persist + notify. */
    update(mutator) {
      const result = mutator(state);
      persist();
      listeners.forEach((fn) => fn(state));
      return result;
    },
    replace(next) {
      state = migrate(next);
      persist();
      listeners.forEach((fn) => fn(state));
    },
    reset() {
      this.replace(emptyStore());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    export() {
      return JSON.stringify(state, null, 2);
    },
  };
}
