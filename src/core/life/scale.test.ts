import { describe, expect, it } from "vitest";
import { syntheticLife } from "./synthetic";
import { occurrencesInRange, occurrencesOnDay } from "./calendar";
import { expandRecurrence } from "./recurrence";
import { tasksForView } from "./tasks";
import { routineHistory } from "./routines";
import { exerciseBests, fitnessSummary } from "./fitness";
import { dayNutrition, weekNutrition } from "./nutrition";
import { deriveRequirements, subtractPantry, summarizeList } from "./grocery";
import { buildAgenda, overview } from "./today";
import { addDays, daysBetween, startOfWeek } from "./time";
import { MemoryLifeRepository } from "./repository";
import type { CalendarEvent } from "./models";
import { stamp } from "./models";

const today = "2026-09-27";
const time = async (label: string, fn: () => unknown | Promise<unknown>, budgetMs: number) => {
  const t0 = performance.now();
  const r = await fn();
  const ms = performance.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`perf ${label}: ${ms.toFixed(1)} ms`);
  expect(ms, label).toBeLessThan(budgetMs);
  return r;
};

describe("data scale", () => {
  it("ten years of daily + weekly recurring events expand per month quickly", async () => {
    const series: CalendarEvent[] = Array.from({ length: 40 }, (_, i) => stamp({ title: `S${i}`, day: "2016-01-01", startMinute: 540, endDay: "2016-01-01", endMinute: 600, allDay: false, timezone: "l", source: "local" as const, category: "work" as const, readOnly: false, recurrence: i % 2 ? { freq: "weekly" as const, byWeekday: [1, 3, 5] } : { freq: "daily" as const } }) as CalendarEvent);
    const occ = await time("40 series × 10 years → one month", () => occurrencesInRange(series, "2026-09-01", "2026-09-30"), 150) as ReturnType<typeof occurrencesInRange>;
    expect(occ.length).toBe(20 * 30 + 20 * 13);
    await time("year view: 12 months busy-map", () => occurrencesInRange(series, "2026-01-01", "2026-12-31"), 600);
    expect(expandRecurrence("2016-01-01", { freq: "daily" }, "2026-09-27", "2026-09-27")).toEqual(["2026-09-27"]);
  });

  it("10,000 tasks classify into views fast", async () => {
    const d = syntheticLife(today, { tasks: 10_000 });
    const t = await time("10k tasks → today view", () => tasksForView(d.tasks, "today", today), 60) as ReturnType<typeof tasksForView>;
    expect(t.length).toBeGreaterThan(0);
    await time("10k tasks → all views", () => ["inbox", "upcoming", "someday", "completed"].map((v) => tasksForView(d.tasks, v as "inbox", today)), 200);
  });

  it("500 routines with history summarize within budget", async () => {
    const d = syntheticLife(today, { routines: 500 });
    expect(d.routineCompletions.length).toBeGreaterThan(10_000);
    await time("500 routines × 28-day history", () => d.routines.map((r) => routineHistory(r, d.routineCompletions, addDays(today, -27), today)), 4000);
  });

  it("1,000 workout sessions: summary + bests", async () => {
    const d = syntheticLife(today, { sessions: 1000 });
    await time("12-week summary over 1k sessions", () => fitnessSummary(d.sessions, null, addDays(today, -83), today, startOfWeek), 100);
    await time("bests for 8 exercises over 1k sessions", () => d.exercises.map((e) => exerciseBests(d.sessions, e.id)), 300);
  });

  it("10,000 foods, 1,000 meals, one-year plan: daily/weekly nutrition and grocery derivation", async () => {
    const d = syntheticLife(today, { foods: 10_000, meals: 1_000, planDays: 365 });
    expect(d.mealPlan.length).toBe(365 * 3);
    await time("day nutrition", () => dayNutrition(today, d.mealPlan, d.meals, d.foods), 80);
    const week = daysBetween(startOfWeek(today), addDays(startOfWeek(today), 6));
    await time("week nutrition", () => weekNutrition(week, d.mealPlan, d.meals, d.foods), 250);
    const reqs = await time("grocery derivation for a week", () => subtractPantry(deriveRequirements(d.mealPlan, d.meals, d.foods, week), []), 120) as ReturnType<typeof subtractPantry>;
    expect(reqs.length).toBeGreaterThan(0);
  });

  it("5,000 grocery records summarize and a 50-event day builds an agenda instantly", async () => {
    const g = syntheticLife(today, { groceries: 5000 });
    await time("summarize 5k groceries", () => summarizeList(g.groceries), 60);
    const b = syntheticLife(today, { eventsPerDay: 50, days: 1, tasks: 100, routines: 12 });
    const items = await time("50-event agenda", () => buildAgenda({ day: today, nowMinute: 600, events: b.events, routines: b.routines, completions: b.routineCompletions, tasks: b.tasks, program: null, templates: [], sessions: [], plan: [], meals: [] }), 60) as ReturnType<typeof buildAgenda>;
    expect(items.filter((i) => i.kind === "event").length).toBe(occurrencesOnDay(b.events, today).length);
    overview(items, 600);
  });

  it("memory repository handles a large dump and ranged loads", async () => {
    const d = syntheticLife(today, { eventsPerDay: 6, days: 365, tasks: 10_000 });
    const repo = new MemoryLifeRepository(null);
    await time("put 2k events + 10k tasks", async () => { await repo.put("events", d.events); await repo.put("tasks", d.tasks); }, 400);
    const month = await time("ranged load: one month of events", () => repo.load("events", { days: { from: "2026-09-01", to: "2026-09-30" } }), 60) as CalendarEvent[];
    expect(month.length).toBeGreaterThan(100);
    expect(month.length).toBeLessThan(d.events.length);
  });
});
