import { beforeEach, describe, expect, it } from "vitest";
import { MemoryLifeRepository } from "@/core/life/repository";
import { setLifeRepository } from "@/providers/life";
import { useLifeStore } from "./lifeStore";
import { todayKey, addDays, startOfWeek } from "@/core/life/time";
import { routineDayState } from "@/core/life/routines";
import { dayNutrition } from "@/core/life/nutrition";
import { summarizeList } from "@/core/life/grocery";

const today = todayKey();

describe("life store over the repository", () => {
  beforeEach(async () => {
    setLifeRepository(new MemoryLifeRepository(null));
    useLifeStore.setState({ status: "idle" });
    await useLifeStore.getState().load({ force: true });
  });

  it("starts empty, adds and removes sample data without leaving demo rows behind", async () => {
    expect(useLifeStore.getState().counts?.routines).toBe(0);
    await useLifeStore.getState().addSampleData();
    const s = useLifeStore.getState();
    expect(s.hasDemo).toBe(true);
    expect(s.routines.length).toBe(4);
    expect(s.targets.calories).toBe(2400);
    await s.removeSampleData();
    expect(useLifeStore.getState().routines).toHaveLength(0);
    expect(useLifeStore.getState().hasDemo).toBe(false);
    expect(useLifeStore.getState().targets.calories).toBe(2400); // user-visible targets survive; they are not rows
  });

  it("routine step logging persists and survives a reload from storage", async () => {
    const st = useLifeStore.getState();
    const r = await st.saveRoutine({ name: "Skin", category: "skincare", schedule: { kind: "daily" }, enabled: true, steps: [{ id: "", title: "Cleanse", order: 0 }, { id: "", title: "SPF", order: 1 }] });
    expect(r.steps.every((x) => x.id)).toBe(true);
    await st.setStep(r.id, today, r.steps[0]!.id, "done");
    await st.completeRoutine(r.id, today);
    let completion = useLifeStore.getState().routineCompletions.find((c) => c.routineId === r.id && c.day === today)!;
    expect(routineDayState(r, today, completion).complete).toBe(true);
    await st.setStep(r.id, today, r.steps[1]!.id, null);
    await useLifeStore.getState().load({ force: true });
    completion = useLifeStore.getState().routineCompletions.find((c) => c.routineId === r.id && c.day === today)!;
    expect(routineDayState(r, today, completion)).toMatchObject({ done: 1, total: 2, complete: false });
    await st.dismissRoutine(r.id, today, true);
    expect(useLifeStore.getState().routineCompletions.find((c) => c.routineId === r.id)!.dismissed).toBe(true);
  });

  it("workout session lifecycle: start (with previous weights), log sets, add/remove, skip, finish; one active at a time", async () => {
    await useLifeStore.getState().addSampleData();
    const st = useLifeStore.getState();
    const s = await st.startWorkout("wt-push");
    expect(s.status).toBe("active");
    expect(s.exercises[0]!.sets[0]!.weight).toBe(75); // previous session was 80 − 5
    const again = await st.startWorkout("wt-legs");
    expect(again.id).toBe(s.id); // never two active sessions
    const ex = s.exercises[0]!;
    await st.updateSet(s.id, ex.id, ex.sets[0]!.id, { weight: 85, reps: 8, done: true });
    await st.addSet(s.id, ex.id);
    await st.removeSet(s.id, ex.id, ex.sets[1]!.id);
    await st.skipExercise(s.id, s.exercises[2]!.id, true);
    let cur = useLifeStore.getState().sessions.find((x) => x.id === s.id)!;
    expect(cur.exercises[0]!.sets).toHaveLength(3);
    expect(cur.exercises[0]!.sets[0]).toMatchObject({ weight: 85, reps: 8, done: true });
    expect(cur.exercises[2]!.skipped).toBe(true);
    await st.finishWorkout(s.id);
    await useLifeStore.getState().load({ force: true });
    cur = useLifeStore.getState().sessions.find((x) => x.id === s.id)!;
    expect(cur.status).toBe("finished");
    expect(cur.finishedAt).not.toBeNull();
  });

  it("meal logging changes consumed totals; groceries regenerate from the plan and keep purchased flags", async () => {
    await useLifeStore.getState().addSampleData();
    const st = useLifeStore.getState();
    const dinner = st.mealPlan.find((e) => e.day === today && e.slot === "dinner")!;
    const before = dayNutrition(today, st.mealPlan, st.meals, st.foods).consumed.calories.value;
    await st.logMeal(dinner.id, "eaten");
    const s2 = useLifeStore.getState();
    const after = dayNutrition(today, s2.mealPlan, s2.meals, s2.foods).consumed.calories.value;
    expect(after).toBeGreaterThan(before);
    const week = startOfWeek(today);
    const list = await s2.regenerateGroceries(week);
    expect(list.length).toBeGreaterThan(3);
    const rice = list.find((g) => g.foodId === "fd-rice");
    // 1 kg cooked rice in the pantry covers part of the week's need
    expect(rice == null || rice.quantity < 1600).toBe(true);
    const first = list[0]!;
    await useLifeStore.getState().patch("groceries", first.id, { purchased: true });
    await useLifeStore.getState().addGroceryItem(week, { name: "Paper towels", quantity: 1, unit: "piece", category: "household" });
    const regen = await useLifeStore.getState().regenerateGroceries(week);
    expect(regen.find((g) => g.id === first.id)?.purchased).toBe(true);
    expect(regen.some((g) => g.name === "Paper towels")).toBe(true);
    const sum = summarizeList(regen);
    expect(sum.estimatedTotal).not.toBeNull();
    expect(sum.unpriced).toBeGreaterThanOrEqual(1); // manual item has no price
  });

  it("calendar: create, move, delete one occurrence of a series, delete", async () => {
    const st = useLifeStore.getState();
    const ev = await st.createEvent({ title: "Standup", day: today, startMinute: 600, endDay: today, endMinute: 630, allDay: false, category: "work", recurrence: { freq: "daily" } });
    await st.deleteEvent(ev.id, addDays(today, 1));
    let cur = useLifeStore.getState().events.find((e) => e.id === ev.id)!;
    expect(cur.recurrence?.exceptions).toEqual([addDays(today, 1)]);
    await st.moveEvent(ev.id, addDays(today, 2), 720);
    cur = useLifeStore.getState().events.find((e) => e.id === ev.id)!;
    expect(cur).toMatchObject({ day: addDays(today, 2), startMinute: 720, endMinute: 750 });
    await st.deleteEvent(ev.id);
    expect(useLifeStore.getState().events.some((e) => e.id === ev.id)).toBe(false);
  });

  it("tasks: quick toggle, recurring completion rolls forward", async () => {
    const st = useLifeStore.getState();
    const t = await st.addTask({ title: "Water plants", recurrence: { kind: "daily" }, dueDay: today });
    await st.toggleTask(t.id);
    const cur = useLifeStore.getState().tasks.find((x) => x.id === t.id)!;
    expect(cur.status).toBe("open");
    expect(cur.dueDay).toBe(addDays(today, 1));
    const plain = await st.addTask({ title: "One-off" });
    await st.toggleTask(plain.id);
    expect(useLifeStore.getState().tasks.find((x) => x.id === plain.id)!.status).toBe("done");
  });
});

describe("sample data idempotency", () => {
  it("loading sample data twice never duplicates rows", async () => {
    setLifeRepository(new MemoryLifeRepository(null));
    useLifeStore.setState({ status: "idle" });
    await useLifeStore.getState().load({ force: true });
    await useLifeStore.getState().addSampleData();
    const before = useLifeStore.getState().counts!;
    await useLifeStore.getState().addSampleData();
    expect(useLifeStore.getState().counts).toEqual(before);
  });
});
