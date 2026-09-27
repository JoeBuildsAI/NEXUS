import type { CalendarEvent, Food, GroceryItem, Meal, MealPlanEntry, Routine, RoutineCompletion, Task, WorkoutSession, WorkoutTemplate } from "./models";
import { stamp } from "./models";
import { facts, ingredient } from "./nutrition";
import { startSession } from "./fitness";
import { addDays, type DayKey } from "./time";
import type { LifeDump } from "./repository";
import { emptyDump } from "./repository";

/**
 * Synthetic LIFE scenarios for the dev lab and chaos/perf tests. Deterministic
 * (seeded), demo-flagged, never real personal data.
 */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export interface ScenarioOptions {
  eventsPerDay?: number;
  days?: number;
  tasks?: number;
  routines?: number;
  sessions?: number;
  foods?: number;
  meals?: number;
  planDays?: number;
  groceries?: number;
}

export function syntheticLife(today: DayKey, o: ScenarioOptions, seed = 7, now = Date.now()): LifeDump {
  const rnd = seeded(seed);
  const d = emptyDump();
  const mk = <T extends object>(x: T) => stamp({ ...x, demo: true } as T & { demo: true }, now);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)]!;
  const TITLES = ["Sync", "Design review", "1:1", "Dentist", "Call", "Focus block", "Lunch with Sam", "Gym", "Flight", "Errand", "Reading", "Deep work", "Groceries", "Laundry", "Planning"];
  const days = o.days ?? 0;
  for (let i = -Math.floor(days / 2); i < Math.ceil(days / 2); i++) {
    const day = addDays(today, i);
    for (let k = 0; k < (o.eventsPerDay ?? 0); k++) {
      const start = 6 * 60 + Math.floor(rnd() * 60) * 15;
      d.events.push(mk({ title: `${pick(TITLES)} ${k + 1}`, day, startMinute: start, endDay: day, endMinute: Math.min(1440, start + 30 + Math.floor(rnd() * 6) * 15), allDay: rnd() < 0.08, timezone: "local", source: "local", category: pick(["personal", "work", "fitness", "other"] as const), readOnly: false }) as CalendarEvent);
    }
  }
  for (let i = 0; i < (o.tasks ?? 0); i++) {
    const r = rnd();
    d.tasks.push(mk({ title: `Task ${i + 1} · ${pick(TITLES)}`, priority: pick(["low", "normal", "high"] as const), status: r < 0.3 ? "done" : "open", completedAt: r < 0.3 ? now - Math.floor(rnd() * 30) * 86400_000 : null, tags: rnd() < 0.4 ? [pick(["home", "pc", "health", "work"])] : [], today: r > 0.85, someday: r > 0.3 && r < 0.4, dueDay: r >= 0.4 && r < 0.85 ? addDays(today, Math.floor(rnd() * 60) - 20) : null, dueMinute: rnd() < 0.3 ? 9 * 60 + Math.floor(rnd() * 40) * 15 : null, source: "local" }) as Task);
  }
  for (let i = 0; i < (o.routines ?? 0); i++) {
    const steps = Array.from({ length: 3 + Math.floor(rnd() * 6) }, (_, k) => ({ id: `s${i}-${k}`, title: `Step ${k + 1}`, order: k }));
    const r = mk({ name: `Routine ${i + 1}`, category: pick(["morning", "evening", "skincare", "hygiene", "custom"] as const), schedule: pick([{ kind: "daily" as const }, { kind: "weekdays" as const }, { kind: "days" as const, weekdays: [1, 3, 5] }]), preferredMinute: 6 * 60 + Math.floor(rnd() * 64) * 15, estimatedMinutes: 5 + Math.floor(rnd() * 20), steps, enabled: true }) as Routine;
    d.routines.push(r);
    for (let back = 1; back <= 60; back++) if (rnd() < 0.7) d.routineCompletions.push(mk({ routineId: r.id, day: addDays(today, -back), steps: Object.fromEntries(steps.filter(() => rnd() < 0.85).map((s) => [s.id, "done" as const])), dismissed: false }) as RoutineCompletion);
  }
  if (o.sessions) {
    const ex = ["Bench", "Squat", "Deadlift", "Row", "Press", "Curl", "Pull-up", "Lunge"].map((name, i) => mk({ id: `sx-${i}`, name, muscles: [], equipment: "barbell" as const }));
    d.exercises.push(...ex);
    const tmpl = mk({ id: "st-full", name: "Full body", label: "Full", exercises: ex.slice(0, 5).map((e, i) => ({ id: `swe-${i}`, exerciseId: e.id, order: i, sets: [{ repsMin: 5, repsMax: 8, weight: 100 + i * 20 }, { repsMin: 5, repsMax: 8, weight: 100 + i * 20 }, { repsMin: 5, repsMax: 8, weight: 100 + i * 20 }], restSeconds: 90 })) }) as WorkoutTemplate;
    d.workoutTemplates.push(tmpl);
    for (let i = 0; i < o.sessions; i++) {
      const day = addDays(today, -Math.floor(i * 1.7) - 1);
      const s = startSession(tmpl, day, now - (i * 1.7 + 1) * 86400_000);
      for (const e of s.exercises) for (const st of e.sets) { st.done = rnd() < 0.9; st.reps = 5 + Math.floor(rnd() * 4); st.weight = (st.weight ?? 100) + Math.floor(rnd() * 3) * 5; }
      d.sessions.push({ ...s, demo: true, status: "finished", finishedAt: s.startedAt + (45 + Math.floor(rnd() * 30)) * 60_000 } as WorkoutSession);
    }
  }
  const foodsN = o.foods ?? 0;
  for (let i = 0; i < foodsN; i++) d.foods.push(mk({ id: `sf-${i}`, name: `Food ${i + 1} ${pick(["oats", "rice", "chicken", "beans", "yogurt", "apple", "bread", "cheese", "salmon", "tofu"])}`, servingAmount: 100, servingUnit: "g" as const, category: pick(["produce", "meat", "dairy", "pantry", "frozen"] as const), facts: rnd() < 0.1 ? facts({}) : facts({ calories: 50 + Math.floor(rnd() * 400), protein: Math.floor(rnd() * 40), carbs: Math.floor(rnd() * 60), fat: Math.floor(rnd() * 30) }, rnd() < 0.5 ? "known" : "estimated"), pricePerServing: rnd() < 0.6 ? Math.round(rnd() * 300) / 100 : null, source: "sample" as const }) as Food);
  const mealsN = o.meals ?? 0;
  for (let i = 0; i < mealsN && foodsN > 0; i++) d.meals.push(mk({ id: `sm-${i}`, name: `Meal ${i + 1}`, slot: pick(["breakfast", "lunch", "dinner", "snack"] as const), servings: 1 + Math.floor(rnd() * 4), favorite: rnd() < 0.1, ingredients: Array.from({ length: 2 + Math.floor(rnd() * 5) }, (_, k) => ingredient(`sf-${Math.floor(rnd() * foodsN)}`, 50 + Math.floor(rnd() * 300), "g", `smi-${i}-${k}`)) }) as Meal);
  const planDays = o.planDays ?? 0;
  for (let i = -Math.floor(planDays / 2); i < Math.ceil(planDays / 2) && mealsN > 0; i++) {
    const day = addDays(today, i);
    for (const slot of ["breakfast", "lunch", "dinner"] as const) d.mealPlan.push(mk({ day, slot, mealId: `sm-${Math.floor(rnd() * mealsN)}`, portion: 1, status: i < 0 ? pick(["eaten", "eaten", "skipped", "partial"] as const) : "planned" }) as MealPlanEntry);
  }
  for (let i = 0; i < (o.groceries ?? 0); i++) d.groceries.push(mk({ name: `Item ${i + 1}`, foodId: null, quantity: 1 + Math.floor(rnd() * 5), unit: "piece" as const, category: pick(["produce", "meat", "dairy", "pantry", "frozen", "other"] as const), sourceMealIds: [], purchased: rnd() < 0.3, haveIt: rnd() < 0.1, estimatedPrice: rnd() < 0.5 ? Math.round(rnd() * 1500) / 100 : null, week: addDays(today, -7 * Math.floor(rnd() * 52)), manual: true }) as GroceryItem);
  return d;
}

export const LIFE_SCENARIOS: { id: string; label: string; opts: ScenarioOptions }[] = [
  { id: "busy-day", label: "Busy day (12 events, 20 tasks)", opts: { eventsPerDay: 12, days: 1, tasks: 20 } },
  { id: "fifty-events", label: "50-event day", opts: { eventsPerDay: 50, days: 1 } },
  { id: "full-month", label: "Month full of events", opts: { eventsPerDay: 6, days: 31 } },
  { id: "hundred-tasks", label: "100 tasks today", opts: { tasks: 700 } },
  { id: "routines", label: "12 routines with 60 days of history", opts: { routines: 12 } },
  { id: "history", label: "1,000 workout sessions", opts: { sessions: 1000 } },
  { id: "foods", label: "10,000 foods · 1,000 meals · 1-year plan", opts: { foods: 10000, meals: 1000, planDays: 365 } },
  { id: "groceries", label: "5,000 grocery records", opts: { groceries: 5000 } },
];
