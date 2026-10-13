import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Day, parseDay, today } from '../engine/dates';
import { Genre, PhysicalKind } from '../engine/genres';
import { buildPlan, Plan, redistribute } from '../engine/plan';
import { applyLog, applyRating, newTopicDefaults } from '../engine/schedule';
import { Doc, emptyDoc, LogEntry, Pair, Rating, Review, Settings, Skill, Topic } from '../engine/types';
import { jsonPersistence } from './json';
import { parseDocument, serialiseForExport } from './format';
import type { LocalPatch } from '../sync/protocol';
import { CollectionName, Collections, Persistence } from './persistence';
import { keptSubSkill, nextHue } from './rules';
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
  /** For a card. Optional on every genre. */
  cue?: string | null;
  answer?: string | null;
  /** Required for a new memorization fact — see `needsEncoding`. */
  encoding?: string | null;
};

/** What a rating did, for the screen to respond to. */
export type RateResult = { weakened: boolean; plateau: boolean; interval: number } | null;

/** The parts of a skill that can be changed after it is made. */
export type SkillEdit = Partial<Pick<Skill, 'name' | 'level' | 'target_date' | 'calibration' | 'genre' | 'physical_kind'>>;

/** The parts of a topic that can be edited by hand. */
export type TopicEdit = Partial<Pick<Topic, 'title' | 'sub_skill' | 'cue' | 'answer' | 'encoding'>>;

