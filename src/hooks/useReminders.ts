import { useEffect, useRef } from "react";
import { useLifeStore } from "@/state/lifeStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useNavigationStore } from "@/state/navigationStore";
import { notify } from "@/state/toastStore";
import { buildAgenda, type AgendaItem } from "@/core/life/today";
import { minuteOfDay, todayKey, formatMinute } from "@/core/life/time";
import { useModeStore } from "@/state/modeStore";

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotificationPermissionState;
}
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission as NotificationPermissionState;
  try {
    return (await Notification.requestPermission()) as NotificationPermissionState;
  } catch {
    return "denied";
  }
}

/** Is `minute` inside quiet hours [start, end) (crossing midnight allowed)? */
export function inQuietHours(minute: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * Local reminders: once per minute, look at Today's agenda and surface items
 * whose start is `leadMinutes` away. Opt-in, per-domain, quiet-hour aware,
 * suppressed in Gaming and Focus modes, at most one reminder per item per day.
 */
export function useReminders() {
  const fired = useRef<Set<string>>(new Set());
  const dayRef = useRef(todayKey());
  useEffect(() => {
    const tick = () => {
      const settings = useSettingsStore.getState().life;
      if (!settings.reminders) return;
      const mode = useModeStore.getState().current;
      if (mode === "gaming" || mode === "focus") return;
      const now = new Date();
      const day = todayKey(now);
      if (day !== dayRef.current) { dayRef.current = day; fired.current.clear(); }
      const minute = minuteOfDay(now);
      if (inQuietHours(minute, settings.quietStart, settings.quietEnd)) return;
      const life = useLifeStore.getState();
      if (life.status !== "ready") return;
      const items = buildAgenda({ day, nowMinute: minute, events: life.events, routines: life.routines, completions: life.routineCompletions, tasks: life.tasks, program: life.programs.find((p) => p.enabled) ?? null, templates: life.workoutTemplates, sessions: life.sessions, plan: life.mealPlan, meals: life.meals, workoutDefaultMinute: settings.workoutMinute });
      const allow: Record<AgendaItem["kind"], boolean> = { event: settings.remindEvents, workout: settings.remindWorkouts, routine: settings.remindRoutines, meal: settings.remindMeals, task: settings.remindTasks };
      for (const it of items) {
        if (it.minute == null || it.completed || it.dismissed || !allow[it.kind]) continue;
        const delta = it.minute - minute;
        if (delta !== settings.leadMinutes) continue;
        if (fired.current.has(it.key)) continue;
        fired.current.add(it.key);
        const hour12 = useSettingsStore.getState().profile.clockFormat === "12h";
        const body = `${formatMinute(it.minute, hour12)} · ${it.kind === "event" ? "Event" : it.kind === "workout" ? "Workout" : it.kind === "routine" ? "Routine" : it.kind === "meal" ? "Meal" : "Task"}`;
        notify.neutral(it.title, body);
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && !document.hasFocus()) {
          try {
            const n = new Notification(it.title, { body, silent: true, tag: it.key });
            n.onclick = () => { useNavigationStore.getState().navigate("home"); window.focus(); };
          } catch { /* notification unavailable */ }
        }
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
}
