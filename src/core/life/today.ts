import { occurrencesOnDay } from "./calendar";
import { scheduledTemplateId } from "./fitness";
import type { CalendarEvent, FitnessProgram, Meal, MealPlanEntry, Routine, RoutineCompletion, Task, WorkoutSession, WorkoutTemplate } from "./models";
import { routineDayState, routineDueOn } from "./routines";
import { tasksForView } from "./tasks";
import type { DayKey, MinuteOfDay } from "./time";

/**
 * TODAY aggregation. Each source stays owned by its domain; Today only
 * references them through normalized AgendaItems. No records are duplicated.
 */
export type AgendaKind = "event" | "routine" | "workout" | "meal" | "task";
export type AgendaPhase = "now" | "next" | "later" | "completed" | "past";

export interface AgendaItem {
  key: string;
  kind: AgendaKind;
  refId: string;
  title: string;
  /** Minute of day; null = unscheduled (all-day / floating). */
  minute: MinuteOfDay | null;
  endMinute: MinuteOfDay | null;
  detail: string;
  /** 0–1 for progress-like items (routines), null otherwise. */
  progress: number | null;
  completed: boolean;
  /** Dismissed / skipped items recede but stay visible in Completed. */
  dismissed: boolean;
  category: string;
  /** Local items can be rescheduled/completed from Today. */
  local: boolean;
}

export interface CommsSignal {
  important: number;
  receipts: number;
  shipments: number;
  security: number;
}

export interface TodayInput {
  day: DayKey;
  nowMinute: MinuteOfDay;
  events: readonly CalendarEvent[];
  routines: readonly Routine[];
  completions: readonly RoutineCompletion[];
  tasks: readonly Task[];
  program: FitnessProgram | null;
  templates: readonly WorkoutTemplate[];
  sessions: readonly WorkoutSession[];
  plan: readonly MealPlanEntry[];
  meals: readonly Meal[];
  /** Default minute for workouts without a calendar slot. */
  workoutDefaultMinute?: MinuteOfDay;
  mealDefaultMinutes?: Partial<Record<MealPlanEntry["slot"], MinuteOfDay>>;
}

export const DEFAULT_MEAL_MINUTES: Record<MealPlanEntry["slot"], MinuteOfDay> = { breakfast: 8 * 60, lunch: 12 * 60 + 30, dinner: 19 * 60, snack: 15 * 60 + 30, custom: 17 * 60 };

