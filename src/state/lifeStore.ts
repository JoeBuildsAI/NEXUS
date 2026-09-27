import { create } from "zustand";
import type { CalendarEvent, CompletedSet, Entity, Exercise, FitnessProgram, Food, GroceryItem, LifeCollection, LifeEntityMap, Meal, MealPlanEntry, NutritionTargets, PantryItem, Routine, RoutineCompletion, StepState, Task, WorkoutSession, WorkoutTemplate } from "@/core/life/models";
import { LIFE_COLLECTIONS, newId, stamp, touch } from "@/core/life/models";
import { normalizeEvent } from "@/core/life/calendar";
import { applicableSteps } from "@/core/life/routines";
import { previousSessionFor, startSession } from "@/core/life/fitness";
import { buildGroceryList, deriveRequirements, subtractPantry } from "@/core/life/grocery";
import { addDays, daysBetween, startOfWeek, todayKey, type DayKey } from "@/core/life/time";
import type { LifeDump, LifeRepository } from "@/core/life/repository";
import { sampleLifeData } from "@/core/life/sample";
import { getLifeRepository } from "@/providers/life";
import { createLogger } from "@/lib/logger";

// PRIVACY: PERSONAL data. This logger receives counts and statuses only — never titles or contents.
const log = createLogger("life");

export const DEFAULT_TARGETS: NutritionTargets = { calories: null, protein: null, carbs: null, fat: null, fiber: null };

type Collections = { [K in LifeCollection]: LifeEntityMap[K][] };

interface LifeState extends Collections {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  hasDemo: boolean;
  targets: NutritionTargets;
  /** Exact per-collection counts from storage (not just what is cached). */
  counts: Record<LifeCollection, number> | null;
  load: (opts?: { force?: boolean }) => Promise<void>;
  reload: () => Promise<void>;
  // generic
  upsert: <K extends LifeCollection>(c: K, rows: LifeEntityMap[K][]) => Promise<void>;
  patch: <K extends LifeCollection>(c: K, id: string, p: Partial<LifeEntityMap[K]>) => Promise<void>;
  remove: (c: LifeCollection, ids: string[]) => Promise<void>;
  // calendar
  createEvent: (draft: Omit<CalendarEvent, keyof Entity | "source" | "readOnly" | "timezone"> & Partial<Pick<CalendarEvent, "source" | "readOnly" | "timezone">>) => Promise<CalendarEvent>;
  updateEvent: (id: string, p: Partial<CalendarEvent>) => Promise<void>;
  moveEvent: (id: string, day: DayKey, startMinute: number) => Promise<void>;
  deleteEvent: (id: string, occurrenceDay?: DayKey) => Promise<void>;
  // tasks
  addTask: (draft: Partial<Task> & { title: string }) => Promise<Task>;
  toggleTask: (id: string, done?: boolean) => Promise<void>;
  // routines
  saveRoutine: (r: Routine | (Omit<Routine, keyof Entity> & { id?: string })) => Promise<Routine>;
  setStep: (routineId: string, day: DayKey, stepId: string, state: StepState | null) => Promise<void>;
  completeRoutine: (routineId: string, day: DayKey) => Promise<void>;
  resetRoutine: (routineId: string, day: DayKey) => Promise<void>;
  dismissRoutine: (routineId: string, day: DayKey, dismissed: boolean) => Promise<void>;
  // fitness
  startWorkout: (templateId: string | null, day?: DayKey, name?: string) => Promise<WorkoutSession>;
  updateSet: (sessionId: string, exerciseId: string, setId: string, p: Partial<CompletedSet>) => Promise<void>;
  addSet: (sessionId: string, exerciseId: string) => Promise<void>;
  removeSet: (sessionId: string, exerciseId: string, setId: string) => Promise<void>;
  skipExercise: (sessionId: string, exerciseId: string, skipped: boolean) => Promise<void>;
  finishWorkout: (sessionId: string, status?: "finished" | "abandoned") => Promise<void>;
  // nutrition
  setTargets: (t: NutritionTargets) => Promise<void>;
  planMeal: (day: DayKey, slot: MealPlanEntry["slot"], mealId: string, portion?: number) => Promise<MealPlanEntry>;
  logMeal: (entryId: string, status: MealPlanEntry["status"], replacement?: { mealId?: string; foodId?: string }) => Promise<void>;
  // groceries
  regenerateGroceries: (week: DayKey, opts?: { usePantry?: boolean }) => Promise<GroceryItem[]>;
  addGroceryItem: (week: DayKey | "manual", item: Pick<GroceryItem, "name" | "quantity" | "unit" | "category">) => Promise<void>;
  // demo / data
  addSampleData: () => Promise<void>;
  removeSampleData: () => Promise<void>;
  clearAllPersonalData: () => Promise<void>;
  importDump: (dump: LifeDump, mode: "replace" | "merge") => Promise<void>;
}

