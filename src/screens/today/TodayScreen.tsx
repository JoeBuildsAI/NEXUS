import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Circle, Play } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useNavigationStore } from "@/state/navigationStore";
import { useClock } from "@/hooks/useClock";
import { buildAgenda, greeting, overview, phaseOf, type AgendaItem, type AgendaPhase } from "@/core/life/today";
import { routineDayState, routineDueOn } from "@/core/life/routines";
import { dayNutrition, targetProgress } from "@/core/life/nutrition";
import { summarizeList } from "@/core/life/grocery";
import { formatDayLong, formatMinute, minuteOfDay, startOfWeek, todayKey } from "@/core/life/time";
import { getProviders } from "@/providers";
import { config } from "@/core/config";
import { useDevStore } from "@/state/devStore";
import { summarize } from "@/core/email/classify";
import { Button } from "@/components/ui";
import { SessionLine } from "@/screens/home/SessionLine";
import { ModeSwitcher } from "@/components/shell/ModeSwitcher";
import { useTelemetryStore } from "@/state/telemetryStore";
import { HEALTH_META } from "@/core/safety/health";
import { formatTime } from "@/hooks/useClock";
import { cn } from "@/lib/utils";

/**
 * TODAY — the Home of NEXUS. A chronological day surface that references
 * calendar, routines, workouts, meals and tasks (each owned by its domain),
 * plus quiet Communications signals. System telemetry lives under System.
 */
