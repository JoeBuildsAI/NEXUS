import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { useNavigationStore } from "@/state/navigationStore";
import { useSettingsStore } from "@/state/settingsStore";
import { occurrencesInRange, groupByDay } from "@/core/life/calendar";
import { scheduledTemplateId } from "@/core/life/fitness";
import { routineDueOn } from "@/core/life/routines";
import { summarizeList } from "@/core/life/grocery";
import { dayNutrition } from "@/core/life/nutrition";
import { tasksForView } from "@/core/life/tasks";
import { addDays, daysBetween, formatMinute, MONTH_NAMES, parseDay, startOfWeek, todayKey, WEEKDAY_SHORT } from "@/core/life/time";
import { cn } from "@/lib/utils";

/**
 * WEEKLY PLANNING — one answer to "what is happening this week?": events,
 * training, meals, routines due and what to buy. Email stays out on purpose.
 */
export function WeekSection() {
  const life = useLifeStore();
  const { openCalendar, openLife } = useNavigationStore();
  const hour12 = useSettingsStore((s) => s.profile.clockFormat === "12h");
  const today = todayKey();
  const [week, setWeek] = useState(startOfWeek(today));
  const days = daysBetween(week, addDays(week, 6));
  const events = useMemo(() => groupByDay(occurrencesInRange(life.events, week, addDays(week, 6))), [life.events, week]);
  const program = life.programs.find((p) => p.enabled) ?? null;
  const groceries = useMemo(() => summarizeList(life.groceries.filter((g) => g.week === week)), [life.groceries, week]);
  const a = parseDay(week), b = parseDay(addDays(week, 6));
  const title = a.getMonth() === b.getMonth() ? `${MONTH_NAMES[a.getMonth()]} ${a.getDate()}–${b.getDate()}` : `${MONTH_NAMES[a.getMonth()]!.slice(0, 3)} ${a.getDate()} – ${MONTH_NAMES[b.getMonth()]!.slice(0, 3)} ${b.getDate()}`;
  const workoutsPlanned = days.filter((d) => scheduledTemplateId(program, d)).length;
  const workoutsDone = life.sessions.filter((s) => s.status === "finished" && s.day >= week && s.day <= addDays(week, 6)).length;
  const mealsPlanned = life.mealPlan.filter((e) => e.day >= week && e.day <= addDays(week, 6)).length;
  const eventCount = [...events.values()].reduce((s, l) => s + l.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-5">
        <p className="font-display text-[18px] uppercase tracking-wide text-white/85">{title}</p>
        <span className="flex items-center gap-1 text-white/40"><button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" className="hover:text-white"><ChevronLeft size={14} /></button><button onClick={() => setWeek(startOfWeek(today))} className="px-1 text-[12px] hover:text-white">This week</button><button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" className="hover:text-white"><ChevronRight size={14} /></button></span>
        <p className="ml-auto font-mono text-[11.5px] tabular text-white/35">{eventCount} events · {workoutsDone}/{workoutsPlanned} workouts · {mealsPlanned} meals planned · {groceries.remaining} to buy{groceries.estimatedTotal != null ? ` · ~$${groceries.estimatedTotal}` : ""}</p>
      </div>
      <div className="rule mt-3" />
      <div className="mt-4 grid grid-cols-7 gap-x-3">
        {days.map((d) => {
          const isToday = d === today;
          const occ = events.get(d) ?? [];
          const tid = scheduledTemplateId(program, d);
          const t = life.workoutTemplates.find((x) => x.id === tid);
          const done = life.sessions.find((s) => s.day === d && s.status === "finished");
          const meals = life.mealPlan.filter((e) => e.day === d).sort((x, y) => slotOrder(x.slot) - slotOrder(y.slot));
          const routines = life.routines.filter((r) => routineDueOn(r, d)).length;
          const tasks = tasksForView(life.tasks, "upcoming", addDays(d, -1)).filter((x) => x.dueDay === d).length + (d === today ? tasksForView(life.tasks, "today", today).length : 0);
          const nutrition = dayNutrition(d, life.mealPlan, life.meals, life.foods);
          return (
            <div key={d} className={cn("min-w-0 border-t pt-2", isToday ? "border-white/60" : "border-white/[0.08]")}>
              <button onClick={() => openCalendar("day", d)} className="text-left">
                <span className={cn("text-micro", isToday ? "text-white" : "text-white/35")}>{WEEKDAY_SHORT[parseDay(d).getDay()]}</span>
                <span className={cn("ml-2 font-sans text-[17px] font-semibold tabular", isToday ? "text-white" : "text-white/60")}>{parseDay(d).getDate()}</span>
              </button>
              <Group label="Events">
                {occ.slice(0, 4).map((o) => <Line key={o.key} time={o.event.allDay ? "all day" : formatMinute(o.startMinute, hour12)} text={o.event.title} onClick={() => openCalendar("day", d)} />)}
                {occ.length > 4 && <p className="text-[11px] text-white/30">+{occ.length - 4}</p>}
                {occ.length === 0 && <Dash />}
              </Group>
              <Group label="Training">
                {t || done ? <Line text={done ? `${done.name} ✓` : t!.name} dim={!!done} onClick={() => openLife("fitness")} /> : <Dash text="rest" />}
              </Group>
              <Group label="Meals">
                {meals.map((e) => <Line key={e.id} text={life.meals.find((m) => m.id === e.mealId)?.name ?? "Meal"} dim={e.status !== "planned"} onClick={() => openLife("meals", { id: e.id })} />)}
                {meals.length === 0 && <Dash />}
                {meals.length > 0 && <p className="mt-0.5 font-mono text-[10.5px] tabular text-white/30">{Math.round(nutrition.planned.calories.value)} kcal · {Math.round(nutrition.planned.protein.value)} P{nutrition.planned.calories.complete ? "" : " †"}</p>}
              </Group>
              <Group label="Also">
                <p className="text-[11.5px] text-white/40">{[routines ? `${routines} routine${routines === 1 ? "" : "s"}` : "", tasks ? `${tasks} task${tasks === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || "—"}</p>
              </Group>
            </div>
          );
        })}
      </div>
      <div className="mt-8 grid gap-x-16 gap-y-6 lg:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between"><p className="label">Groceries this week</p><button onClick={() => openLife("groceries")} className="text-[12px] text-white/35 hover:text-white">Open →</button></div>
          <div className="rule mt-3 mb-2" />
          {groceries.remaining + groceries.purchased === 0 ? <p className="py-2 text-[13.5px] text-white/35">No list yet — build it from the meal plan in Groceries.</p> : (
            <p className="text-[13.5px] text-white/70">{groceries.remaining} to buy · {groceries.purchased} purchased{groceries.estimatedTotal != null ? ` · ~$${groceries.estimatedTotal} estimated` : groceries.unpriced ? " · no price data" : ""}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/40">{groceries.byCategory.map((c) => <span key={c.category}>{c.items.filter((g) => !g.purchased && !g.haveIt).length} {c.category}</span>)}</div>
        </div>
        <div>
          <p className="label">Week at a glance</p>
          <div className="rule mt-3 mb-2" />
          <p className="text-[13.5px] leading-relaxed text-white/60">{eventCount} event{eventCount === 1 ? "" : "s"} on the calendar. {workoutsPlanned ? `${workoutsPlanned} training day${workoutsPlanned === 1 ? "" : "s"} scheduled${workoutsDone ? `, ${workoutsDone} done` : ""}.` : "No training scheduled."} {mealsPlanned ? `${mealsPlanned} meals planned.` : "No meals planned yet."}</p>
        </div>
      </div>
    </div>
  );
}

const slotOrder = (s: string) => ({ breakfast: 0, lunch: 1, snack: 2, dinner: 3, custom: 4 })[s] ?? 5;
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mt-3"><p className="text-micro text-white/25">{label}</p><div className="mt-1 space-y-0.5">{children}</div></div>;
}
function Line({ time, text, dim, onClick }: { time?: string; text: string; dim?: boolean; onClick?: () => void }) {
  return <button onClick={onClick} className={cn("block w-full truncate text-left text-[12.5px]", dim ? "text-white/40" : "text-white/80 hover:text-white")}>{time && <span className="mr-1.5 font-mono text-[10.5px] tabular text-white/35">{time}</span>}{text}</button>;
}
function Dash({ text = "—" }: { text?: string }) {
  return <p className="text-[12px] text-white/25">{text}</p>;
}
