import type { Task } from "./models";
import { scheduleOccursOn } from "./recurrence";
import { compareDays, type DayKey } from "./time";

export type TaskView = "inbox" | "today" | "upcoming" | "someday" | "completed";

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export function taskSort(a: Task, b: Task): number {
  return (
    (a.dueDay ?? "9999") .localeCompare(b.dueDay ?? "9999") ||
    (a.dueMinute ?? 1440) - (b.dueMinute ?? 1440) ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.createdAt - b.createdAt
  );
}

/** Is the task active on `day` (due that day, flagged for Today, or recurring on that day)? */
export function taskOnDay(t: Task, day: DayKey): boolean {
  if (t.deletedAt) return false;
  if (t.recurrence) return scheduleOccursOn(t.recurrence, day);
  return t.dueDay === day || (t.today && !t.dueDay && day >= dayOf(t.createdAt));
}
function dayOf(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tasksForView(tasks: readonly Task[], view: TaskView, today: DayKey): Task[] {
  const live = tasks.filter((t) => !t.deletedAt);
  switch (view) {
    case "completed": return live.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    case "someday": return live.filter((t) => t.status === "open" && t.someday).sort(taskSort);
    case "today": return live.filter((t) => t.status === "open" && !t.someday && (taskOnDay(t, today) || (t.dueDay != null && compareDays(t.dueDay, today) < 0))).sort(taskSort);
    case "upcoming": return live.filter((t) => t.status === "open" && !t.someday && t.dueDay != null && compareDays(t.dueDay, today) > 0).sort(taskSort);
    default: return live.filter((t) => t.status === "open" && !t.someday && !t.dueDay && !t.today && !t.recurrence).sort(taskSort);
  }
}

export function isOverdue(t: Task, today: DayKey): boolean {
  return t.status === "open" && t.dueDay != null && compareDays(t.dueDay, today) < 0;
}

/** Parse a quick-add line: "Call dentist tomorrow 3pm !high #health". */
export function parseQuickAdd(input: string, today: DayKey, addDays: (k: DayKey, n: number) => DayKey, parseTime: (s: string) => number | null): { title: string; dueDay: DayKey | null; dueMinute: number | null; priority: Task["priority"]; tags: string[] } {
  let text = input.trim();
  const tags = [...text.matchAll(/#([\w-]+)/g)].map((m) => m[1]!.toLowerCase());
  text = text.replace(/#[\w-]+/g, "").trim();
  let priority: Task["priority"] = "normal";
  const pm = /!(high|low|normal)\b/i.exec(text);
  if (pm) { priority = pm[1]!.toLowerCase() as Task["priority"]; text = text.replace(pm[0], "").trim(); }
  let dueDay: DayKey | null = null;
  const dm = /\b(today|tomorrow|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.exec(text);
  if (dm) {
    const w = dm[1]!.toLowerCase();
    if (w === "today") dueDay = today;
    else if (w === "tomorrow") dueDay = addDays(today, 1);
    else {
      const idx = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(w.slice(0, 3));
      const cur = new Date(`${today}T00:00:00`).getDay();
      dueDay = addDays(today, ((idx - cur + 7) % 7) || 7);
    }
    text = text.replace(dm[0], "").trim();
  }
  let dueMinute: number | null = null;
  const tm = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b|\b(\d{1,2}:\d{2})\b/i.exec(text);
  if (tm) {
    dueMinute = parseTime(tm[1] ?? tm[2] ?? "");
    if (dueMinute != null) { text = text.replace(tm[0], "").trim(); if (!dueDay) dueDay = today; }
  }
  return { title: text.replace(/\s{2,}/g, " ").trim() || "Untitled task", dueDay, dueMinute, priority, tags };
}
