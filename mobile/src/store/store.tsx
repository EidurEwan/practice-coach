import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Day, today } from '../engine/dates';
import { Genre, PhysicalKind } from '../engine/genres';
import { buildPlan, Plan, redistribute } from '../engine/plan';
import { applyLog, applyRating, newTopicDefaults } from '../engine/schedule';
import { Doc, emptyDoc, LogEntry, Pair, Rating, Review, Settings, Skill, Topic } from '../engine/types';
import { jsonPersistence } from './json';
import { parseDocument, serialiseForExport } from './format';
import { CollectionName, Collections, Persistence } from './persistence';
import { nowIso, uid } from './uid';

export type UndoEntry = {
  topic: Topic;
  reviewId: string;
  title: string;
  rating: Rating;
  nextInterval: number;
};

export type LogInput = {
  skillId: string;
  /** Set when logging against something already tracked. */
  topicId?: string | null;
  title: string;
  subSkill?: string | null;
  feltShaky: boolean;
  studiedOn: Day;
  confusableWith?: string[];
};

export type Store = {
  ready: boolean;
  /** Set when the local store could not be read. The app runs, but empty. */
  loadError: string | null;
  /** The collection whose last save failed, if one did. Work is unsaved. */
  saveError: string | null;
  doc: Doc;
  day: Day;
  plan: Plan;
  undoable: UndoEntry | null;

  createSkill: (input: { name: string; genre: Genre; physical_kind: PhysicalKind | null }) => Skill;
  renameSkill: (id: string, name: string) => void;
  setSkillGenre: (id: string, genre: Genre, kind: PhysicalKind | null) => void;
  archiveSkill: (id: string) => void;
  restoreSkill: (id: string) => void;
  /** What a delete would take with it, for the confirmation to state. */
  skillFootprint: (id: string) => { topics: number; ratings: number; logs: number };
  /** Permanent, and cascades. Archiving is still the reversible option. */
  deleteSkill: (id: string) => Promise<void>;

  logStudy: (input: LogInput) => Topic;
  editTopic: (id: string, title: string) => void;
  archiveTopic: (id: string) => void;
  restoreTopic: (id: string) => void;

  rate: (topicId: string, rating: Rating) => void;
  undo: () => void;
  dismissUndo: () => void;
  redistributeToday: () => number;

  updateSettings: (patch: Partial<Settings>) => void;
  exportJson: () => string;
  importJson: (raw: string) => Promise<void>;
  eraseEverything: () => Promise<void>;
  /** Replaces everything. `fromSync` writes land without marking work to push. */
  replaceDoc: (doc: Doc, opts?: { fromSync?: boolean }) => Promise<void>;
  /**
   * Bumps on every local edit and never on a write that came from sync, so a
   * sync can be scheduled after changes without the write retriggering it.
   */
  revision: number;
};

const StoreContext = createContext<Store | null>(null);

/**
 * Opening the store must always yield somewhere to write.
 *
 * If it does not, every save becomes a no-op while the in-memory document
 * carries on accepting edits — so the app looks like it is working and loses
 * everything the moment it restarts. Falling back to the JSON store keeps the
 * work on the device even when SQLite cannot be opened at all.
 */