export function TodayScreen() {
  const now = useClock(30_000);
  const day = todayKey(now);
  const nowMinute = minuteOfDay(now);
  const life = useLifeStore();
  const name = useSettingsStore((s) => s.profile.name);
  const hour12 = useSettingsStore((s) => s.profile.clockFormat === "12h");
  const { openLife, openCalendar, openCommunications, navigate } = useNavigationStore();
  const emailConnected = useDevStore((s) => s.emailConnected);
  const [mail, setMail] = useState<{ important: number; receipts: number; shipments: number; security: number; demo: boolean } | null>(null);
  const health = useTelemetryStore((s) => s.snapshot?.health);
  const healthMeta = health ? HEALTH_META[health] : null;

  useEffect(() => { void life.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const email = getProviders().email;
    void (async () => {
      const mode = email.mode ? await email.mode() : "demo";
      // The desktop Today never shows demo-inbox counts as if they were the user's mail.
      if (mode === "none" || (mode === "demo" && config.isTauri)) return setMail(null);
      const msgs = await email.getMessages();
      if (cancelled) return;
      const s = summarize(msgs, start.getTime());
      const shipments = msgs.filter((m) => m.timestamp >= start.getTime() && m.category === "order").length;
      setMail({ important: s.important, receipts: s.receipts, shipments, security: s.security, demo: mode === "demo" });
    })().catch(() => { if (!cancelled) setMail(null); });
    return () => { cancelled = true; };
  }, [emailConnected]);

  const program = life.programs.find((p) => p.enabled) ?? null;
  const items = useMemo(() => buildAgenda({ day, nowMinute, events: life.events, routines: life.routines, completions: life.routineCompletions, tasks: life.tasks, program, templates: life.workoutTemplates, sessions: life.sessions, plan: life.mealPlan, meals: life.meals }), [day, nowMinute, life.events, life.routines, life.routineCompletions, life.tasks, program, life.workoutTemplates, life.sessions, life.mealPlan, life.meals]);
  const routineStates = useMemo(() => life.routines.filter((r) => routineDueOn(r, day)).map((r) => routineDayState(r, day, life.routineCompletions.find((c) => c.routineId === r.id && c.day === day))), [life.routines, life.routineCompletions, day]);
  const ov = useMemo(() => overview(items, nowMinute, routineStates), [items, nowMinute, routineStates]);
  const nutrition = useMemo(() => dayNutrition(day, life.mealPlan, life.meals, life.foods), [day, life.mealPlan, life.meals, life.foods]);
  const groceries = useMemo(() => summarizeList(life.groceries.filter((g) => g.week === startOfWeek(day) || g.week === "manual")), [life.groceries, day]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const empty = life.status === "ready" && items.length === 0;

  const act = (item: AgendaItem) => {
    switch (item.kind) {
      case "event": return openCalendar("day", day);
      case "routine": return setExpanded((e) => (e === item.key ? null : item.key));
      case "workout": return openLife("fitness", { id: item.refId, action: item.detail === "In progress" ? "resume" : "start" });
      case "meal": return openLife("meals", { id: item.refId });
      case "task": return void life.toggleTask(item.refId);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1880px] flex-col px-12 pt-8 2xl:px-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-micro tracking-cinematic text-white/35">{formatDayLong(day)}</p>
          <h1 className="mt-3 font-display text-display-lg font-semibold uppercase tracking-wide text-white">{greeting(now.getHours(), name || null)}</h1>
          <button onClick={() => navigate("system")} className="mt-4 flex items-baseline gap-4 text-left">
            <span className="font-display text-[12px] font-semibold tracking-[0.34em] text-white/45">NEXUS</span>
            <span className="h-3 w-px bg-white/15" />
            <span className={cn("font-display text-[12px] tracking-[0.3em]", healthMeta ? (healthMeta.tone === "nominal" ? "text-white/60" : healthMeta.tone === "attention" ? "text-status-attention" : healthMeta.tone === "warning" ? "text-status-warning" : "text-status-critical") : "text-white/30")}>{healthMeta ? `SYSTEM ${healthMeta.label.toUpperCase()}` : "CALIBRATING"}</span>
          </button>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <p className="font-mono text-display-md font-light leading-none tabular tracking-tight text-white">{hour12 ? formatMinute(nowMinute, true) : formatTime(now)}</p>
          <ModeSwitcher />
          <SessionLine />
        </div>
      </div>

      <div className="mt-8 grid min-h-0 flex-1 gap-14 lg:grid-cols-[1.35fr_minmax(300px,0.65fr)]">
        {/* Timeline */}
        <section className="min-h-0 overflow-y-auto pb-12">
          {ov.next && !ov.now.length && (
            <div className="mb-8">
              <p className="text-micro text-white/35">Next</p>
              <button onClick={() => act(ov.next!)} className="mt-2 flex items-baseline gap-5 text-left">
                <span className="font-sans text-display-md font-semibold tabular tracking-tight text-white">{ov.next.minute != null ? formatMinute(ov.next.minute, hour12) : "Anytime"}</span>
                <span className="font-display text-[20px] uppercase tracking-wide text-white/85">{ov.next.title}</span>
                {ov.next.detail && <span className="text-[13px] text-white/40">{ov.next.detail}</span>}
              </button>
            </div>
          )}
          {ov.now.length > 0 && (
            <div className="mb-8">
              <p className="text-micro text-white/35">Now</p>
              {ov.now.map((it) => (
                <button key={it.key} onClick={() => act(it)} className="mt-2 flex items-baseline gap-5 text-left">
                  <span className="font-sans text-display-md font-semibold tabular tracking-tight text-white">{it.minute != null ? formatMinute(it.minute, hour12) : ""}</span>
                  <span className="font-display text-[20px] uppercase tracking-wide text-white">{it.title}</span>
                  {it.detail && <span className="text-[13px] text-white/40">{it.detail}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <p className="label">Today</p>
            {items.length > 0 && <p className="font-mono text-[11px] tabular text-white/30">{[`${items.length} items`, ov.counts.event.total ? `${ov.counts.event.total} event${ov.counts.event.total === 1 ? "" : "s"}` : "", ov.counts.workout.total ? "1 workout" : "", ov.counts.meal.total ? `${ov.counts.meal.total} meals` : "", ov.counts.routine.total ? `${ov.counts.routine.total} routine${ov.counts.routine.total === 1 ? "" : "s"}` : "", ov.counts.task.total ? `${ov.counts.task.total} task${ov.counts.task.total === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="rule mt-3" />
          {life.status === "loading" && <p className="py-6 text-[13px] text-white/35">Loading your day…</p>}
          {empty && (
            <div className="py-10">
              <p className="font-display text-display-sm uppercase tracking-wide2 text-white/70">A clear day</p>
              <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/40">Nothing is scheduled. Add an event, a routine or a task — or load sample data in Life to see how the day fills in.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="sm" variant="outline" onClick={() => openCalendar("day", day)}>Open calendar</Button>
                <Button size="sm" variant="ghost" onClick={() => openLife("overview")}>Open Life</Button>
              </div>
            </div>
          )}
          <ol className="divide-y divide-white/[0.05]">
            {ov.items.map((it) => {
              const phase = phaseOf(it, nowMinute);
              const isOpen = expanded === it.key;
              const st = it.kind === "routine" ? routineStates.find((r) => r.routine.id === it.refId) : undefined;
              return (
                <li key={it.key} className={cn("transition-opacity", phase === "completed" && "opacity-45", phase === "past" && "opacity-70")}>
                  <div className="flex items-baseline gap-5 py-3">
                    <span className={cn("w-[88px] shrink-0 font-mono text-[12.5px] tabular", phase === "now" ? "text-white" : "text-white/40")}>{it.minute != null ? formatMinute(it.minute, hour12) : <span className="text-[10.5px] uppercase tracking-wide2 text-white/30">anytime</span>}</span>
                    <button onClick={() => act(it)} className="flex min-w-0 flex-1 items-baseline gap-3 text-left">
                      <PhaseMark phase={phase} kind={it.kind} />
                      <span className={cn("truncate text-[15px]", phase === "completed" ? "text-white/60 line-through decoration-white/20" : "text-white/90")}>{it.title}</span>
                      <span className="shrink-0 text-[12px] text-white/35">{KIND_LABEL[it.kind]}{it.detail ? ` · ${it.detail}` : ""}</span>
                      {it.kind === "task" && phase === "past" && !it.completed && <span className="shrink-0 text-[11px] uppercase tracking-wide2 text-status-attention/80">overdue</span>}
                    </button>
                    {it.kind === "routine" && st && !st.complete && !st.dismissed && (
                      <button onClick={() => void life.completeRoutine(it.refId, day)} className="shrink-0 text-[12px] text-white/40 hover:text-white">Complete all</button>
                    )}
                    {it.kind === "workout" && !it.completed && <button onClick={() => act(it)} className="flex shrink-0 items-center gap-1 text-[12px] text-white/50 hover:text-white"><Play size={11} fill="currentColor" /> {it.detail === "In progress" ? "Resume" : "Start"}</button>}
                    {it.kind === "meal" && !it.completed && !it.dismissed && <MealQuickLog entryId={it.refId} />}
                    {it.kind === "event" && it.local && <button onClick={() => openCalendar("day", day)} className="shrink-0 text-white/25 hover:text-white" aria-label="Open in calendar"><ChevronRight size={14} /></button>}
                  </div>
                  {isOpen && st && (
                    <div className="mb-4 ml-[108px] grid gap-1 sm:grid-cols-2">
                      {st.steps.map(({ step, state }) => (
                        <button key={step.id} onClick={() => void life.setStep(it.refId, day, step.id, state === "done" ? null : "done")} className="flex items-center gap-3 py-1 text-left text-[14px]">
                          {state === "done" ? <Check size={14} className="text-white" /> : state === "skipped" ? <span className="h-3.5 w-3.5 rounded-full border border-dashed border-white/30" /> : <Circle size={14} className="text-white/25" />}
                          <span className={cn(state === "done" ? "text-white/45 line-through decoration-white/20" : "text-white/85")}>{step.title}</span>
                          {state !== "skipped" && state !== "done" && <button onClick={(e) => { e.stopPropagation(); void life.setStep(it.refId, day, step.id, "skipped"); }} className="ml-auto text-[11px] text-white/25 hover:text-white/70">skip</button>}
                        </button>
                      ))}
                      <div className="col-span-full mt-2 flex gap-5 text-[12px] text-white/35">
                        <button onClick={() => void life.resetRoutine(it.refId, day)} className="hover:text-white">Undo all</button>
                        <button onClick={() => void life.dismissRoutine(it.refId, day, !st.dismissed)} className="hover:text-white">{st.dismissed ? "Back on" : "Not today"}</button>
                        <button onClick={() => openLife("routines", { id: it.refId })} className="hover:text-white">Edit routine</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Also */}
        <aside className="min-h-0 overflow-y-auto pb-12">
          <p className="label">Also</p>
          <div className="rule mt-3 mb-2" />
          <ul className="space-y-3 text-[14px]">
            {mail && (mail.important + mail.receipts + mail.shipments + mail.security > 0) && (
              <li>
                <button onClick={() => openCommunications({ surface: "summary" })} className="flex w-full items-baseline gap-3 text-left">
                  <span className="font-mono text-[13px] tabular text-white/85">{mail.important}</span>
                  <span className="text-white/60">important email{mail.important === 1 ? "" : "s"}{mail.demo && <span className="ml-2 text-[11px] uppercase tracking-wide2 text-white/30">demo</span>}</span>
                  <span className="ml-auto text-[12px] text-white/30">{[mail.shipments ? `${mail.shipments} shipment${mail.shipments === 1 ? "" : "s"}` : "", mail.receipts ? `${mail.receipts} receipt${mail.receipts === 1 ? "" : "s"}` : "", mail.security ? `${mail.security} security` : ""].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            )}
            {ov.routineStepsRemaining > 0 && <li className="flex items-baseline gap-3"><span className="font-mono text-[13px] tabular text-white/85">{ov.routineStepsRemaining}</span><button onClick={() => openLife("routines")} className="text-white/60 hover:text-white">routine step{ov.routineStepsRemaining === 1 ? "" : "s"} remaining</button></li>}
            {ov.counts.task.total > ov.counts.task.done && <li className="flex items-baseline gap-3"><span className="font-mono text-[13px] tabular text-white/85">{ov.counts.task.total - ov.counts.task.done}</span><button onClick={() => openLife("tasks")} className="text-white/60 hover:text-white">task{ov.counts.task.total - ov.counts.task.done === 1 ? "" : "s"} open</button></li>}
            {groceries.remaining > 0 && <li className="flex items-baseline gap-3"><span className="font-mono text-[13px] tabular text-white/85">{groceries.remaining}</span><button onClick={() => openLife("groceries")} className="text-white/60 hover:text-white">grocery item{groceries.remaining === 1 ? "" : "s"} to buy{groceries.estimatedTotal != null ? ` · ~$${groceries.estimatedTotal}` : ""}</button></li>}
          </ul>

          {nutrition.entries > 0 && (
            <div className="mt-10">
              <p className="label">Nutrition</p>
              <div className="rule mt-3 mb-3" />
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {targetProgress(nutrition.consumed, life.targets).slice(0, 4).map((p) => (
                  <div key={p.key}>
                    <p className="font-sans text-[22px] font-semibold tabular tracking-tight text-white">{Math.round(p.value)}<span className="text-[13px] font-normal text-white/35">{p.target ? ` / ${p.target}` : ""}</span></p>
                    <p className="text-[12px] text-white/45">{p.key === "calories" ? "kcal" : `${p.key} g`}{nutrition.consumed[p.key].complete ? "" : " · partly unknown"}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => openLife("nutrition")} className="mt-3 text-[12px] text-white/35 hover:text-white">Planned {Math.round(nutrition.planned.calories.value)} kcal · open nutrition →</button>
            </div>
          )}

          <div className="mt-10 flex flex-wrap gap-4 text-[12.5px] text-white/35">
            <button onClick={() => openCalendar("week", day)} className="hover:text-white">This week</button>
            <button onClick={() => openLife("overview")} className="hover:text-white">Life</button>
            <button onClick={() => navigate("system")} className="hover:text-white">System</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<AgendaItem["kind"], string> = { event: "Event", routine: "Routine", workout: "Workout", meal: "Meal", task: "Task" };

function PhaseMark({ phase, kind }: { phase: AgendaPhase; kind: AgendaItem["kind"] }) {
  if (phase === "completed") return <Check size={13} className="shrink-0 text-white/60" />;
  if (kind === "task" || kind === "routine") return <Circle size={13} className={cn("shrink-0", phase === "now" ? "text-white" : "text-white/30")} />;
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", phase === "now" ? "bg-white" : "bg-white/30")} />;
}

function MealQuickLog({ entryId }: { entryId: string }) {
  const logMeal = useLifeStore((s) => s.logMeal);
  return (
    <span className="flex shrink-0 gap-3 text-[12px] text-white/40">
      <button onClick={() => void logMeal(entryId, "eaten")} className="hover:text-white">Eaten</button>
      <button onClick={() => void logMeal(entryId, "skipped")} className="hover:text-white">Skip</button>
    </span>
  );
}
