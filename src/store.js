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
    ...item,
  }));
  return normaliseReviews(store);
}

/**
 * Store v1 wrote every review twice — into `item.history` and into
 * `store.reviews`. About a third of the payload was the duplicate, and two
 * copies of one fact is a divergence waiting to happen the moment anything
 * syncs. `store.reviews` is now the only record.
 *
 * The two were appended in lockstep, so an old store's reviews are already
 * complete and history is simply dropped. Anything history holds *beyond* what
 * reviews has is recovered rather than thrown away — losing a review would
 * silently corrupt the schedule that depends on it.
 */
function normaliseReviews(store) {
  const counts = new Map();
  for (const r of store.reviews) counts.set(r.itemId, (counts.get(r.itemId) || 0) + 1);

  let recovered = 0;
  for (const item of store.items) {
    const history = Array.isArray(item.history) ? item.history : [];
    const known = counts.get(item.id) || 0;
    for (const entry of history.slice(known)) {
      store.reviews.push({
        id: `rv_recovered_${item.id}_${recovered += 1}`,
        itemId: item.id,
        skillId: item.skillId,
        ...entry,
      });
    }
    delete item.history;
  }

  // Recovered entries land at the end; the log is read oldest-first.
  if (recovered > 0) {
    store.reviews.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  return store;
}

export function createStore(adapter) {
  const raw = adapter.read();
  let state = migrate(raw);
  let saveFailed = false;
  const listeners = new Set();

  function persist() {
    // `write` returns false only for adapters that report failure; treat a
    // missing return as success so simple adapters stay simple.
    saveFailed = adapter.write(state) === false;
    return !saveFailed;
  }

  // Commit a migration straight away rather than waiting for the user to
  // happen to write something. A migration that deletes a field should not sit
  // half-applied — normalised in memory, still duplicated on disk — for however
  // long it takes them to record their next review.
  if (raw && raw.version !== STORE_VERSION) persist();

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
