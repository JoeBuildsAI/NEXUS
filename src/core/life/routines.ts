import type { Routine, RoutineCompletion, RoutineStep, StepState } from "./models";
import { scheduleOccursOn } from "./recurrence";
import { addDays, compareDays, daysBetween, type DayKey } from "./time";

/** Steps that apply on a given day (conditional steps respect their own schedule). */
export function applicableSteps(r: Routine, day: DayKey): RoutineStep[] {
  return r.steps.filter((s) => !s.condition || scheduleOccursOn(s.condition, day)).sort((a, b) => a.order - b.order);
}

export function routineDueOn(r: Routine, day: DayKey): boolean {
  return r.enabled && !r.deletedAt && scheduleOccursOn(r.schedule, day) && applicableSteps(r, day).length > 0;
}

export interface RoutineDayState {
  routine: Routine;
  day: DayKey;
  steps: { step: RoutineStep; state: StepState | null }[];
  done: number;
  skipped: number;
  total: number;
  complete: boolean;
  dismissed: boolean;
}

export function routineDayState(r: Routine, day: DayKey, completion: RoutineCompletion | null | undefined): RoutineDayState {
  const steps = applicableSteps(r, day).map((step) => ({ step, state: completion?.steps[step.id] ?? null }));
  const done = steps.filter((s) => s.state === "done").length;
  const skipped = steps.filter((s) => s.state === "skipped").length;
  return { routine: r, day, steps, done, skipped, total: steps.length, complete: steps.length > 0 && done + skipped === steps.length, dismissed: completion?.dismissed ?? false };
}

export interface RoutineHistory {
  /** Days the routine was due in the window. */
  dueDays: number;
  completedDays: number;
  partialDays: number;
  missedDays: number;
  /** Average share of applicable steps done on due days (0–1). */
  averageCompletion: number;
  /** Consecutive fully-completed due days ending at `to` (a quiet consistency indicator). */
  consistency: number;
  recent: { day: DayKey; due: boolean; done: number; total: number }[];
}

/** History over [from, to]; `to` is usually today. Missed = due day with nothing logged and not dismissed. */
export function routineHistory(r: Routine, completions: readonly RoutineCompletion[], from: DayKey, to: DayKey): RoutineHistory {
  const byDay = new Map(completions.filter((c) => c.routineId === r.id).map((c) => [c.day, c]));
  let dueDays = 0, completedDays = 0, partialDays = 0, missedDays = 0, sum = 0;
  const recent: RoutineHistory["recent"] = [];
  for (const day of daysBetween(from, to)) {
    const due = routineDueOn(r, day);
    const st = routineDayState(r, day, byDay.get(day));
    recent.push({ day, due, done: st.done, total: st.total });
    if (!due || st.dismissed) continue;
    dueDays++;
    if (st.total) sum += st.done / st.total;
    if (st.complete && st.done > 0) completedDays++;
    else if (st.done > 0) partialDays++;
    else if (compareDays(day, to) < 0) missedDays++;
  }
  let consistency = 0;
  for (let day = to; compareDays(day, from) >= 0; day = addDays(day, -1)) {
    if (!routineDueOn(r, day)) continue;
    const st = routineDayState(r, day, byDay.get(day));
    if (st.dismissed) continue;
    if (st.complete && st.done > 0) consistency++;
    else if (day !== to) break; // today may still be in progress; any earlier gap ends the run
  }
  return { dueDays, completedDays, partialDays, missedDays, averageCompletion: dueDays ? sum / dueDays : 0, consistency, recent };
}

export const ROUTINE_TEMPLATES: { id: string; name: string; category: Routine["category"]; steps: string[]; preferredMinute: number; schedule: Routine["schedule"] }[] = [
  { id: "morning-skincare", name: "Morning Skincare", category: "skincare", steps: ["Cleanse", "Toner", "Vitamin C", "Moisturizer", "SPF"], preferredMinute: 7 * 60 + 30, schedule: { kind: "daily" } },
  { id: "evening-skincare", name: "Evening Skincare", category: "skincare", steps: ["Cleanse", "Toner", "Serum", "Moisturizer"], preferredMinute: 21 * 60 + 30, schedule: { kind: "daily" } },
  { id: "morning", name: "Morning Routine", category: "morning", steps: ["Water", "Stretch", "Shower", "Breakfast", "Plan the day"], preferredMinute: 7 * 60, schedule: { kind: "daily" } },
  { id: "hygiene", name: "Hygiene", category: "hygiene", steps: ["Brush teeth", "Floss", "Mouthwash"], preferredMinute: 22 * 60, schedule: { kind: "daily" } },
  { id: "hair", name: "Hair Care", category: "hair", steps: ["Shampoo", "Conditioner", "Leave-in"], preferredMinute: 8 * 60, schedule: { kind: "days", weekdays: [1, 4] } },
  { id: "supplements", name: "Supplements", category: "supplements", steps: ["Vitamin D", "Omega-3", "Creatine"], preferredMinute: 8 * 60 + 30, schedule: { kind: "daily" } },
  { id: "cleaning", name: "Weekly Reset", category: "cleaning", steps: ["Laundry", "Kitchen", "Desk", "Floors"], preferredMinute: 11 * 60, schedule: { kind: "days", weekdays: [0] } },
];
