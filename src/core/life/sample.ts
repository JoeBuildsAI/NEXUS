import type { CalendarEvent, Exercise, FitnessProgram, Food, Meal, MealPlanEntry, PantryItem, Routine, RoutineCompletion, Task, WorkoutSession, WorkoutTemplate } from "./models";
import { stamp } from "./models";
import { facts, ingredient } from "./nutrition";
import { startSession } from "./fitness";
import { addDays, startOfWeek, type DayKey } from "./time";
import type { LifeDump } from "./repository";
import { emptyDump } from "./repository";

/**
 * Optional SAMPLE data so new LIFE screens are comprehensible. Every row is
 * flagged `demo: true`; "Remove sample data" purges them, and analytics can
 * exclude them. Nothing here is real personal data.
 */
export function sampleLifeData(today: DayKey, now = Date.now()): LifeDump {
  const d = emptyDump();
  const mk = <T extends object>(o: T) => stamp({ ...o, demo: true } as T & { demo: true }, now);
  const week = startOfWeek(today);

  // Exercises
  const ex = (id: string, name: string, muscles: Exercise["muscles"], equipment: Exercise["equipment"]) => mk({ id, name, muscles, equipment }) as Exercise;
  d.exercises = [
    ex("ex-incline-db", "Incline Dumbbell Press", ["chest", "triceps", "shoulders"], "dumbbell"),
    ex("ex-ohp", "Overhead Press", ["shoulders", "triceps"], "barbell"),
    ex("ex-dips", "Dips", ["chest", "triceps"], "bodyweight"),
    ex("ex-lateral", "Lateral Raise", ["shoulders"], "dumbbell"),
    ex("ex-pushdown", "Triceps Pushdown", ["triceps"], "cable"),
    ex("ex-row", "Barbell Row", ["back", "biceps"], "barbell"),
    ex("ex-pullup", "Pull-up", ["back", "biceps"], "bodyweight"),
    ex("ex-curl", "Dumbbell Curl", ["biceps"], "dumbbell"),
    ex("ex-squat", "Back Squat", ["quads", "glutes", "core"], "barbell"),
    ex("ex-rdl", "Romanian Deadlift", ["hamstrings", "glutes", "back"], "barbell"),
    ex("ex-legpress", "Leg Press", ["quads", "glutes"], "machine"),
    ex("ex-calf", "Standing Calf Raise", ["calves"], "machine"),
  ];
  const set = (repsMin: number, repsMax: number, weight: number | null, n = 3) => Array.from({ length: n }, () => ({ repsMin, repsMax, weight }));
  const tmpl = (id: string, name: string, label: string, exs: [string, ReturnType<typeof set>, number][]) => mk({ id, name, label, exercises: exs.map(([exerciseId, sets, restSeconds], i) => ({ id: `${id}-${i}`, exerciseId, order: i, sets, restSeconds })) }) as WorkoutTemplate;
  d.workoutTemplates = [
    tmpl("wt-push", "Push", "Push", [["ex-incline-db", set(8, 10, 80), 90], ["ex-ohp", set(6, 8, 115), 120], ["ex-dips", set(8, 12, null), 90], ["ex-lateral", set(12, 15, 20), 60], ["ex-pushdown", set(10, 12, 60), 60]]),
    tmpl("wt-pull", "Pull", "Pull", [["ex-row", set(6, 8, 165), 120], ["ex-pullup", set(6, 10, null), 90], ["ex-curl", set(10, 12, 35), 60]]),
    tmpl("wt-legs", "Legs", "Legs", [["ex-squat", set(5, 6, 245), 150], ["ex-rdl", set(8, 10, 185), 120], ["ex-legpress", set(10, 12, 320), 90], ["ex-calf", set(12, 15, 140), 60]]),
  ];
  // Weekly PPL arranged so that today is a Push day (matches the sample "Gym · Push" event).
  const wd = new Date(`${today}T00:00:00`).getDay();
  const cycle: (string | null)[] = ["wt-push", "wt-pull", "wt-legs", null, "wt-push", "wt-pull", null];
  const weekly = Array.from({ length: 7 }, (_, i) => cycle[((i - wd) % 7 + 7) % 7] ?? null);
  d.programs = [mk({ id: "prog-ppl", name: "Push · Pull · Legs", mode: "weekly", weekly, rotation: [], anchor: week, manual: {}, enabled: true }) as FitnessProgram];
  // Two finished sessions for history / previous values
  const s1 = startSession(d.workoutTemplates[0]!, addDays(today, -7), now - 7 * 86400_000 - 3_600_000);
  for (const e of s1.exercises) for (const st of e.sets) { st.done = true; st.reps = 9; st.weight = st.weight == null ? null : st.weight - 5; }
  const s2 = startSession(d.workoutTemplates[2]!, addDays(today, -5), now - 5 * 86400_000 - 3_600_000);
  for (const e of s2.exercises) for (const st of e.sets) { st.done = true; st.reps = 6; }
  d.sessions = [{ ...s1, demo: true, status: "finished", finishedAt: s1.startedAt + 58 * 60_000 }, { ...s2, demo: true, status: "finished", finishedAt: s2.startedAt + 66 * 60_000 }] as WorkoutSession[];

  // Routines
  const steps = (titles: string[]) => titles.map((title, order) => ({ id: `st-${title.toLowerCase().replace(/\W+/g, "-")}`, title, order }));
  const skin = mk({ id: "rt-skincare", name: "Morning Skincare", category: "skincare", schedule: { kind: "daily" }, preferredMinute: 7 * 60 + 30, estimatedMinutes: 8, enabled: true, steps: [...steps(["Cleanse", "Toner", "Vitamin C", "Youth Serum", "Snail Mucin", "Moisturizer", "SPF"])] }) as Routine;
  const evening = mk({ id: "rt-evening", name: "Evening Skincare", category: "skincare", schedule: { kind: "daily" }, preferredMinute: 21 * 60 + 30, estimatedMinutes: 8, enabled: true, steps: [...steps(["Cleanse", "Toner", "Moisturizer"]), { id: "st-retinol", title: "Retinol", order: 2, condition: { kind: "days", weekdays: [2, 5] } }] }) as Routine;
  const morning = mk({ id: "rt-morning", name: "Morning Routine", category: "morning", schedule: { kind: "daily" }, preferredMinute: 7 * 60, estimatedMinutes: 30, enabled: true, steps: steps(["Water", "Stretch", "Shower", "Breakfast", "Plan the day"]) }) as Routine;
  const supplements = mk({ id: "rt-supp", name: "Supplements", category: "supplements", schedule: { kind: "daily" }, preferredMinute: 8 * 60 + 30, estimatedMinutes: 2, enabled: true, steps: steps(["Vitamin D", "Omega-3", "Creatine"]) }) as Routine;
  d.routines = [morning, skin, supplements, evening];
  d.routineCompletions = [
    mk({ routineId: "rt-morning", day: today, steps: Object.fromEntries(morning.steps.map((s) => [s.id, "done"])), dismissed: false }) as RoutineCompletion,
    mk({ routineId: "rt-skincare", day: today, steps: { "st-cleanse": "done", "st-toner": "done" }, dismissed: false }) as RoutineCompletion,
    ...[1, 2, 3, 4, 5, 6].map((n) => mk({ routineId: "rt-skincare", day: addDays(today, -n), steps: Object.fromEntries(skin.steps.filter((_, i) => n !== 3 || i < 5).map((s) => [s.id, "done"])), dismissed: false }) as RoutineCompletion),
  ];

  // Foods (sample values, marked estimated)
  const f = (id: string, name: string, servingAmount: number, servingUnit: Food["servingUnit"], category: Food["category"], v: Parameters<typeof facts>[0], price: number | null = null) => mk({ id, name, servingAmount, servingUnit, category, facts: facts(v, "estimated"), pricePerServing: price, source: "sample" }) as Food;
  d.foods = [
    f("fd-oats", "Rolled oats", 40, "g", "pantry", { calories: 150, protein: 5, carbs: 27, fat: 3, fiber: 4 }, 0.25),
    f("fd-whey", "Whey protein", 1, "scoop", "pantry", { calories: 120, protein: 24, carbs: 3, fat: 1.5 }, 1.1),
    f("fd-banana", "Banana", 1, "piece", "produce", { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1 }, 0.3),
    f("fd-chicken", "Chicken breast", 100, "g", "meat", { calories: 165, protein: 31, carbs: 0, fat: 3.6 }, 1.2),
    f("fd-rice", "Rice (cooked)", 100, "g", "pantry", { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }, 0.15),
    f("fd-broccoli", "Broccoli", 100, "g", "produce", { calories: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6 }, 0.4),
    f("fd-salmon", "Salmon", 100, "g", "meat", { calories: 208, protein: 20, carbs: 0, fat: 13 }, 2.6),
    f("fd-potato", "Potato", 100, "g", "produce", { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2 }, 0.2),
    f("fd-eggs", "Eggs", 1, "piece", "dairy", { calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 }, 0.35),
    f("fd-yogurt", "Greek yogurt", 170, "g", "dairy", { calories: 100, protein: 17, carbs: 6, fat: 0.7 }, 1.0),
    f("fd-berries", "Mixed berries", 100, "g", "frozen", { calories: 57, protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4 }, 0.9),
    f("fd-oil", "Olive oil", 1, "tbsp", "pantry", { calories: 119, protein: 0, carbs: 0, fat: 13.5 }, 0.2),
    f("fd-beef", "Ground beef 90/10", 100, "g", "meat", { calories: 176, protein: 20, carbs: 0, fat: 10 }, 1.4),
    f("fd-tortilla", "Tortilla", 1, "piece", "bakery", { calories: 140, protein: 4, carbs: 24, fat: 3.5 }, 0.3),
    f("fd-sauce", "House sauce", 1, "tbsp", "pantry", {}), // UNKNOWN nutrition on purpose
  ];
  const meal = (id: string, name: string, slot: Meal["slot"], servings: number, ings: [string, number, Food["servingUnit"]][], favorite = false) => mk({ id, name, slot, servings, favorite, ingredients: ings.map(([foodId, amount, unit], i) => ingredient(foodId, amount, unit, `${id}-i${i}`)) }) as Meal;
  d.meals = [
    meal("ml-oats", "Protein oats", "breakfast", 1, [["fd-oats", 60, "g"], ["fd-whey", 1, "scoop"], ["fd-banana", 1, "piece"]], true),
    meal("ml-eggs", "Eggs & toast", "breakfast", 1, [["fd-eggs", 3, "piece"], ["fd-tortilla", 2, "piece"]]),
    meal("ml-chicken-rice", "Chicken, rice & broccoli", "lunch", 4, [["fd-chicken", 700, "g"], ["fd-rice", 800, "g"], ["fd-broccoli", 400, "g"], ["fd-oil", 2, "tbsp"]], true),
    meal("ml-salmon", "Salmon & potatoes", "dinner", 2, [["fd-salmon", 350, "g"], ["fd-potato", 500, "g"], ["fd-broccoli", 200, "g"], ["fd-oil", 1, "tbsp"]]),
    meal("ml-tacos", "Beef tacos", "dinner", 2, [["fd-beef", 400, "g"], ["fd-tortilla", 6, "piece"], ["fd-sauce", 3, "tbsp"]]),
    meal("ml-yogurt", "Yogurt & berries", "snack", 1, [["fd-yogurt", 170, "g"], ["fd-berries", 100, "g"]]),
  ];
  const plan = (day: DayKey, slot: MealPlanEntry["slot"], mealId: string, status: MealPlanEntry["status"] = "planned") => mk({ day, slot, mealId, portion: 1, status }) as MealPlanEntry;
  d.mealPlan = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(week, i);
    const past = day < today;
    d.mealPlan.push(plan(day, "breakfast", i % 2 ? "ml-eggs" : "ml-oats", past || day === today ? "eaten" : "planned"));
    d.mealPlan.push(plan(day, "lunch", "ml-chicken-rice", past ? "eaten" : day === today ? "eaten" : "planned"));
    d.mealPlan.push(plan(day, "dinner", i % 3 === 2 ? "ml-tacos" : "ml-salmon", past ? (i === 1 ? "skipped" : "eaten") : "planned"));
    if (i % 2 === 0) d.mealPlan.push(plan(day, "snack", "ml-yogurt", past ? "eaten" : "planned"));
  }
  d.pantry = [
    mk({ name: "Rice (cooked)", foodId: "fd-rice", quantity: 1, unit: "kg", lowThreshold: 0.5 }) as PantryItem,
    mk({ name: "Olive oil", foodId: "fd-oil", quantity: 30, unit: "tbsp", lowThreshold: 5 }) as PantryItem,
    mk({ name: "Whey protein", foodId: "fd-whey", quantity: 12, unit: "scoop", lowThreshold: 5 }) as PantryItem,
  ];

  // Tasks
  const task = (title: string, o: Partial<Task>) => mk({ title, priority: "normal", status: "open", tags: [], today: false, someday: false, source: "local", ...o }) as Task;
  d.tasks = [
    task("Renew gym membership", { dueDay: today, dueMinute: 15 * 60, priority: "high", tags: ["fitness"] }),
    task("Order new SSD", { dueDay: addDays(today, 2), tags: ["pc"] }),
    task("Book dentist", { today: true }),
    task("Read GPU driver notes", { someday: true }),
    task("Back up NEXUS data", { dueDay: addDays(today, 6), recurrence: { kind: "days", weekdays: [0] } }),
    task("Clean desk", { status: "done", completedAt: now - 3_600_000, dueDay: today }),
  ];

  // Calendar
  const event = (title: string, day: DayKey, startMinute: number, endMinute: number, category: CalendarEvent["category"], o: Partial<CalendarEvent> = {}) => mk({ title, day, startMinute, endDay: day, endMinute, allDay: false, timezone: "local", source: "local", category, readOnly: false, ...o }) as CalendarEvent;
  d.events = [
    event("Gym · Push", today, 17 * 60 + 30, 18 * 60 + 45, "fitness"),
    event("Call with Alex", today, 15 * 60, 15 * 60 + 30, "personal"),
    event("Team sync", addDays(week, 0), 10 * 60, 10 * 60 + 30, "work", { recurrence: { freq: "weekly", byWeekday: [1, 3] } }),
    event("Grocery run", addDays(today, 1), 11 * 60, 12 * 60, "personal"),
    event("Weekend trip", addDays(today, 5), 0, 0, "travel", { allDay: true, endDay: addDays(today, 6) }),
    event("Rent", `${today.slice(0, 7)}-01`, 0, 0, "other", { allDay: true, recurrence: { freq: "monthly", byMonthDay: 1 } }),
  ];
  d.kv = { "nutrition.targets": { calories: 2400, protein: 190, carbs: 230, fat: 75, fiber: 30 } };
  return d;
}
