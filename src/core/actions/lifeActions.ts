import type { ActionDefinition } from "./types";
import { useNavigationStore, type CalendarView, type LifeSection } from "@/state/navigationStore";
import { useLifeStore } from "@/state/lifeStore";
import { useSettingsStore } from "@/state/settingsStore";
import { notify } from "@/state/toastStore";
import { buildAgenda, overview } from "@/core/life/today";
import { dayNutrition } from "@/core/life/nutrition";
import { routineDayState, routineDueOn } from "@/core/life/routines";
import { scheduledTemplateId } from "@/core/life/fitness";
import { summarizeList } from "@/core/life/grocery";
import { tasksForView, parseQuickAdd } from "@/core/life/tasks";
import { addDays, formatMinute, minuteOfDay, parseTimeInput, startOfWeek, todayKey, relativeDayLabel } from "@/core/life/time";
import { occurrencesOnDay } from "@/core/life/calendar";

/**
 * LIFE actions for the command engine. Read actions answer from structured
 * NEXUS data (deterministic, no model). Writes are limited to adding a task and
 * starting a workout; nothing destructive is reachable from a command.
 */
export function lifeActions(): ActionDefinition[] {
  const life = () => useLifeStore.getState();
  const hour12 = () => useSettingsStore.getState().profile.clockFormat === "12h";
  return [
    {
      id: "open-today",
      title: "Open Today",
      description: "Your day.",
      requiresConfirmation: false,
      keywords: ["today", "home", "day"],
      handler: () => { useNavigationStore.getState().navigate("home"); return { ok: true }; },
    },
    {
      id: "open-calendar",
      title: "Open Calendar",
      description: "Day, week, month, year or agenda.",
      requiresConfirmation: false,
      keywords: ["calendar", "week", "month", "agenda"],
      handler: ({ args }) => {
        const a = args as { view?: CalendarView; dayOffset?: string; day?: string };
        const day = a.day && /^d{4}-d{2}-d{2}$/.test(a.day) ? a.day : a.dayOffset ? addDays(todayKey(), Number(a.dayOffset) || 0) : todayKey();
        useNavigationStore.getState().openCalendar(a.view ?? "day", day);
        return { ok: true };
      },
    },
    {
      id: "open-life",
      title: "Open Life",
      description: "Routines, fitness, nutrition, meals, groceries, tasks.",
      requiresConfirmation: false,
      keywords: ["life", "routines", "fitness", "nutrition", "meals", "groceries", "tasks"],
      handler: ({ args }) => {
        const a = args as { section?: LifeSection; id?: string; action?: string };
        useNavigationStore.getState().openLife(a.section ?? "overview", a.id || a.action ? { id: a.id, action: a.action } : undefined);
        return { ok: true };
      },
    },
    {
      id: "add-task",
      title: "Add Task",
      description: "Create a task from the command line.",
      requiresConfirmation: false,
      keywords: ["add task", "todo", "remind me"],
      handler: async ({ args }) => {
        const text = String((args as { text?: string }).text ?? "").trim();
        if (!text) { useNavigationStore.getState().openLife("tasks"); return { ok: true }; }
        const p = parseQuickAdd(text, todayKey(), addDays, parseTimeInput);
        await life().addTask({ title: p.title, dueDay: p.dueDay, dueMinute: p.dueMinute, priority: p.priority, tags: p.tags, today: !p.dueDay });
        notify.success("Task added", p.dueDay ? `${p.title} · ${relativeDayLabel(p.dueDay, todayKey())}${p.dueMinute != null ? ` ${formatMinute(p.dueMinute, hour12())}` : ""}` : p.title);
        return { ok: true, message: p.title };
      },
    },
    {
      id: "start-workout",
      title: "Start Workout",
      description: "Start today's scheduled workout or a named template.",
      requiresConfirmation: false,
      keywords: ["start workout", "workout", "train"],
      handler: async ({ args }) => {
        const s = life();
        const name = String((args as { name?: string }).name ?? "").toLowerCase();
        const active = s.sessions.find((x) => x.status === "active");
        if (active) { useNavigationStore.getState().openLife("fitness", { id: active.id, action: "resume" }); return { ok: true, message: "Resuming" }; }
        const byName = name ? s.workoutTemplates.find((t) => t.name.toLowerCase().includes(name) || (t.label ?? "").toLowerCase().includes(name)) : null;
        const tid = byName?.id ?? scheduledTemplateId(s.programs.find((p) => p.enabled) ?? null, todayKey());
        if (!tid) { useNavigationStore.getState().openLife("fitness"); notify.neutral("No workout scheduled", "Pick a template to start."); return { ok: true }; }
        await s.startWorkout(tid);
        useNavigationStore.getState().openLife("fitness", { action: "resume" });
        return { ok: true };
      },
    },
    {
      id: "life-query",
      title: "Life Query",
      description: "Answer from your own data.",
      requiresConfirmation: false,
      keywords: ["protein", "calories", "dinner", "groceries", "routine", "tomorrow", "my day"],
      handler: ({ args }) => {
        const metric = String((args as { metric?: string }).metric ?? "day");
        const s = life();
        const today = todayKey();
        const nav = useNavigationStore.getState();
        const h12 = hour12();
        switch (metric) {
          case "protein":
          case "calories": {
            const d = dayNutrition(today, s.mealPlan, s.meals, s.foods);
            const k = metric === "protein" ? "protein" : "calories";
            const t = s.targets[k];
            const unit = k === "protein" ? "g" : "kcal";
            notify.info(`${metric === "protein" ? "Protein" : "Calories"} today`, `Eaten ${Math.round(d.consumed[k].value)} ${unit} · planned ${Math.round(d.planned[k].value)} ${unit}${t ? ` · target ${t}` : ""}${d.planned[k].complete ? "" : " · partly unknown"}`);
            nav.openLife("nutrition");
            return { ok: true };
          }
          case "dinner":
          case "lunch":
          case "breakfast": {
            const e = s.mealPlan.find((x) => x.day === today && x.slot === metric);
            const m = e ? s.meals.find((x) => x.id === e.mealId) : null;
            notify.info(`${metric.charAt(0).toUpperCase() + metric.slice(1)} tonight`.replace("tonight", metric === "dinner" ? "tonight" : "today"), m ? `${m.name}${e?.status !== "planned" ? ` · ${e?.status}` : ""}` : "Nothing planned.");
            nav.openLife("meals", e ? { id: e.id } : undefined);
            return { ok: true };
          }
          case "groceries": {
            const sum = summarizeList(s.groceries.filter((g) => g.week === startOfWeek(today) || g.week === "manual"));
            notify.info("Groceries", sum.remaining ? `${sum.remaining} item${sum.remaining === 1 ? "" : "s"} still to buy${sum.estimatedTotal != null ? ` · ~$${sum.estimatedTotal}` : ""}` : "Nothing left on this week's list.");
            nav.openLife("groceries");
            return { ok: true };
          }
          case "routines": {
            const due = s.routines.filter((r) => routineDueOn(r, today)).map((r) => routineDayState(r, today, s.routineCompletions.find((c) => c.routineId === r.id && c.day === today)));
            const open = due.filter((d) => !d.complete && !d.dismissed);
            notify.info("Routines", open.length ? open.map((d) => `${d.routine.name} ${d.done}/${d.total}`).join(" · ") : "Everything is done.");
            nav.openLife("routines");
            return { ok: true };
          }
          case "workout": {
            const tid = scheduledTemplateId(s.programs.find((p) => p.enabled) ?? null, today);
            const t = s.workoutTemplates.find((x) => x.id === tid);
            notify.info("Workout", t ? `${t.name} · ${t.exercises.length} exercises` : "Rest day.");
            nav.openLife("fitness");
            return { ok: true };
          }
          case "tomorrow": {
            const day = addDays(today, 1);
            const occ = occurrencesOnDay(s.events, day);
            const tasks = tasksForView(s.tasks, "upcoming", today).filter((t) => t.dueDay === day);
            notify.info("Tomorrow", `${occ.length} event${occ.length === 1 ? "" : "s"}${occ[0] ? ` · first ${occ[0].event.allDay ? "all day" : formatMinute(occ[0].startMinute, h12)} ${occ[0].event.title}` : ""}${tasks.length ? ` · ${tasks.length} task${tasks.length === 1 ? "" : "s"} due` : ""}`);
            nav.openCalendar("day", day);
            return { ok: true };
          }
          default: {
            const items = buildAgenda({ day: today, nowMinute: minuteOfDay(new Date()), events: s.events, routines: s.routines, completions: s.routineCompletions, tasks: s.tasks, program: s.programs.find((p) => p.enabled) ?? null, templates: s.workoutTemplates, sessions: s.sessions, plan: s.mealPlan, meals: s.meals });
            const ov = overview(items, minuteOfDay(new Date()));
            notify.info("Your day", `${items.length} items · ${ov.completed.length} done${ov.next ? ` · next ${ov.next.minute != null ? formatMinute(ov.next.minute, h12) : ""} ${ov.next.title}` : ""}`);
            nav.navigate("home");
            return { ok: true };
          }
        }
      },
    },
  ];
}