export function buildAgenda(i: TodayInput): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const o of occurrencesOnDay(i.events, i.day)) {
    const ended = !o.event.allDay && o.endMinute <= i.nowMinute;
    items.push({ key: `event:${o.key}`, kind: "event", refId: o.event.id, title: o.event.title, minute: o.event.allDay ? null : o.startMinute, endMinute: o.event.allDay ? null : o.endMinute, detail: o.event.allDay ? "All day" : o.event.location ?? "", progress: null, completed: ended, dismissed: false, category: o.event.category, local: o.event.source === "local" && !o.event.readOnly });
  }
  const byRoutine = new Map(i.completions.filter((c) => c.day === i.day).map((c) => [c.routineId, c]));
  for (const r of i.routines) {
    if (!routineDueOn(r, i.day)) continue;
    const st = routineDayState(r, i.day, byRoutine.get(r.id));
    const dur = r.estimatedMinutes ?? null;
    items.push({ key: `routine:${r.id}`, kind: "routine", refId: r.id, title: r.name, minute: r.preferredMinute ?? null, endMinute: r.preferredMinute != null && dur ? r.preferredMinute + dur : null, detail: `${st.done} / ${st.total}`, progress: st.total ? st.done / st.total : 0, completed: st.complete, dismissed: st.dismissed, category: "routine", local: true });
  }
  const tid = scheduledTemplateId(i.program, i.day);
  const todaySessions = i.sessions.filter((s) => s.day === i.day && !s.deletedAt);
  const active = todaySessions.find((s) => s.status === "active");
  const finished = todaySessions.find((s) => s.status === "finished");
  if (tid || active || finished) {
    const t = i.templates.find((x) => x.id === (active?.templateId ?? finished?.templateId ?? tid));
    const name = active?.name ?? finished?.name ?? t?.name ?? "Workout";
    const detail = active ? "In progress" : finished ? "Complete" : `${t?.exercises.length ?? 0} exercises`;
    items.push({ key: `workout:${i.day}`, kind: "workout", refId: active?.id ?? finished?.id ?? tid ?? "", title: name, minute: i.workoutDefaultMinute ?? 17 * 60 + 30, endMinute: null, detail, progress: null, completed: !!finished, dismissed: false, category: "fitness", local: true });
  }
  for (const e of i.plan) {
    if (e.day !== i.day || e.deletedAt) continue;
    const meal = i.meals.find((m) => m.id === e.mealId);
    const minute = e.minute ?? i.mealDefaultMinutes?.[e.slot] ?? DEFAULT_MEAL_MINUTES[e.slot];
    items.push({ key: `meal:${e.id}`, kind: "meal", refId: e.id, title: meal?.name ?? "Meal", minute, endMinute: null, detail: e.slot.charAt(0).toUpperCase() + e.slot.slice(1) + (e.status === "planned" ? "" : ` · ${e.status}`), progress: null, completed: e.status === "eaten" || e.status === "replaced" || e.status === "partial", dismissed: e.status === "skipped", category: "meal", local: true });
  }
  for (const t of tasksForView(i.tasks, "today", i.day)) {
    items.push({ key: `task:${t.id}`, kind: "task", refId: t.id, title: t.title, minute: t.dueMinute ?? null, endMinute: t.dueMinute != null && t.durationMinutes ? t.dueMinute + t.durationMinutes : null, detail: t.dueDay && t.dueDay < i.day ? "Overdue" : t.priority === "high" ? "High priority" : "", progress: null, completed: t.status === "done", dismissed: false, category: "task", local: true });
  }
  // Completed tasks from today
  for (const t of i.tasks) {
    if (t.status !== "done" || t.deletedAt || !t.completedAt) continue;
    const d = new Date(t.completedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (key !== i.day || items.some((x) => x.refId === t.id)) continue;
    items.push({ key: `task:${t.id}`, kind: "task", refId: t.id, title: t.title, minute: t.dueMinute ?? null, endMinute: null, detail: "Done", progress: null, completed: true, dismissed: false, category: "task", local: true });
  }
  // Timed items in order; floating ("anytime") items after them.
  return items.sort((a, b) => (a.minute ?? 1e9) - (b.minute ?? 1e9) || a.title.localeCompare(b.title));
}

/** NOW / NEXT / LATER / COMPLETED phases relative to the current minute. */
export function phaseOf(item: AgendaItem, nowMinute: MinuteOfDay): AgendaPhase {
  if (item.completed || item.dismissed) return "completed";
  if (item.minute == null) return "later";
  const end = item.endMinute ?? item.minute + 30;
  if (item.minute <= nowMinute && nowMinute < end) return "now";
  if (item.minute > nowMinute) return "next";
  return "past";
}

export interface TodayOverview {
  items: AgendaItem[];
  now: AgendaItem[];
  next: AgendaItem | null;
  later: AgendaItem[];
  past: AgendaItem[];
  completed: AgendaItem[];
  counts: Record<AgendaKind, { total: number; done: number }>;
  routineStepsRemaining: number;
}

export function overview(items: readonly AgendaItem[], nowMinute: MinuteOfDay, routineStates: readonly { done: number; total: number; dismissed: boolean }[] = []): TodayOverview {
  const phased = items.map((it) => [it, phaseOf(it, nowMinute)] as const);
  const now = phased.filter(([, p]) => p === "now").map(([i]) => i);
  const upcoming = phased.filter(([, p]) => p === "next").map(([i]) => i);
  const later = upcoming.slice(1).concat(phased.filter(([i, p]) => p === "later" && i.minute == null).map(([i]) => i));
  const counts = {} as TodayOverview["counts"];
  for (const k of ["event", "routine", "workout", "meal", "task"] as AgendaKind[]) counts[k] = { total: items.filter((i) => i.kind === k).length, done: items.filter((i) => i.kind === k && (i.completed || i.dismissed)).length };
  return {
    items: [...items],
    now,
    next: upcoming[0] ?? null,
    later,
    past: phased.filter(([, p]) => p === "past").map(([i]) => i),
    completed: phased.filter(([, p]) => p === "completed").map(([i]) => i),
    counts,
    routineStepsRemaining: routineStates.filter((r) => !r.dismissed).reduce((s, r) => s + Math.max(0, r.total - r.done), 0),
  };
}

export function greeting(hour: number, name: string | null): string {
  const part = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : part;
}