function empty(): Collections {
  const c = {} as Collections;
  for (const k of LIFE_COLLECTIONS) (c as unknown as Record<string, unknown[]>)[k] = [];
  return c;
}

/** Only a rolling window of dated history is cached; everything else is small. */
const HISTORY_DAYS_BACK = 400;
const HISTORY_DAYS_FORWARD = 400;

export const useLifeStore = create<LifeState>()((set, get) => {
  const repo = (): LifeRepository => getLifeRepository();
  const commit = async <K extends LifeCollection>(c: K, rows: LifeEntityMap[K][]) => {
    await repo().put(c, rows);
    set((s) => {
      const byId = new Map((s[c] as Entity[]).map((r) => [r.id, r]));
      for (const r of rows) byId.set(r.id, r);
      return { [c]: [...byId.values()].filter((r) => !r.deletedAt) } as Partial<LifeState>;
    });
    set({ hasDemo: get().hasDemo || rows.some((r) => r.demo) });
  };
  const find = <K extends LifeCollection>(c: K, id: string): LifeEntityMap[K] | undefined => (get()[c] as LifeEntityMap[K][]).find((r) => r.id === id);

  return {
    ...empty(),
    status: "idle",
    error: null,
    hasDemo: false,
    targets: DEFAULT_TARGETS,
    counts: null,

    load: async ({ force } = {}) => {
      if (get().status === "loading" || (get().status === "ready" && !force)) return;
      set({ status: "loading", error: null });
      try {
        const r = repo();
        await r.ready();
        const today = todayKey();
        const days = { from: addDays(today, -HISTORY_DAYS_BACK), to: addDays(today, HISTORY_DAYS_FORWARD) };
        const loaded = empty();
        for (const c of LIFE_COLLECTIONS) {
          const ranged = c === "events" || c === "routineCompletions" || c === "sessions" || c === "mealPlan" || c === "groceries";
          (loaded as unknown as Record<string, Entity[]>)[c] = await r.load(c, ranged ? { days } : undefined);
        }
        // Recurring events start outside the window but recur inside it: load them too.
        const allEvents = await r.load("events");
        loaded.events = allEvents.filter((e) => e.recurrence || (e.day >= days.from && e.day <= days.to) || (e.endDay >= days.from && e.day <= days.to));
        const targets = (await r.getKV<NutritionTargets>("nutrition.targets")) ?? DEFAULT_TARGETS;
        const counts = await r.counts();
        const hasDemo = LIFE_COLLECTIONS.some((c) => (loaded[c] as Entity[]).some((x) => x.demo));
        set({ ...loaded, targets, counts, hasDemo, status: "ready" });
        log.info("life data loaded", { total: Object.values(counts).reduce((a, b) => a + b, 0), storage: r.kind });
      } catch (e) {
        log.error("life load failed", { error: String((e as Error)?.message ?? e) });
        set({ status: "error", error: String((e as Error)?.message ?? e) });
      }
    },
    reload: () => get().load({ force: true }),

    upsert: (c, rows) => commit(c, rows),
    patch: async (c, id, p) => {
      const cur = find(c, id);
      if (!cur) return;
      await commit(c, [touch(cur, p as Partial<typeof cur>) as LifeEntityMap[typeof c]]);
    },
    remove: async (c, ids) => {
      await repo().remove(c, ids);
      set((s) => ({ [c]: (s[c] as Entity[]).filter((r) => !ids.includes(r.id)) } as Partial<LifeState>));
    },

    // ---------------------------------------------------------------- calendar
    createEvent: async (draft) => {
      const ev = stamp(normalizeEvent({ source: "local", readOnly: false, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...draft }) as Omit<CalendarEvent, keyof Entity>, Date.now(), "ev") as CalendarEvent;
      await commit("events", [ev]);
      return ev;
    },
    updateEvent: async (id, p) => {
      const cur = find("events", id);
      if (!cur || cur.readOnly) return;
      await commit("events", [touch(cur, normalizeEvent({ ...cur, ...p }))]);
    },
    moveEvent: async (id, day, startMinute) => {
      const cur = find("events", id);
      if (!cur || cur.readOnly) return;
      const dur = cur.allDay ? 0 : cur.endMinute - cur.startMinute + (cur.endDay > cur.day ? 1440 : 0);
      const spanDays = Math.max(0, daysBetween(cur.day, cur.endDay).length - 1);
      const endMinute = cur.allDay ? 0 : Math.min(1440, startMinute + Math.max(15, dur % 1440 || dur));
      await commit("events", [touch(cur, normalizeEvent({ ...cur, day, startMinute, endDay: addDays(day, spanDays), endMinute }))]);
    },
    deleteEvent: async (id, occurrenceDay) => {
      const cur = find("events", id);
      if (!cur) return;
      if (occurrenceDay && cur.recurrence) {
        await commit("events", [touch(cur, { recurrence: { ...cur.recurrence, exceptions: [...(cur.recurrence.exceptions ?? []), occurrenceDay] } })]);
        return;
      }
      await get().remove("events", [id]);
    },

    // ------------------------------------------------------------------- tasks
    addTask: async (draft) => {
      const t = stamp({ priority: "normal", status: "open", tags: [], today: false, someday: false, source: "local", ...draft } as Omit<Task, keyof Entity>, Date.now(), "t") as Task;
      await commit("tasks", [t]);
      return t;
    },
    toggleTask: async (id, done) => {
      const cur = find("tasks", id);
      if (!cur) return;
      const next = done ?? cur.status !== "done";
      const now = Date.now();
      if (next && cur.recurrence) {
        // Recurring task: log completion for today by rolling the due day forward.
        await commit("tasks", [touch(cur, { dueDay: addDays(todayKey(), 1), completedAt: now })]);
        return;
      }
      await commit("tasks", [touch(cur, { status: next ? "done" : "open", completedAt: next ? now : null })]);
    },

    // ---------------------------------------------------------------- routines
    saveRoutine: async (r) => {
      const existing = "createdAt" in r ? find("routines", r.id) : r.id ? find("routines", r.id) : undefined;
      const steps = r.steps.map((s, i) => ({ ...s, id: s.id || newId("st"), order: i }));
      const row = existing ? touch(existing, { ...r, steps } as Partial<Routine>) : (stamp({ ...r, steps } as Omit<Routine, keyof Entity>, Date.now(), "rt") as Routine);
      await commit("routines", [row]);
      return row;
    },
    setStep: async (routineId, day, stepId, state) => {
      const routine = find("routines", routineId);
      if (!routine) return;
      const cur = get().routineCompletions.find((c) => c.routineId === routineId && c.day === day);
      const steps = { ...(cur?.steps ?? {}) };
      if (state) steps[stepId] = state; else delete steps[stepId];
      const row = cur ? touch(cur, { steps, dismissed: false }) : (stamp({ routineId, day, steps, dismissed: false } as Omit<RoutineCompletion, keyof Entity>, Date.now(), "rc") as RoutineCompletion);
      await commit("routineCompletions", [row]);
    },
    completeRoutine: async (routineId, day) => {
      const routine = find("routines", routineId);
      if (!routine) return;
      const cur = get().routineCompletions.find((c) => c.routineId === routineId && c.day === day);
      const steps: Record<string, StepState> = { ...(cur?.steps ?? {}) };
      for (const s of applicableSteps(routine, day)) if (!steps[s.id]) steps[s.id] = "done";
      const row = cur ? touch(cur, { steps, dismissed: false }) : (stamp({ routineId, day, steps, dismissed: false } as Omit<RoutineCompletion, keyof Entity>, Date.now(), "rc") as RoutineCompletion);
      await commit("routineCompletions", [row]);
    },
    resetRoutine: async (routineId, day) => {
      const cur = get().routineCompletions.find((c) => c.routineId === routineId && c.day === day);
      if (cur) await commit("routineCompletions", [touch(cur, { steps: {}, dismissed: false })]);
    },
    dismissRoutine: async (routineId, day, dismissed) => {
      const cur = get().routineCompletions.find((c) => c.routineId === routineId && c.day === day);
      const row = cur ? touch(cur, { dismissed }) : (stamp({ routineId, day, steps: {}, dismissed } as Omit<RoutineCompletion, keyof Entity>, Date.now(), "rc") as RoutineCompletion);
      await commit("routineCompletions", [row]);
    },

    // ----------------------------------------------------------------- fitness
    startWorkout: async (templateId, day = todayKey(), name) => {
      const s = get();
      const active = s.sessions.find((x) => x.status === "active");
      if (active) return active;
      const template = templateId ? s.workoutTemplates.find((t) => t.id === templateId) ?? null : null;
      const prev = previousSessionFor(s.sessions, templateId, template?.exercises.map((e) => e.exerciseId) ?? [], Date.now());
      const session = startSession(template, day, Date.now(), prev, name);
      await commit("sessions", [session]);
      return session;
    },
    updateSet: async (sessionId, exerciseId, setId, p) => {
      const cur = find("sessions", sessionId);
      if (!cur) return;
      await commit("sessions", [touch(cur, { exercises: cur.exercises.map((e) => (e.id === exerciseId ? { ...e, sets: e.sets.map((st) => (st.id === setId ? { ...st, ...p } : st)) } : e)) })]);
    },
    addSet: async (sessionId, exerciseId) => {
      const cur = find("sessions", sessionId);
      if (!cur) return;
      await commit("sessions", [touch(cur, { exercises: cur.exercises.map((e) => (e.id === exerciseId ? { ...e, sets: [...e.sets, { id: newId("cs"), index: e.sets.length, weight: e.sets.at(-1)?.weight ?? null, reps: null, rpe: null, done: false }] } : e)) })]);
    },
    removeSet: async (sessionId, exerciseId, setId) => {
      const cur = find("sessions", sessionId);
      if (!cur) return;
      await commit("sessions", [touch(cur, { exercises: cur.exercises.map((e) => (e.id === exerciseId ? { ...e, sets: e.sets.filter((st) => st.id !== setId).map((st, i) => ({ ...st, index: i })) } : e)) })]);
    },
    skipExercise: async (sessionId, exerciseId, skipped) => {
      const cur = find("sessions", sessionId);
      if (!cur) return;
      await commit("sessions", [touch(cur, { exercises: cur.exercises.map((e) => (e.id === exerciseId ? { ...e, skipped } : e)) })]);
    },
    finishWorkout: async (sessionId, status = "finished") => {
      const cur = find("sessions", sessionId);
      if (!cur) return;
      await commit("sessions", [touch(cur, { status, finishedAt: Date.now() })]);
      log.info("workout session ended", { status });
    },

    // --------------------------------------------------------------- nutrition
    setTargets: async (t) => {
      await repo().setKV("nutrition.targets", t);
      set({ targets: t });
    },
    planMeal: async (day, slot, mealId, portion = 1) => {
      const e = stamp({ day, slot, mealId, portion, status: "planned" } as Omit<MealPlanEntry, keyof Entity>, Date.now(), "mp") as MealPlanEntry;
      await commit("mealPlan", [e]);
      return e;
    },
    logMeal: async (entryId, status, replacement) => {
      const cur = find("mealPlan", entryId);
      if (!cur) return;
      await commit("mealPlan", [touch(cur, { status, replacedWithMealId: status === "replaced" ? replacement?.mealId ?? null : null, replacedWithFoodId: status === "replaced" ? replacement?.foodId ?? null : null })]);
    },

    // --------------------------------------------------------------- groceries
    regenerateGroceries: async (week, opts = {}) => {
      const s = get();
      const days = daysBetween(week, addDays(week, 6));
      const reqs = deriveRequirements(s.mealPlan, s.meals, s.foods, days);
      const remaining = subtractPantry(reqs, opts.usePantry === false ? [] : s.pantry);
      const list = buildGroceryList(week, remaining, s.groceries, s.foods, Date.now());
      // Rows for this week that are no longer needed get tombstoned (manual ones stay).
      const keep = new Set(list.map((g) => g.id));
      const stale = s.groceries.filter((g) => g.week === week && !g.manual && !keep.has(g.id)).map((g) => g.id);
      if (stale.length) await get().remove("groceries", stale);
      await commit("groceries", list);
      return list;
    },
    addGroceryItem: async (week, item) => {
      const g = stamp({ ...item, foodId: null, sourceMealIds: [], purchased: false, haveIt: false, estimatedPrice: null, actualPrice: null, week, manual: true } as Omit<GroceryItem, keyof Entity>, Date.now(), "g") as GroceryItem;
      await commit("groceries", [g]);
    },

    // -------------------------------------------------------------- demo / data
    addSampleData: async () => {
      // Idempotent: a second load replaces the previous sample rows instead of duplicating them.
      await repo().purgeDemo();
      const dump = sampleLifeData(todayKey());
      for (const c of LIFE_COLLECTIONS) await repo().put(c, dump[c] as LifeEntityMap[typeof c][]);
      if (!(await repo().getKV("nutrition.targets"))) await repo().setKV("nutrition.targets", dump.kv["nutrition.targets"]);
      await get().load({ force: true });
      log.info("sample data added");
    },
    removeSampleData: async () => {
      const n = await repo().purgeDemo();
      await get().load({ force: true });
      log.info("sample data removed", { rows: n });
    },
    clearAllPersonalData: async () => {
      await repo().clearAll();
      set({ ...empty(), targets: DEFAULT_TARGETS, hasDemo: false });
      await get().load({ force: true });
      log.info("personal data cleared");
    },
    importDump: async (dump, mode) => {
      await repo().restore(dump, mode);
      await get().load({ force: true });
    },
  };
});

/** Convenience selectors */
export const selectWeekOf = (day: DayKey) => startOfWeek(day);
export type { Exercise, Food, FitnessProgram, Meal, PantryItem, WorkoutTemplate };
