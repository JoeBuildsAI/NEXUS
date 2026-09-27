import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayKey, diffDays, isLeapYear, localParts, parseDay, parseTimeInput, startOfWeek, weekdayOf } from "./time";
import { describeSchedule, expandRecurrence, nextOccurrence, scheduleOccursOn } from "./recurrence";
import { layoutColumns, normalizeEvent, occurrencesInRange, occurrencesOnDay } from "./calendar";
import { applicableSteps, routineDayState, routineHistory } from "./routines";
import { exerciseBests, fitnessSummary, isPersonalBest, scheduledTemplateId, sessionVolume, startSession } from "./fitness";
import { convertUnit, dayNutrition, facts, ingredient, mealFacts, servingsOf, weekNutrition } from "./nutrition";
import { buildGroceryList, deriveRequirements, estimatePrice, subtractPantry, summarizeList } from "./grocery";
import { parseQuickAdd, tasksForView } from "./tasks";
import { buildAgenda, overview, phaseOf } from "./today";
import type { CalendarEvent, Food, Meal, MealPlanEntry, PantryItem, Routine, RoutineCompletion, Task, WorkoutSession, WorkoutTemplate } from "./models";
import { stamp } from "./models";

const now = Date.parse("2026-09-27T10:00:00");
const base = <T extends object>(o: T) => stamp(o as T & { deletedAt?: null }, now);