export type Store = {
  ready: boolean;
  /** Set when the local store could not be read. The app runs, but empty. */
  loadError: string | null;
  /**
   * The saved document could not be read at all, as opposed to being read
   * from the fallback store. Sync stays off: an empty screen is not a
   * statement that everything was deleted, and must not be uploaded as one.
   */
  loadFailed: boolean;
  /** The collection whose last save failed, if one did. Work is unsaved. */
  saveError: string | null;
  doc: Doc;
  day: Day;
  plan: Plan;
  undoable: UndoEntry | null;

  createSkill: (input: {
    name: string;
    genre: Genre;
    physical_kind: PhysicalKind | null;
    level?: string | null;
    target_date?: Day | null;
    calibration?: number;
  }) => Skill;
  renameSkill: (id: string, name: string) => void;
  setSkillGenre: (id: string, genre: Genre, kind: PhysicalKind | null) => void;
  /** Setting a new target date starts a new season, and so clears any pause. */
  updateSkill: (id: string, edit: SkillEdit) => void;
  pauseSkill: (id: string) => void;
  resumeSkill: (id: string) => void;
  archiveSkill: (id: string) => void;
  restoreSkill: (id: string) => void;
  /** What a delete would take with it, for the confirmation to state. */
  skillFootprint: (id: string) => { topics: number; ratings: number; logs: number };
  /** Permanent, and cascades. Archiving is still the reversible option. */
  deleteSkill: (id: string) => Promise<void>;

  logStudy: (input: LogInput) => Topic;
  /** A pasted syllabus: one new topic per title, already-tracked titles skipped. Returns how many were added. */
  logMany: (skillId: string, titles: string[], studiedOn: Day) => number;
  editTopic: (id: string, title: string) => void;
  updateTopic: (id: string, edit: TopicEdit) => void;
  archiveTopic: (id: string) => void;
  restoreTopic: (id: string) => void;

  /** `on` defaults to today; a past day is recorded against that day. */
  rate: (topicId: string, rating: Rating, on?: Day) => RateResult;
  undo: () => void;
  dismissUndo: () => void;
  redistributeToday: () => number;

  updateSettings: (patch: Partial<Settings>) => void;
  exportJson: () => string;
  importJson: (raw: string) => Promise<void>;
  eraseEverything: () => Promise<void>;
  /** Replaces everything. */
  replaceDoc: (doc: Doc) => Promise<void>;

  /** The document as it is this instant, not as of the last render. */
  current: () => Doc;
  /**
   * Applies what sync brought back. `change` runs against the document as it
   * is when called — never an older copy — so nothing done on screen while a
   * sync was in flight is overwritten. Does not count as a local edit.
   * Resolves once saved, and rejects if the save failed.
   */
  applyRemote: (change: (live: Doc) => { doc: Doc; patch: LocalPatch } | null) => Promise<void>;
  readMeta: (key: string) => Promise<string | null>;
  writeMeta: (key: string, value: string) => Promise<void>;
  /** Bumps when everything here is erased, so a sync in flight knows to stop. */
  generation: () => number;
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
  const [loadFailed, setLoadFailed] = useState(false);
  const store = useRef<Persistence | null>(null);
  const live = useRef<Doc>(doc);
  const erasures = useRef(0);

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
        setLoadFailed(true);
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
    ({ name, genre, physical_kind, level, target_date, calibration }) => {
      const at = nowIso();
      const skill: Skill = {
        id: uid(),
        name: name.trim(),
        genre,
        physical_kind,
        hue_index: nextHue(live.current.skills),
        level: level?.trim() || null,
        target_date: target_date ?? null,
        calibration: calibration ?? 1,
        paused_at: null,
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
    ({ skillId, topicId, title, subSkill, feltShaky, studiedOn, confusableWith, cue, answer, encoding }) => {
      const at = nowIso();
      const skill = live.current.skills.find((s) => s.id === skillId)!;
      const existing = topicId ? live.current.topics.find((t) => t.id === topicId) : undefined;

      let topic: Topic;
      if (existing) {
        const { interval_days, due_on } = applyLog(existing, skill.genre, studiedOn, feltShaky, skill.calibration);
        topic = {
          ...existing,
          interval_days,
          due_on,
          sub_skill: keptSubSkill(subSkill, existing.sub_skill),
          cue: keptSubSkill(cue, existing.cue),
          answer: keptSubSkill(answer, existing.answer),
          encoding: keptSubSkill(encoding, existing.encoding),
          updated_at: at,
        };
      } else {
        topic = {
          id: uid(),
          skill_id: skillId,
          title: title.trim(),
          sub_skill: subSkill?.trim() || null,
          cue: cue?.trim() || null,
          answer: answer?.trim() || null,
          encoding: encoding?.trim() || null,
          last_reviewed_at: null,
          archived_at: null,
          created_at: at,
          updated_at: at,
          ...newTopicDefaults(skill.genre, feltShaky, studiedOn, skill.calibration),
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

  const logMany: Store['logMany'] = useCallback(
    (skillId, titles, studiedOn) => {
      const skill = live.current.skills.find((s) => s.id === skillId);
      if (!skill) return 0;
      const at = nowIso();
      const known = new Set(
        live.current.topics.filter((t) => t.skill_id === skillId && !t.archived_at).map((t) => t.title.trim().toLowerCase()),
      );
      const topics: Topic[] = [];
      const entries: LogEntry[] = [];
      for (const raw of titles) {
        const title = raw.trim();
        if (!title || known.has(title.toLowerCase())) continue;
        known.add(title.toLowerCase());
        const topic: Topic = {
          id: uid(),
          skill_id: skillId,
          title,
          sub_skill: null,
          cue: null,
          answer: null,
          encoding: null,
          last_reviewed_at: null,
          archived_at: null,
          created_at: at,
          updated_at: at,
          ...newTopicDefaults(skill.genre, false, studiedOn, skill.calibration),
        };
        topics.push(topic);
        entries.push({
          id: uid(),
          skill_id: skillId,
          topic_id: topic.id,
          sub_skill: null,
          studied_on: studiedOn,
          flags: ['from a pasted list'],
          created_at: at,
          updated_at: at,
        });
      }
      if (!topics.length) return 0;
      commit({
        ...live.current,
        topics: [...live.current.topics, ...topics],
        log_entries: [...live.current.log_entries, ...entries],
      });
      persist('topics', topics);
      persist('log_entries', entries);
      return topics.length;
    },
    [commit, persist],
  );

  const rate: Store['rate'] = useCallback(
    (topicId, rating, on) => {
      const before = live.current.topics.find((t) => t.id === topicId);
      if (!before) return null;
      const skill = live.current.skills.find((s) => s.id === before.skill_id)!;
      const when = on ?? day;
      const outcome = applyRating(before, skill.genre, rating, when, skill.calibration);
      const at = nowIso();
      // A rating made for an earlier day is recorded on that day, at midday so
      // it lands on the same local date wherever it is read.
      const ratedAt = when === day ? at : parseDay(when).toISOString();

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
        last_reviewed_at: ratedAt,
        updated_at: at,
      };

      const review: Review = {
        id: uid(),
        topic_id: topicId,
        rating,
        felt_shaky: false,
        rated_at: ratedAt,
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
      return { weakened: outcome.weakened, plateau: outcome.plateau, interval: outcome.interval_days };
    },
    [commit, day, persist],
  );

  const undo: Store['undo'] = useCallback(() => {
    const last = undoable;
    if (!last) return;
    // Restamped: the topic goes back to how it was, but as a new edit. With
    // its old timestamp it would lose to the rated copy if that had already
    // synced, and the next sync would quietly put the rating back.
    const restored: Topic = { ...last.topic, updated_at: nowIso() };
    commit({
      ...live.current,
      topics: live.current.topics.map((t) => (t.id === last.topic.id ? restored : t)),
      reviews: live.current.reviews.filter((r) => r.id !== last.reviewId),
    });
    persist('topics', [restored]);
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
    async (next: Doc) => {
      commit(next);
      await store.current?.replace(next);
    },
    [commit],
  );

  const applyRemote = useCallback(
    async (change: (live: Doc) => { doc: Doc; patch: LocalPatch } | null) => {
      const p = store.current;
      if (!p) throw new Error('There is nowhere on this device to save what sync downloaded.');
      const result = change(live.current);
      if (!result) return;
      commit(result.doc, { fromSync: true });

      const { upserts, removes, settings } = result.patch;
      const writes: Promise<void>[] = [];
      for (const [table, rows] of Object.entries(upserts) as [CollectionName, Collections[CollectionName]][]) {
        if (rows.length) writes.push(p.upsert(table, rows));
      }
      for (const [table, ids] of Object.entries(removes) as [CollectionName, string[]][]) {
        if (ids.length) writes.push(p.remove(table, ids));
      }
      if (settings) writes.push(p.saveSettings(settings));
      await Promise.all(writes);
    },
    [commit],
  );

  const value = useMemo<Store>(() => {
    const plan = buildPlan(doc, day);
    return {
      ready,
      loadError,
      loadFailed,
      saveError,
      revision,
      doc,
      day,
      plan,
      undoable,
      createSkill,
      renameSkill: (id, name) => patchSkill(id, { name: name.trim() }),
      setSkillGenre: (id, genre, kind) => patchSkill(id, { genre, physical_kind: kind }),
      updateSkill: (id, edit) => {
        const patch: Partial<Skill> = { ...edit };
        if (edit.name !== undefined) patch.name = edit.name.trim() || live.current.skills.find((s) => s.id === id)?.name;
        if (edit.level !== undefined) patch.level = edit.level?.trim() || null;
        if (edit.genre && edit.genre !== 'physical') patch.physical_kind = null;
        if (edit.genre === 'physical' && edit.physical_kind === undefined) patch.physical_kind = 'closed';
        if (edit.target_date) patch.paused_at = null;
        patchSkill(id, patch);
      },
      pauseSkill: (id) => patchSkill(id, { paused_at: nowIso() }),
      resumeSkill: (id) => patchSkill(id, { paused_at: null }),
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
       * can see. Sync sends each removed row up as a deletion, and sweeps the
       * same orphans on other devices (`sweepOrphans`), so every copy agrees
       * about what deleting a skill means.
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
      updateTopic: (id, edit) => {
        const clean: Partial<Topic> = {};
        for (const [k, v] of Object.entries(edit) as [keyof TopicEdit, string | null | undefined][]) {
          if (v === undefined) continue;
          if (k === 'title') {
            if (v?.trim()) clean.title = v.trim();
          } else {
            clean[k] = v?.trim() || null;
          }
        }
        patchTopic(id, clean);
      },
      logMany,
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
      // Every imported row is stamped as a new edit. Import replaces what is
      // here, and it has to replace what is synced too: with the timestamps
      // the file was exported with, any row edited since would lose to the
      // newer copy on the server, and the import would partly undo itself on
      // the next sync.
      importJson: async (raw: string) => {
        await replaceDoc(restamp(parseDocument(raw).doc, nowIso()));
      },
      eraseEverything: async () => {
        // First, before anything is cleared: a sync already running must see
        // this before it next looks at the (now empty) document.
        erasures.current++;
        commit(emptyDoc());
        await store.current?.reset();
        setUndoable(null);
      },
      replaceDoc,
      current: () => live.current,
      applyRemote,
      generation: () => erasures.current,
      readMeta: async (key) => (store.current ? store.current.readMeta(key) : null),
      writeMeta: async (key, value) => {
        if (!store.current) throw new Error('There is nowhere on this device to save sync progress.');
        await store.current.writeMeta(key, value);
      },
    };
  }, [
    applyRemote, createSkill, day, doc, loadError, loadFailed, logMany, logStudy, patchSkill, patchTopic, rate, ready,
    redistributeToday, replaceDoc, revision, saveError, undo, undoable, updateSettings, commit,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Every row and the settings, stamped `at`. */
export function restamp(doc: Doc, at: string): Doc {
  const stamp = <T extends { updated_at: string }>(rows: T[]) => rows.map((r) => ({ ...r, updated_at: at }));
  return {
    skills: stamp(doc.skills),
    topics: stamp(doc.topics),
    reviews: stamp(doc.reviews),
    log_entries: stamp(doc.log_entries),
    pairs: stamp(doc.pairs),
    settings: { ...doc.settings, updated_at: at },
  };
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