async function openPersistence(): Promise<{ store: Persistence; degraded: boolean }> {
  // expo-sqlite needs a wasm build and cross-origin isolation on the web; the
  // JSON store keeps the browser preview working without either.
  if (Platform.OS !== 'web') {
    try {
      const { sqlitePersistence } = await import('./sqlite');
      return { store: await sqlitePersistence(), degraded: false };
    } catch (e) {
      console.warn('SQLite unavailable, falling back to the document store', e);
      return { store: jsonPersistence(), degraded: true };
    }
  }
  return { store: jsonPersistence(), degraded: false };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [doc, setDoc] = useState<Doc>(emptyDoc);
  const [ready, setReady] = useState(false);
  const [day, setDay] = useState<Day>(() => today());
  const [undoable, setUndoable] = useState<UndoEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const store = useRef<Persistence | null>(null);
  const live = useRef<Doc>(doc);

  const [revision, setRevision] = useState(0);

  const commit = useCallback((next: Doc, opts?: { fromSync?: boolean }) => {
    live.current = next;
    setDoc(next);
    if (!opts?.fromSync) setRevision((r) => r + 1);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let opened: Persistence | null = null;
      try {
        const { store: p, degraded } = await openPersistence();
        opened = p;
        const loaded = await p.load();
        if (!alive) return;
        store.current = p;
        live.current = loaded;
        setDoc(loaded);
        if (degraded) setLoadError('Interval could not open its usual database, so it is using a simpler one. Your work is still saved on this device.');
      } catch (e) {
        // A database that will not open or read must not strand the app on a
        // blank screen. Come up empty, say so, and keep the broken file for
        // recovery rather than writing over it.
        //
        // It must not leave the app writable with nowhere to write, either:
        // without a store attached every save silently does nothing, the
        // screen keeps showing the work, and it is gone on the next launch.
        if (!alive) return;
        console.warn('could not read the local store', e);
        store.current = opened ?? jsonPersistence();
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The plan is rebuilt every morning. Coming back to the app after midnight
  // must not leave yesterday's set on screen.
  useEffect(() => {
    const tick = () => setDay(today());
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    const timer = setInterval(tick, 60_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  /**
   * A failed save has to reach the screen.
   *
   * The document in memory has already been updated by the time this runs, so
   * a write that quietly fails leaves the work visible and unsaved — and the
   * only sign of it was a console warning nobody reads. Worse, `store.current?.`
   * on a missing store returned undefined, so there was no promise to reject
   * and not even a warning. Both now say so.
   */
  const saved = useCallback((what: string, work: Promise<unknown> | undefined) => {
    if (!work) {
      console.warn(`no store attached — ${what} was not saved`);
      setSaveError(what);
      return;
    }
    work.then(
      () => setSaveError((prev) => (prev === what ? null : prev)),
      (e) => {
        console.warn(`could not save ${what}`, e);
        setSaveError(what);
      },
    );
  }, []);

  const persist = useCallback(
    <K extends CollectionName>(table: K, rows: Collections[K]) => {
      saved(table, store.current?.upsert(table, rows));
    },
    [saved],
  );

  const persistSettings = useCallback(
    (settings: Settings) => {
      saved('settings', store.current?.saveSettings(settings));
    },
    [saved],
  );

  const patchTopic = useCallback(
    (id: string, patch: Partial<Topic>): Topic | null => {
      const current = live.current.topics.find((t) => t.id === id);
      if (!current) return null;
      const next: Topic = { ...current, ...patch, updated_at: nowIso() };
      commit({ ...live.current, topics: live.current.topics.map((t) => (t.id === id ? next : t)) });
      persist('topics', [next]);
      return next;
    },
    [commit, persist],
  );

  const patchSkill = useCallback(
    (id: string, patch: Partial<Skill>) => {
      const current = live.current.skills.find((s) => s.id === id);
      if (!current) return;
      const next: Skill = { ...current, ...patch, updated_at: nowIso() };
      commit({ ...live.current, skills: live.current.skills.map((s) => (s.id === id ? next : s)) });
      persist('skills', [next]);
    },
    [commit, persist],
  );

  const createSkill: Store['createSkill'] = useCallback(
    ({ name, genre, physical_kind }) => {
      const at = nowIso();
      const skill: Skill = {
        id: uid(),
        name: name.trim(),
        genre,
        physical_kind,
        hue_index: live.current.skills.length,
        archived_at: null,
        created_at: at,
        updated_at: at,
      };
      commit({ ...live.current, skills: [...live.current.skills, skill] });
      persist('skills', [skill]);
      return skill;
    },
    [commit, persist],
  );

  const logStudy: Store['logStudy'] = useCallback(
    ({ skillId, topicId, title, subSkill, feltShaky, studiedOn, confusableWith }) => {
      const at = nowIso();
      const skill = live.current.skills.find((s) => s.id === skillId)!;
      const existing = topicId ? live.current.topics.find((t) => t.id === topicId) : undefined;

      let topic: Topic;
      if (existing) {
        const { interval_days, due_on } = applyLog(existing, skill.genre, studiedOn, feltShaky);
        topic = { ...existing, interval_days, due_on, sub_skill: subSkill ?? existing.sub_skill, updated_at: at };
      } else {
        topic = {
          id: uid(),
          skill_id: skillId,
          title: title.trim(),
          sub_skill: subSkill?.trim() || null,
          last_reviewed_at: null,
          archived_at: null,
          created_at: at,
          updated_at: at,
          ...newTopicDefaults(skill.genre, feltShaky, studiedOn),
        };
      }

      const flags: string[] = [];
      if (feltShaky) flags.push('felt shaky');
      const pairs: Pair[] = (confusableWith ?? []).map((other) => ({
        id: uid(),
        topic_a: topic.id,
        topic_b: other,
        created_at: at,
        updated_at: at,
      }));
      for (const p of pairs) {
        const other = live.current.topics.find((t) => t.id === p.topic_b);
        if (other) flags.push(`held apart from ${other.title}`);
      }

      const entry: LogEntry = {
        id: uid(),
        skill_id: skillId,
        topic_id: topic.id,
        sub_skill: subSkill?.trim() || null,
        studied_on: studiedOn,
        flags,
        created_at: at,
        updated_at: at,
      };

      const topics = existing
        ? live.current.topics.map((t) => (t.id === topic.id ? topic : t))
        : [...live.current.topics, topic];

      commit({
        ...live.current,
        topics,
        log_entries: [...live.current.log_entries, entry],
        pairs: [...live.current.pairs, ...pairs],
      });
      persist('topics', [topic]);
      persist('log_entries', [entry]);
      if (pairs.length) persist('pairs', pairs);
      return topic;
    },
    [commit, persist],
  );

  const rate: Store['rate'] = useCallback(
    (topicId, rating) => {
      const before = live.current.topics.find((t) => t.id === topicId);
      if (!before) return;
      const skill = live.current.skills.find((s) => s.id === before.skill_id)!;
      const outcome = applyRating(before, skill.genre, rating, day);
      const at = nowIso();

      const after: Topic = {
        ...before,
        interval_days: outcome.interval_days,
        repetition: outcome.repetition,
        ease: outcome.ease,
        streak: outcome.streak,
        penalty: outcome.penalty,
        format_rung: outcome.format_rung,
        state: outcome.state,
        due_on: outcome.due_on,
        last_reviewed_at: at,
        updated_at: at,
      };

      const review: Review = {
        id: uid(),
        topic_id: topicId,
        rating,
        felt_shaky: false,
        rated_at: at,
        prev_interval: before.interval_days,
        next_interval: outcome.interval_days,
        updated_at: at,
      };

      commit({
        ...live.current,
        topics: live.current.topics.map((t) => (t.id === topicId ? after : t)),
        reviews: [...live.current.reviews, review],
      });
      persist('topics', [after]);
      persist('reviews', [review]);
      setUndoable({
        topic: before,
        reviewId: review.id,
        title: before.title,
        rating,
        nextInterval: rating === 'pushed' ? 1 : outcome.interval_days,
      });
    },
    [commit, day, persist],
  );

  const undo: Store['undo'] = useCallback(() => {
    const last = undoable;
    if (!last) return;
    commit({
      ...live.current,
      topics: live.current.topics.map((t) => (t.id === last.topic.id ? last.topic : t)),
      reviews: live.current.reviews.filter((r) => r.id !== last.reviewId),
    });
    persist('topics', [last.topic]);
    store.current?.remove('reviews', [last.reviewId]).catch(() => {});
    setUndoable(null);
  }, [commit, persist, undoable]);

  const redistributeToday: Store['redistributeToday'] = useCallback(() => {
    const moves = redistribute(live.current, day);
    if (!moves.length) return 0;
    const at = nowIso();
    const byId = new Map(moves.map((m) => [m.id, m.due_on]));
    const moved = live.current.topics.map((t) =>
      byId.has(t.id) ? { ...t, due_on: byId.get(t.id)!, updated_at: at } : t,
    );
    commit({ ...live.current, topics: moved });
    persist('topics', moved.filter((t) => byId.has(t.id)));
    return moves.length;
  }, [commit, day, persist]);

  const updateSettings: Store['updateSettings'] = useCallback(
    (patch) => {
      const settings: Settings = { ...live.current.settings, ...patch, updated_at: nowIso() };
      commit({ ...live.current, settings });
      persistSettings(settings);
    },
    [commit, persistSettings],
  );

  const replaceDoc = useCallback(
    async (next: Doc, opts?: { fromSync?: boolean }) => {
      commit(next, opts);
      await store.current?.replace(next);
    },
    [commit],
  );

  const value = useMemo<Store>(() => {
    const plan = buildPlan(doc, day);
    return {
      ready,
      loadError,
      saveError,
      revision,
      doc,
      day,
      plan,
      undoable,
      createSkill,
      renameSkill: (id, name) => patchSkill(id, { name: name.trim() }),
      setSkillGenre: (id, genre, kind) => patchSkill(id, { genre, physical_kind: kind }),
      archiveSkill: (id) => patchSkill(id, { archived_at: nowIso() }),
      restoreSkill: (id) => patchSkill(id, { archived_at: null }),

      skillFootprint: (id) => {
        const topicIds = new Set(live.current.topics.filter((x) => x.skill_id === id).map((x) => x.id));
        return {
          topics: topicIds.size,
          ratings: live.current.reviews.filter((r) => topicIds.has(r.topic_id)).length,
          logs: live.current.log_entries.filter((e) => e.skill_id === id).length,
        };
      },

      /**
       * Removes a skill and everything that only existed because of it.
       *
       * Leaving the topics behind would strand them: nothing lists a topic
       * whose skill is gone, so they would be invisible and undeletable, and
       * the reviews under them would keep counting toward a history nobody
       * can see. The cascade matches the server's `on delete cascade`, so a
       * device and its backup agree about what a deletion means.
       */
      deleteSkill: async (id) => {
        const doomedTopics = live.current.topics.filter((x) => x.skill_id === id).map((x) => x.id);
        const topicIds = new Set(doomedTopics);

        const next: Doc = {
          ...live.current,
          skills: live.current.skills.filter((s) => s.id !== id),
          topics: live.current.topics.filter((x) => x.skill_id !== id),
          reviews: live.current.reviews.filter((r) => !topicIds.has(r.topic_id)),
          log_entries: live.current.log_entries.filter((e) => e.skill_id !== id),
          pairs: live.current.pairs.filter((p) => !topicIds.has(p.topic_a) && !topicIds.has(p.topic_b)),
        };

        commit(next);
        setUndoable(null);
        await store.current?.replace(next);
      },
      logStudy,
      editTopic: (id, title) => patchTopic(id, { title: title.trim() }),
      archiveTopic: (id) => patchTopic(id, { archived_at: nowIso() }),
      restoreTopic: (id) => patchTopic(id, { archived_at: null }),
      rate,
      undo,
      dismissUndo: () => setUndoable(null),
      redistributeToday,
      updateSettings,
      // Exports carry the same envelope storage uses, and go back in through
      // the same parser — so a file written by an older build still imports,
      // and one written today will still import later.
      exportJson: () => serialiseForExport(live.current),
      importJson: async (raw: string) => {
        await replaceDoc(parseDocument(raw).doc);
      },
      eraseEverything: async () => {
        commit(emptyDoc());
        await store.current?.reset();
        setUndoable(null);
      },
      replaceDoc,
    };
  }, [
    createSkill, day, doc, loadError, logStudy, patchSkill, patchTopic, rate, ready,
    redistributeToday, replaceDoc, revision, saveError, undo, undoable, updateSettings, commit,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
