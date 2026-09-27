import { useMemo } from "react";
import { useLifeStore } from "@/state/lifeStore";
import { useNavigationStore } from "@/state/navigationStore";
import { useSettingsStore } from "@/state/settingsStore";
import { routineDayState, routineDueOn, routineHistory } from "@/core/life/routines";
import { scheduledTemplateId, fitnessSummary } from "@/core/life/fitness";
import { dayNutrition, targetProgress } from "@/core/life/nutrition";
import { summarizeList } from "@/core/life/grocery";
import { tasksForView } from "@/core/life/tasks";
import { addDays, formatMinute, startOfWeek, todayKey } from "@/core/life/time";
import { cn } from "@/lib/utils";

/** Calm overview: today across every LIFE domain — no wall of cards, just aligned figures. */
export function LifeOverview() {
  const life = useLifeStore();
  const openLife = useNavigationStore((s) => s.openLife);
  const hour12 = useSettingsStore((s) => s.profile.clockFormat === "12h");
  const today = todayKey();
  const week = startOfWeek(today);
  const routines = useMemo(() => life.routines.filter((r) => routineDueOn(r, today)).map((r) => routineDayState(r, today, life.routineCompletions.find((c) => c.routineId === r.id && c.day === today))), [life.routines, life.routineCompletions, today]);
  const program = life.programs.find((p) => p.enabled) ?? null;
  const templateId = scheduledTemplateId(program, today);
  const template = life.workoutTemplates.find((t) => t.id === templateId) ?? null;
  const active = life.sessions.find((s) => s.status === "active");
  const doneToday = life.sessions.find((s) => s.day === today && s.status === "finished");
  const workoutEvent = life.events.find((e) => e.day === today && e.category === "fitness");
  const nutrition = useMemo(() => dayNutrition(today, life.mealPlan, life.meals, life.foods), [today, life.mealPlan, life.meals, life.foods]);
  const progress = targetProgress(nutrition.consumed, life.targets);
  const meals = life.mealPlan.filter((e) => e.day === today).sort((a, b) => (a.minute ?? slotMinute(a.slot)) - (b.minute ?? slotMinute(b.slot)));
  const groceries = summarizeList(life.groceries.filter((g) => g.week === week || g.week === "manual"));
  const tasks = tasksForView(life.tasks, "today", today);
  const summary = useMemo(() => fitnessSummary(life.sessions, program, addDays(today, -27), today, (d) => startOfWeek(d)), [life.sessions, program, today]);
  const consistency = useMemo(() => life.routines.filter((r) => r.enabled).map((r) => ({ r, h: routineHistory(r, life.routineCompletions, addDays(today, -13), today) })), [life.routines, life.routineCompletions, today]);

  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-2 xl:grid-cols-3">
      <Block title="Routines" onOpen={() => openLife("routines")}>
        {routines.length === 0 && <Muted>No routines due today.</Muted>}
        {routines.map((s) => (
          <Row key={s.routine.id} label={s.routine.name} value={s.dismissed ? "not today" : `${s.done}/${s.total}`} dim={s.complete || s.dismissed} bar={s.total ? s.done / s.total : 0} />
        ))}
        {consistency.some((c) => c.h.consistency >= 3) && <p className="mt-3 text-[11.5px] text-white/30">{consistency.filter((c) => c.h.consistency >= 3).map((c) => `${c.r.name} · ${c.h.consistency} days`).join(" · ")}</p>}
      </Block>

      <Block title="Fitness" onOpen={() => openLife("fitness")}>
        {active ? <Row label={active.name} value="in progress" /> : doneToday ? <Row label={doneToday.name} value="complete" dim /> : template ? <Row label={`${template.name} · ${template.exercises.length} exercises`} value={workoutEvent ? `starts ${formatMinute(workoutEvent.startMinute, hour12)}` : "scheduled"} /> : <Muted>Rest day{program ? "" : " · no program"}.</Muted>}
        <p className="mt-3 text-[11.5px] text-white/30">Last 4 weeks · {summary.sessions} sessions · {Math.round(summary.totalVolume).toLocaleString()} volume{summary.adherence != null ? ` · ${Math.round(summary.adherence * 100)}% adherence` : ""}</p>
      </Block>

      <Block title="Nutrition" onOpen={() => openLife("nutrition")}>
        {nutrition.entries === 0 && <Muted>No meals planned today.</Muted>}
        {nutrition.entries > 0 && progress.slice(0, 4).map((p) => (
          <Row key={p.key} label={p.key === "calories" ? "Calories" : p.key.charAt(0).toUpperCase() + p.key.slice(1)} value={`${Math.round(p.value)}${p.target ? ` / ${p.target}` : ""}${p.key === "calories" ? " kcal" : " g"}`} bar={p.ratio ?? undefined} />
        ))}
        {nutrition.entries > 0 && !nutrition.consumed.calories.complete && <p className="mt-2 text-[11.5px] text-white/30">Some ingredients have unknown nutrition — totals are partial, not zeroed.</p>}
      </Block>

      <Block title="Meals" onOpen={() => openLife("meals")}>
        {meals.length === 0 && <Muted>Nothing planned.</Muted>}
        {meals.map((e) => <Row key={e.id} label={`${cap(e.slot)} · ${life.meals.find((m) => m.id === e.mealId)?.name ?? "Meal"}`} value={e.status === "planned" ? formatMinute(e.minute ?? slotMinute(e.slot), hour12) : e.status} dim={e.status !== "planned"} />)}
      </Block>

      <Block title="Groceries" onOpen={() => openLife("groceries")}>
        {groceries.remaining + groceries.purchased === 0 ? <Muted>No list for this week yet.</Muted> : (
          <>
            <Row label={`${groceries.remaining} remaining`} value={groceries.estimatedTotal != null ? `~$${groceries.estimatedTotal}` : groceries.unpriced ? "no prices" : ""} />
            {groceries.purchased > 0 && <Row label={`${groceries.purchased} purchased`} value="" dim />}
          </>
        )}
      </Block>

      <Block title="Tasks" onOpen={() => openLife("tasks")}>
        {tasks.length === 0 && <Muted>Nothing due today.</Muted>}
        {tasks.slice(0, 5).map((t) => <Row key={t.id} label={t.title} value={t.dueMinute != null ? formatMinute(t.dueMinute, hour12) : t.priority === "high" ? "high" : ""} />)}
        {tasks.length > 5 && <p className="mt-1 text-[11.5px] text-white/30">+{tasks.length - 5} more</p>}
      </Block>
    </div>
  );
}

const slotMinute = (slot: string) => ({ breakfast: 8 * 60, lunch: 12 * 60 + 30, dinner: 19 * 60, snack: 15 * 60 + 30, custom: 17 * 60 })[slot] ?? 12 * 60;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Block({ title, children, onOpen }: { title: string; children: React.ReactNode; onOpen: () => void }) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <p className="label">{title}</p>
        <button onClick={onOpen} className="text-[12px] text-white/35 hover:text-white">Open →</button>
      </div>
      <div className="rule mt-3 mb-2" />
      {children}
    </section>
  );
}
function Row({ label, value, dim, bar }: { label: string; value: string; dim?: boolean; bar?: number }) {
  return (
    <div className={cn("py-1.5", dim && "opacity-50")}>
      <div className="flex items-baseline justify-between gap-4 text-[14px]">
        <span className="truncate text-white/85">{label}</span>
        <span className="shrink-0 font-mono text-[12.5px] tabular text-white/55">{value}</span>
      </div>
      {bar != null && <div className="mt-1 h-px w-full bg-white/10"><div className="h-px bg-white/70" style={{ width: `${Math.min(100, Math.round(bar * 100))}%` }} /></div>}
    </div>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-[13.5px] text-white/35">{children}</p>;
}