describe("local time", () => {
  it("day keys come from local wall-clock time, never UTC", () => {
    const late = new Date(2026, 8, 27, 23, 30); // 23:30 local
    expect(dayKey(late)).toBe("2026-09-27");
    expect(localParts(late.getTime())).toEqual({ day: "2026-09-27", minute: 23 * 60 + 30 });
    expect(dayKey(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
  it("adds days across month, year and DST boundaries without drift", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST forward
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02"); // US DST back
    expect(diffDays("2026-03-07", "2026-03-09")).toBe(2);
    expect(diffDays("2026-10-31", "2026-11-02")).toBe(2);
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
  });
  it("month arithmetic clamps to month length", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("weeks start on Monday by default", () => {
    expect(weekdayOf("2026-09-27")).toBe(0); // Sunday
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21");
    expect(startOfWeek("2026-09-27", 0)).toBe("2026-09-27");
    expect(parseDay("2026-09-27").getHours()).toBe(0);
  });
  it("parses time input", () => {
    expect(parseTimeInput("3pm")).toBe(15 * 60);
    expect(parseTimeInput("12:30 am")).toBe(30);
    expect(parseTimeInput("07:45")).toBe(7 * 60 + 45);
    expect(parseTimeInput("25:00")).toBeNull();
  });
});

describe("schedules", () => {
  it("evaluates every cadence deterministically", () => {
    expect(scheduleOccursOn({ kind: "daily" }, "2026-09-27")).toBe(true);
    expect(scheduleOccursOn({ kind: "weekdays" }, "2026-09-27")).toBe(false); // Sunday
    expect(scheduleOccursOn({ kind: "weekends" }, "2026-09-27")).toBe(true);
    expect(scheduleOccursOn({ kind: "days", weekdays: [2, 5] }, "2026-09-29")).toBe(true); // Tuesday
    expect(scheduleOccursOn({ kind: "everyN", every: 3, anchor: "2026-09-21" }, "2026-09-27")).toBe(true);
    expect(scheduleOccursOn({ kind: "everyN", every: 3, anchor: "2026-09-21" }, "2026-09-28")).toBe(false);
    expect(scheduleOccursOn({ kind: "daily", from: "2026-10-01" }, "2026-09-27")).toBe(false);
    expect(scheduleOccursOn({ kind: "daily", to: "2026-09-26" }, "2026-09-27")).toBe(false);
    expect(nextOccurrence({ kind: "days", weekdays: [1] }, "2026-09-27")).toBe("2026-09-28");
    expect(describeSchedule({ kind: "days", weekdays: [1, 3, 5] })).toBe("Mon · Wed · Fri");
  });
});

describe("calendar recurrence", () => {
  it("expands daily / weekly / monthly / yearly with intervals, until, count and exceptions", () => {
    expect(expandRecurrence("2026-09-01", { freq: "daily", interval: 2 }, "2026-09-05", "2026-09-10")).toEqual(["2026-09-05", "2026-09-07", "2026-09-09"]);
    expect(expandRecurrence("2026-09-01", { freq: "weekly", byWeekday: [1, 4] }, "2026-09-01", "2026-09-14")).toEqual(["2026-09-03", "2026-09-07", "2026-09-10", "2026-09-14"]);
    expect(expandRecurrence("2026-01-31", { freq: "monthly" }, "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(expandRecurrence("2024-02-29", { freq: "yearly" }, "2024-01-01", "2029-01-01")).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
    expect(expandRecurrence("2026-09-01", { freq: "daily", count: 3 }, "2026-09-01", "2026-09-30")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(expandRecurrence("2026-09-01", { freq: "daily", until: "2026-09-02" }, "2026-08-01", "2026-09-30")).toEqual(["2026-09-01", "2026-09-02"]);
    expect(expandRecurrence("2026-09-01", { freq: "daily", exceptions: ["2026-09-02"] }, "2026-09-01", "2026-09-03")).toEqual(["2026-09-01", "2026-09-03"]);
  });
  it("is fast over ten years of a daily series", () => {
    const t0 = performance.now();
    const out = expandRecurrence("2016-01-01", { freq: "daily" }, "2026-09-01", "2026-09-30");
    expect(out).toHaveLength(30);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

const ev = (o: Partial<CalendarEvent>): CalendarEvent => base({ title: "Event", day: "2026-09-27", startMinute: 600, endDay: "2026-09-27", endMinute: 660, allDay: false, timezone: "UTC", source: "local", category: "personal", readOnly: false, ...o }) as CalendarEvent;

describe("calendar occurrences", () => {
  it("multi-day events produce one occurrence per day with continuation flags", () => {
    const e = ev({ day: "2026-09-27", startMinute: 22 * 60, endDay: "2026-09-29", endMinute: 60 });
    const occ = occurrencesInRange([e], "2026-09-26", "2026-09-30");
    expect(occ.map((o) => [o.day, o.startMinute, o.endMinute, o.continuesBefore, o.continuesAfter])).toEqual([
      ["2026-09-27", 1320, 1440, false, true],
      ["2026-09-28", 0, 1440, true, true],
      ["2026-09-29", 0, 60, true, false],
    ]);
  });
  it("recurring weekly meeting appears on the right days; all-day sorts first", () => {
    const meeting = ev({ title: "Standup", day: "2026-09-01", endDay: "2026-09-01", recurrence: { freq: "weekly", byWeekday: [1, 2, 3, 4, 5] } });
    const holiday = ev({ title: "Holiday", allDay: true, day: "2026-09-28", endDay: "2026-09-28" });
    const day = occurrencesOnDay([meeting, holiday], "2026-09-28");
    expect(day.map((o) => o.event.title)).toEqual(["Holiday", "Standup"]);
    expect(occurrencesOnDay([meeting], "2026-09-27")).toHaveLength(0); // Sunday
  });
  it("overlapping events get column layout", () => {
    const a = ev({ title: "A", startMinute: 600, endMinute: 720 });
    const b = ev({ title: "B", startMinute: 660, endMinute: 780 });
    const c = ev({ title: "C", startMinute: 800, endMinute: 860 });
    const occ = occurrencesOnDay([a, b, c], "2026-09-27");
    const cols = layoutColumns(occ);
    expect(cols.get(occ.find((o) => o.event.title === "A")!.key)).toEqual({ col: 0, cols: 2 });
    expect(cols.get(occ.find((o) => o.event.title === "B")!.key)).toEqual({ col: 1, cols: 2 });
    expect(cols.get(occ.find((o) => o.event.title === "C")!.key)).toEqual({ col: 0, cols: 1 });
  });
  it("normalizes drafts: end after start, all-day whole days", () => {
    expect(normalizeEvent({ day: "2026-09-27", startMinute: 600, endDay: "2026-09-26", endMinute: 500, allDay: false })).toMatchObject({ endDay: "2026-09-27", endMinute: 630 });
    expect(normalizeEvent({ day: "2026-09-27", startMinute: 600, endDay: "2026-09-27", endMinute: 700, allDay: true })).toMatchObject({ startMinute: 0, endMinute: 0 });
  });
});

const routine = (): Routine => base({
  name: "Evening Skincare", category: "skincare", schedule: { kind: "daily" }, preferredMinute: 21 * 60 + 30, estimatedMinutes: 10, enabled: true,
  steps: [
    { id: "s1", title: "Cleanse", order: 0 }, { id: "s2", title: "Toner", order: 1 }, { id: "s3", title: "Moisturizer", order: 3 },
    { id: "s4", title: "Retinol", order: 2, condition: { kind: "days", weekdays: [2, 5] } },
  ],
}) as Routine;

describe("routines", () => {
  it("conditional steps apply only on their days, in order", () => {
    const r = routine();
    expect(applicableSteps(r, "2026-09-27").map((s) => s.title)).toEqual(["Cleanse", "Toner", "Moisturizer"]); // Sunday
    expect(applicableSteps(r, "2026-09-29").map((s) => s.title)).toEqual(["Cleanse", "Toner", "Retinol", "Moisturizer"]); // Tuesday
  });
  it("tracks day state and history (complete, partial, missed, consistency)", () => {
    const r = routine();
    const c = (day: string, steps: Record<string, "done" | "skipped">, dismissed = false): RoutineCompletion => base({ routineId: r.id, day, steps, dismissed }) as RoutineCompletion;
    const completions = [c("2026-09-24", { s1: "done", s2: "done", s3: "done" }), c("2026-09-25", { s1: "done" }), c("2026-09-26", { s1: "done", s2: "skipped", s3: "done" }), c("2026-09-27", { s1: "done" })];
    const st = routineDayState(r, "2026-09-27", completions[3]);
    expect(st).toMatchObject({ done: 1, total: 3, complete: false });
    const h = routineHistory(r, completions, "2026-09-22", "2026-09-27");
    expect(h.dueDays).toBe(6);
    expect(h.completedDays).toBe(2); // 24th, 26th (skipped counts toward completion but needs ≥1 done)
    expect(h.partialDays).toBe(2); // 25th, 27th (today in progress)
    expect(h.missedDays).toBe(2); // 22nd, 23rd
    expect(h.averageCompletion).toBeCloseTo((0 + 0 + 1 + 1 / 4 + 2 / 3 + 1 / 3) / 6, 2); // Friday has the retinol step (4 steps)
    expect(h.consistency).toBe(1); // 26th complete; today in progress doesn't break; 25th partial breaks
  });
  it("'not today' dismissal removes the day from due statistics", () => {
    const r = routine();
    const h = routineHistory(r, [base({ routineId: r.id, day: "2026-09-26", steps: {}, dismissed: true }) as RoutineCompletion], "2026-09-26", "2026-09-26");
    expect(h.dueDays).toBe(0);
    expect(h.missedDays).toBe(0);
  });
});

describe("fitness", () => {
  const tmpl: WorkoutTemplate = base({ name: "Push", label: "Push", exercises: [{ id: "we1", exerciseId: "ex-bench", order: 0, restSeconds: 90, sets: [{ repsMin: 8, repsMax: 10, weight: 80 }, { repsMin: 8, repsMax: 10, weight: 80 }] }] }) as WorkoutTemplate;
  it("schedules weekly, rotating and manual programs", () => {
    const weekly = base({ name: "PPL", mode: "weekly" as const, weekly: [null, "push", "pull", "legs", null, "push", null], rotation: [], anchor: "2026-09-21", manual: {}, enabled: true });
    expect(scheduledTemplateId(weekly, "2026-09-28")).toBe("push"); // Monday
    expect(scheduledTemplateId(weekly, "2026-09-27")).toBeNull();
    const rot = { ...weekly, mode: "rotating" as const, rotation: ["push", "pull", "legs", null] };
    expect(scheduledTemplateId(rot, "2026-09-21")).toBe("push");
    expect(scheduledTemplateId(rot, "2026-09-24")).toBeNull();
    expect(scheduledTemplateId(rot, "2026-09-25")).toBe("push");
    expect(scheduledTemplateId(rot, "2026-09-20")).toBeNull(); // negative offsets wrap safely
    expect(scheduledTemplateId({ ...weekly, mode: "manual" as const, manual: { "2026-09-27": "legs" } }, "2026-09-27")).toBe("legs");
    expect(scheduledTemplateId({ ...weekly, enabled: false }, "2026-09-28")).toBeNull();
  });
  it("starts a session from a template with previous weights, logs sets, computes volume and PBs", () => {
    const prev: WorkoutSession = { ...startSession(tmpl, "2026-09-20", now - 7 * 86400_000), status: "finished", finishedAt: now - 7 * 86400_000 + 3600_000 };
    prev.exercises[0]!.sets[0] = { ...prev.exercises[0]!.sets[0]!, weight: 82.5, reps: 9, done: true };
    prev.exercises[0]!.sets[1] = { ...prev.exercises[0]!.sets[1]!, weight: 82.5, reps: 8, done: true };
    const s = startSession(tmpl, "2026-09-27", now, prev);
    expect(s.exercises[0]!.sets[0]!.weight).toBe(82.5); // carried from previous
    expect(s.exercises[0]!.sets[0]!.done).toBe(false);
    s.exercises[0]!.sets[0] = { ...s.exercises[0]!.sets[0]!, weight: 85, reps: 8, done: true };
    expect(sessionVolume(s)).toBe(680);
    expect(isPersonalBest([prev], "ex-bench", s.exercises[0]!.sets[0]!)).toBe(true);
    expect(isPersonalBest([prev], "ex-bench", { ...s.exercises[0]!.sets[0]!, weight: 80 })).toBe(false);
    const bests = exerciseBests([prev], "ex-bench");
    expect(bests.maxWeight).toBe(82.5);
    expect(bests.estimated1rm).toBe(Math.round(82.5 * (1 + 9 / 30)));
    // Bodyweight (null weight) sets count as done but add no volume and no PB.
    const bw: WorkoutSession = { ...s, exercises: [{ ...s.exercises[0]!, exerciseId: "ex-pushup", sets: [{ id: "x", index: 0, weight: null, reps: 20, done: true }] }] };
    expect(sessionVolume(bw)).toBe(0);
    expect(isPersonalBest([], "ex-pushup", bw.exercises[0]!.sets[0]!)).toBe(false);
  });
  it("summarizes adherence against a program", () => {
    const program = base({ name: "PPL", mode: "weekly" as const, weekly: ["push", "pull", "legs", null, "push", "pull", null], rotation: [], anchor: "2026-09-21", manual: {}, enabled: true });
    const done: WorkoutSession = { ...startSession(tmpl, "2026-09-22", now), status: "finished", finishedAt: now + 3_000_000 };
    const sum = fitnessSummary([done], program, "2026-09-21", "2026-09-27", (d) => d);
    expect(sum.sessions).toBe(1);
    expect(sum.adherence).toBeCloseTo(1 / 5);
    expect(sum.totalMinutes).toBe(50);
  });
});

const food = (o: Partial<Food>): Food => base({ name: "Food", servingAmount: 100, servingUnit: "g" as const, facts: facts({}), category: "pantry" as const, source: "user" as const, ...o }) as Food;

describe("nutrition", () => {
  const chicken = food({ id: "chicken", name: "Chicken breast", facts: facts({ calories: 165, protein: 31, carbs: 0, fat: 3.6 }, "known"), category: "meat", pricePerServing: 1.2 });
  const rice = food({ id: "rice", name: "Rice (cooked)", facts: facts({ calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }, "estimated") });
  const sauce = food({ id: "sauce", name: "Mystery sauce", servingAmount: 1, servingUnit: "tbsp", facts: facts({}) }); // unknown
  const meal: Meal = base({ name: "Chicken & rice", slot: "dinner" as const, servings: 2, favorite: false, ingredients: [ingredient("chicken", 400, "g"), ingredient("rice", 300, "g"), ingredient("sauce", 2, "tbsp")] }) as Meal;
  it("converts compatible units and refuses incompatible ones", () => {
    expect(convertUnit(1, "kg", "g")).toBe(1000);
    expect(convertUnit(1, "cup", "ml")).toBe(240);
    expect(convertUnit(16, "oz", "lb")).toBeCloseTo(1);
    expect(convertUnit(1, "cup", "g")).toBeNull();
    expect(convertUnit(1, "piece", "g")).toBeNull();
    expect(servingsOf(chicken, 200, "g")).toBe(2);
    expect(servingsOf(chicken, 1, "piece")).toBeNull();
  });
  it("derives meal facts per serving, keeps unknowns unknown and reports weakest provenance", () => {
    const f = mealFacts(meal, [chicken, rice, sauce]);
    expect(f.calories.value).toBe(525); // (165*4 + 130*3) / 2 servings
    expect(f.protein.value).toBeCloseTo(66.05, 1);
    expect(f.calories.complete).toBe(false); // sauce is unknown
    expect(f.calories.unknown).toBe(1);
    expect(f.calories.provenance).toBe("estimated");
    expect(mealFacts(meal, [chicken, rice, sauce], 0.5).calories.value).toBe(262.5);
    const missing = mealFacts({ ...meal, ingredients: [ingredient("nope", 1, "g")] }, [chicken]);
    expect(missing.calories.value).toBe(0);
    expect(missing.calories.complete).toBe(false);
    expect(missing.incompatible).toBe(1);
  });
  it("aggregates a day: planned vs consumed with partial / skipped / replaced", () => {
    const plan = (o: Partial<MealPlanEntry>): MealPlanEntry => base({ day: "2026-09-27", slot: "dinner" as const, mealId: meal.id, portion: 1, status: "planned" as const, ...o }) as MealPlanEntry;
    const snack: Meal = { ...meal, id: "snack", name: "Rice bowl", servings: 1, ingredients: [ingredient("rice", 200, "g")] };
    const entries = [plan({ status: "eaten" }), plan({ slot: "lunch", status: "partial" }), plan({ slot: "breakfast", status: "skipped" }), plan({ slot: "snack", status: "replaced", replacedWithMealId: "snack" })];
    const d = dayNutrition("2026-09-27", entries, [meal, snack], [chicken, rice, sauce]);
    expect(d.entries).toBe(4);
    expect(d.logged).toBe(4);
    expect(d.planned.calories.value).toBe(525 * 3); // skipped excluded
    expect(d.consumed.calories.value).toBe(525 + 262.5 + 260); // eaten + half + replacement
    expect(d.consumed.calories.complete).toBe(false); // sauce unknown propagates
    const w = weekNutrition(["2026-09-26", "2026-09-27"], entries, [meal, snack], [chicken, rice, sauce]);
    expect(w.averagePlanned.calories).toBe(1575);
    expect(w.adherence).toBe(0.75);
  });
});

describe("groceries", () => {
  const chicken = food({ id: "chicken", name: "Chicken breast", category: "meat", pricePerServing: 1.2 });
  const rice = food({ id: "rice", name: "Rice", category: "pantry" });
  const eggs = food({ id: "eggs", name: "Eggs", servingAmount: 1, servingUnit: "piece", category: "dairy" });
  const m1: Meal = base({ name: "A", slot: "dinner" as const, servings: 1, favorite: false, ingredients: [ingredient("chicken", 200, "g"), ingredient("rice", 0.5, "kg"), ingredient("eggs", 2, "piece")] }) as Meal;
  const m2: Meal = base({ name: "B", slot: "lunch" as const, servings: 2, favorite: false, ingredients: [ingredient("chicken", 1, "lb"), ingredient("rice", 200, "g"), ingredient("eggs", 1, "cup")] }) as Meal;
  const plan = (mealId: string, day: string, status: MealPlanEntry["status"] = "planned", portion = 1): MealPlanEntry => base({ day, slot: "dinner" as const, mealId, portion, status }) as MealPlanEntry;
  it("aggregates identical ingredients across meals, converting compatible units and flagging incompatible ones", () => {
    const reqs = deriveRequirements([plan(m1.id, "2026-09-28"), plan(m2.id, "2026-09-29"), plan(m1.id, "2026-09-30", "skipped")], [m1, m2], [chicken, rice, eggs], ["2026-09-28", "2026-09-29", "2026-09-30"]);
    const c = reqs.find((r) => r.foodId === "chicken")!;
    expect(c.quantity).toBeCloseTo(200 + 453.592 / 2, 1); // m2 has 2 servings, 1 portion
    expect(c.unit).toBe("g");
    const r = reqs.find((x) => x.foodId === "rice")!;
    expect(r.quantity).toBe(600);
    const e = reqs.find((x) => x.foodId === "eggs")!;
    expect(e.quantity).toBe(2);
    expect(e.conflicts).toEqual([{ quantity: 0.5, unit: "cup", mealId: m2.id }]);
    expect(c.sourceMealIds).toEqual([m1.id, m2.id]);
  });
  it("subtracts pantry stock, respects insufficient stock and incompatible units", () => {
    const reqs = deriveRequirements([plan(m1.id, "2026-09-28")], [m1], [chicken, rice, eggs], ["2026-09-28"]);
    const pantry: PantryItem[] = [base({ name: "Rice", foodId: "rice", quantity: 2, unit: "kg" as const }) as PantryItem, base({ name: "Chicken breast", foodId: "chicken", quantity: 50, unit: "g" as const }) as PantryItem, base({ name: "Eggs", foodId: "eggs", quantity: 1, unit: "cup" as const }) as PantryItem];
    const left = subtractPantry(reqs, pantry);
    expect(left.find((r) => r.foodId === "rice")!.remaining).toBe(0);
    expect(left.find((r) => r.foodId === "chicken")!.remaining).toBe(150);
    expect(left.find((r) => r.foodId === "eggs")!.remaining).toBe(2); // cup of eggs can't cover pieces
  });
  it("builds the list, keeps manual items and purchased flags, prices only what it can", () => {
    const reqs = subtractPantry(deriveRequirements([plan(m1.id, "2026-09-28")], [m1], [chicken, rice, eggs], ["2026-09-28"]), []);
    const manual = base({ name: "Paper towels", quantity: 1, unit: "piece" as const, category: "household" as const, sourceMealIds: [], purchased: false, haveIt: false, week: "2026-09-28", manual: true });
    const first = buildGroceryList("2026-09-28", reqs, [manual], [chicken, rice, eggs], now);
    expect(first.map((g) => g.name).sort()).toEqual(["Chicken breast", "Eggs", "Paper towels", "Rice"]);
    const chickenItem = first.find((g) => g.foodId === "chicken")!;
    expect(chickenItem.estimatedPrice).toBe(2.4); // 200 g = 2 servings × 1.2
    expect(first.find((g) => g.foodId === "rice")!.estimatedPrice).toBeNull();
    const purchased = first.map((g) => (g.foodId === "chicken" ? { ...g, purchased: true } : g));
    const rebuilt = buildGroceryList("2026-09-28", reqs, purchased, [chicken, rice, eggs], now + 1000);
    expect(rebuilt.find((g) => g.foodId === "chicken")!.purchased).toBe(true); // flag survives regeneration
    const sum = summarizeList(rebuilt);
    expect(sum.remaining).toBe(3);
    expect(sum.estimatedTotal).toBeNull(); // the only priced item is purchased → no total invented
    expect(sum.unpriced).toBe(3);
    expect(estimatePrice(eggs, 3, "piece")).toBeNull();
  });
});

describe("tasks", () => {
  const t = (o: Partial<Task>): Task => base({ title: "T", priority: "normal" as const, status: "open" as const, tags: [], today: false, someday: false, source: "local" as const, ...o }) as Task;
  it("classifies views and sorts by due, time, priority", () => {
    const tasks = [t({ title: "inbox" }), t({ title: "due-today", dueDay: "2026-09-27", dueMinute: 900 }), t({ title: "overdue", dueDay: "2026-09-20" }), t({ title: "flag", today: true }), t({ title: "later", dueDay: "2026-10-02" }), t({ title: "someday", someday: true }), t({ title: "done", status: "done", completedAt: now })];
    expect(tasksForView(tasks, "inbox", "2026-09-27").map((x) => x.title)).toEqual(["inbox"]);
    expect(tasksForView(tasks, "today", "2026-09-27").map((x) => x.title)).toEqual(["overdue", "due-today", "flag"]);
    expect(tasksForView(tasks, "upcoming", "2026-09-27").map((x) => x.title)).toEqual(["later"]);
    expect(tasksForView(tasks, "someday", "2026-09-27").map((x) => x.title)).toEqual(["someday"]);
    expect(tasksForView(tasks, "completed", "2026-09-27").map((x) => x.title)).toEqual(["done"]);
  });
  it("parses quick-add syntax", () => {
    const r = parseQuickAdd("Call dentist tomorrow 3pm !high #health", "2026-09-27", addDays, parseTimeInput);
    expect(r).toEqual({ title: "Call dentist", dueDay: "2026-09-28", dueMinute: 15 * 60, priority: "high", tags: ["health"] });
    expect(parseQuickAdd("Renew passport friday", "2026-09-27", addDays, parseTimeInput).dueDay).toBe("2026-10-02");
    expect(parseQuickAdd("", "2026-09-27", addDays, parseTimeInput).title).toBe("Untitled task");
  });
});

describe("today aggregation", () => {
  it("normalizes every domain into agenda items with NOW / NEXT / LATER / COMPLETED phases", () => {
    const r = routine();
    const meal: Meal = base({ name: "Oats", slot: "breakfast" as const, servings: 1, favorite: false, ingredients: [] }) as Meal;
    const items = buildAgenda({
      day: "2026-09-27", nowMinute: 10 * 60 + 40,
      events: [ev({ title: "Gym", startMinute: 10 * 60 + 30, endMinute: 11 * 60 + 30, category: "fitness" }), ev({ title: "Call", startMinute: 15 * 60, endMinute: 15 * 60 + 30 })],
      routines: [r], completions: [base({ routineId: r.id, day: "2026-09-27", steps: { s1: "done", s2: "done", s3: "done" }, dismissed: false }) as RoutineCompletion],
      tasks: [base({ title: "Personal task", priority: "normal" as const, status: "open" as const, tags: [], today: true, someday: false, source: "local" as const, dueDay: "2026-09-27", dueMinute: 15 * 60 }) as Task],
      program: base({ name: "P", mode: "weekly" as const, weekly: ["push", null, null, null, null, null, null], rotation: [], anchor: "2026-09-21", manual: {}, enabled: true }),
      templates: [base({ id: "push", name: "Push", exercises: [] }) as WorkoutTemplate], sessions: [],
      plan: [base({ day: "2026-09-27", slot: "breakfast" as const, mealId: meal.id, portion: 1, status: "eaten" as const }) as MealPlanEntry], meals: [meal],
    });
    expect(items.map((i) => i.kind)).toEqual(["meal", "event", "event", "task", "workout", "routine"]);
    const ov = overview(items, 10 * 60 + 40);
    expect(ov.now.map((i) => i.title)).toEqual(["Gym"]);
    expect(ov.next?.title).toBe("Call");
    expect(ov.completed.map((i) => i.title)).toEqual(["Oats", "Evening Skincare"]);
    expect(phaseOf(items.find((i) => i.kind === "workout")!, 10 * 60 + 40)).toBe("next");
    expect(ov.counts.routine).toEqual({ total: 1, done: 1 });
  });
});
