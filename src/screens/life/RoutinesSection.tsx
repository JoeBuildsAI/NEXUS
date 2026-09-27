import { useEffect, useMemo, useState } from "react";
import { Check, Circle, Plus, X } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { useNavigationStore } from "@/state/navigationStore";
import { useSettingsStore } from "@/state/settingsStore";
import type { Routine, RoutineCategory, RoutineStep } from "@/core/life/models";
import { describeSchedule, SCHEDULE_PRESETS, type Schedule } from "@/core/life/recurrence";
import { applicableSteps, routineDayState, routineDueOn, routineHistory, ROUTINE_TEMPLATES } from "@/core/life/routines";
import { addDays, formatMinute, parseTimeInput, todayKey, WEEKDAY_SHORT } from "@/core/life/time";
import { requestConfirm } from "@/state/confirmStore";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const CATEGORIES: RoutineCategory[] = ["morning", "evening", "skincare", "hygiene", "hair", "cleaning", "supplements", "study", "preparation", "custom"];

/** Routines: due today with one-click logging, all routines with history, and a generic editor. */
export function RoutinesSection() {
  const life = useLifeStore();
  const focus = useNavigationStore((s) => s.lifeFocus);
  const hour12 = useSettingsStore((s) => s.profile.clockFormat === "12h");
  const today = todayKey();
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (focus?.section === "routines" && focus.id) { setSelected(focus.id); } }, [focus]);

  const due = useMemo(() => life.routines.filter((r) => routineDueOn(r, today)).map((r) => routineDayState(r, today, life.routineCompletions.find((c) => c.routineId === r.id && c.day === today))), [life.routines, life.routineCompletions, today]);
  const others = life.routines.filter((r) => !routineDueOn(r, today));
  const sel = life.routines.find((r) => r.id === selected) ?? null;
  const history = useMemo(() => (sel ? routineHistory(sel, life.routineCompletions, addDays(today, -27), today) : null), [sel, life.routineCompletions, today]);

  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="label">Due today</p>
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white"><Plus size={13} /> New routine</button>
        </div>
        <div className="rule mt-3" />
        {due.length === 0 && <p className="py-6 text-[13.5px] text-white/35">Nothing due today.</p>}
        <ul className="divide-y divide-white/[0.05]">
          {due.map((st) => (
            <li key={st.routine.id} className={cn("py-4", (st.complete || st.dismissed) && "opacity-55")}>
              <div className="flex items-baseline gap-4">
                <button onClick={() => setSelected(st.routine.id)} className="font-display text-[17px] uppercase tracking-wide text-white/90 hover:text-white">{st.routine.name}</button>
                <span className="font-mono text-[12px] tabular text-white/40">{st.dismissed ? "not today" : `${st.done} / ${st.total}`}{st.routine.preferredMinute != null ? ` · ${formatMinute(st.routine.preferredMinute, hour12)}` : ""}</span>
                <span className="ml-auto flex gap-4 text-[12px] text-white/35">
                  {!st.complete && !st.dismissed && <button onClick={() => void life.completeRoutine(st.routine.id, today)} className="hover:text-white">Complete all</button>}
                  {(st.done > 0 || st.skipped > 0) && <button onClick={() => void life.resetRoutine(st.routine.id, today)} className="hover:text-white">Undo</button>}
                  <button onClick={() => void life.dismissRoutine(st.routine.id, today, !st.dismissed)} className="hover:text-white">{st.dismissed ? "Back on" : "Not today"}</button>
                </span>
              </div>
              {!st.dismissed && (
                <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
                  {st.steps.map(({ step, state }) => (
                    <div key={step.id} className="group flex items-center gap-3 py-0.5 text-[14.5px]">
                      <button onClick={() => void life.setStep(st.routine.id, today, step.id, state === "done" ? null : "done")} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-pressed={state === "done"}>
                        {state === "done" ? <Check size={15} className="shrink-0 text-white" /> : state === "skipped" ? <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-dashed border-white/35" /> : <Circle size={15} className="shrink-0 text-white/25 group-hover:text-white/50" />}
                        <span className={cn("truncate", state ? "text-white/45 line-through decoration-white/20" : "text-white/85")}>{step.title}</span>
                        {step.condition && <span className="text-micro text-white/25">{describeSchedule(step.condition)}</span>}
                      </button>
                      {!state && <button onClick={() => void life.setStep(st.routine.id, today, step.id, "skipped")} className="text-[11px] text-white/0 group-hover:text-white/40 hover:!text-white">skip</button>}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>

        {others.length > 0 && (
          <>
            <p className="label mt-10">Other routines</p>
            <div className="rule mt-3" />
            <ul className="divide-y divide-white/[0.05]">
              {others.map((r) => (
                <li key={r.id} className="flex items-baseline gap-4 py-3">
                  <button onClick={() => setSelected(r.id)} className={cn("text-[15px]", r.enabled ? "text-white/80 hover:text-white" : "text-white/35")}>{r.name}</button>
                  <span className="text-[12px] text-white/35">{describeSchedule(r.schedule)}{!r.enabled ? " · paused" : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div>
        {sel && history ? (
          <div>
            <div className="flex items-baseline justify-between">
              <p className="label">{sel.name}</p>
              <span className="flex gap-4 text-[12px] text-white/35">
                <button onClick={() => setEditing(sel)} className="hover:text-white">Edit</button>
                <button onClick={() => void life.patch("routines", sel.id, { enabled: !sel.enabled })} className="hover:text-white">{sel.enabled ? "Pause" : "Resume"}</button>
                <button onClick={() => requestConfirm({ title: `Delete ${sel.name}?`, message: "The routine and its history are removed from this machine.", confirmLabel: "Delete", danger: true, onConfirm: () => { void life.remove("routines", [sel.id]); setSelected(null); } })} className="hover:text-status-critical">Delete</button>
              </span>
            </div>
            <div className="rule mt-3 mb-4" />
            <p className="text-[13px] text-white/45">{describeSchedule(sel.schedule)}{sel.preferredMinute != null ? ` · ${formatMinute(sel.preferredMinute, hour12)}` : ""}{sel.estimatedMinutes ? ` · ${sel.estimatedMinutes} min` : ""} · {applicableSteps(sel, today).length} steps today</p>
            <div className="mt-6 grid grid-cols-4 gap-6">
              <Figure n={`${Math.round(history.averageCompletion * 100)}%`} label="Average completion" />
              <Figure n={String(history.completedDays)} label={`Complete of ${history.dueDays} due`} />
              <Figure n={String(history.missedDays)} label="Missed days" />
              <Figure n={String(history.consistency)} label="Days in a row" />
            </div>
            <p className="label mt-8">Last 28 days</p>
            <div className="mt-3 grid grid-cols-14 gap-1">
              {history.recent.map((d) => (
                <div key={d.day} title={`${d.day} · ${d.done}/${d.total}`} className={cn("h-6 rounded-[2px]", !d.due ? "bg-white/[0.03]" : d.total && d.done === d.total ? "bg-white/80" : d.done > 0 ? "bg-white/35" : d.day === today ? "bg-white/10" : "bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]")} />
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-white/30">Filled = complete · half = partial · outlined = missed · faint = not due</p>
          </div>
        ) : (
          <div>
            <p className="label">Start from a template</p>
            <div className="rule mt-3 mb-2" />
            <ul className="divide-y divide-white/[0.05]">
              {ROUTINE_TEMPLATES.map((t) => (
                <li key={t.id} className="flex items-baseline gap-4 py-2.5">
                  <button onClick={() => setEditing({ ...blank(), name: t.name, category: t.category, schedule: t.schedule, preferredMinute: t.preferredMinute, steps: t.steps.map((title, order) => ({ id: "", title, order })) })} className="text-[14.5px] text-white/80 hover:text-white">{t.name}</button>
                  <span className="truncate text-[12px] text-white/30">{t.steps.join(" · ")}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-white/30">Templates are ordinary routines — every step, schedule and condition stays editable. Personal care lives here too.</p>
          </div>
        )}
      </div>

      {editing && <RoutineEditor routine={editing === "new" ? blank() : editing} onClose={() => setEditing(null)} onSaved={(id) => setSelected(id)} />}
    </div>
  );
}

function Figure({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <p className="font-sans text-[26px] font-semibold tabular tracking-tight text-white">{n}</p>
      <p className="text-[12px] text-white/40">{label}</p>
    </div>
  );
}

function blank(): Routine {
  return { id: "", createdAt: 0, updatedAt: 0, rev: 0, name: "", category: "custom", schedule: { kind: "daily" }, preferredMinute: 8 * 60, estimatedMinutes: null, steps: [{ id: "", title: "", order: 0 }], enabled: true };
}

function RoutineEditor({ routine, onClose, onSaved }: { routine: Routine; onClose: () => void; onSaved: (id: string) => void }) {
  const save = useLifeStore((s) => s.saveRoutine);
  const [r, setR] = useState<Routine>(routine);
  const [time, setTime] = useState(r.preferredMinute != null ? formatMinute(r.preferredMinute, false) : "");
  const [customDays, setCustomDays] = useState<number[]>(r.schedule.kind === "days" || r.schedule.kind === "weekly" ? r.schedule.weekdays ?? [] : []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const setStep = (i: number, p: Partial<RoutineStep>) => setR({ ...r, steps: r.steps.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  const submit = async () => {
    const steps = r.steps.filter((s) => s.title.trim()).map((s, i) => ({ ...s, title: s.title.trim(), order: i }));
    if (!r.name.trim() || !steps.length) return;
    const saved = await save({ ...r, name: r.name.trim(), steps, preferredMinute: time ? parseTimeInput(time) : null });
    onSaved(saved.id);
    onClose();
  };
  const schedule = (s: Schedule) => setR({ ...r, schedule: s });
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-strong max-h-[90vh] w-[640px] max-w-[94vw] overflow-y-auto rounded-md p-7">
        <p className="text-micro text-white/35">{routine.id ? "Edit routine" : "New routine"}</p>
        <input autoFocus value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Routine name" className="mt-3 w-full border-b border-white/15 bg-transparent pb-2 font-display text-[24px] font-semibold tracking-wide text-white placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
        <div className="mt-6 grid grid-cols-[92px_1fr] gap-x-6 gap-y-4 text-[14px]">
          <span className="text-white/35">Category</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">{CATEGORIES.map((c) => <button key={c} onClick={() => setR({ ...r, category: c })} className={cn("capitalize", r.category === c ? "text-white" : "text-white/40 hover:text-white/80")}>{c}</button>)}</div>
          <span className="text-white/35">Schedule</span>
          <div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
              {SCHEDULE_PRESETS.map((p) => <button key={p.id} onClick={() => schedule(p.schedule)} className={cn(describeSchedule(r.schedule) === describeSchedule(p.schedule) ? "text-white" : "text-white/40 hover:text-white/80")}>{p.label}</button>)}
              <button onClick={() => schedule({ kind: "days", weekdays: customDays })} className={cn(r.schedule.kind === "days" && !SCHEDULE_PRESETS.some((p) => describeSchedule(p.schedule) === describeSchedule(r.schedule)) ? "text-white" : "text-white/40 hover:text-white/80")}>Custom days</button>
            </div>
            {r.schedule.kind === "days" && (
              <div className="mt-2 flex gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => { const on = (r.schedule.weekdays ?? []).includes(wd); return <button key={wd} onClick={() => { const next = on ? (r.schedule.weekdays ?? []).filter((d) => d !== wd) : [...(r.schedule.weekdays ?? []), wd]; setCustomDays(next); schedule({ kind: "days", weekdays: next }); }} className={cn("h-7 w-9 rounded-sm text-[11.5px]", on ? "bg-white text-black" : "bg-white/[0.06] text-white/50 hover:text-white")}>{WEEKDAY_SHORT[wd]}</button>; })}
              </div>
            )}
            <div className="mt-2 flex items-center gap-3 text-[12.5px] text-white/40">
              <span>Active</span>
              <input type="date" value={r.schedule.from ?? ""} onChange={(e) => schedule({ ...r.schedule, from: e.target.value || null })} className="bg-transparent text-white/70 [color-scheme:dark]" />
              <span>→</span>
              <input type="date" value={r.schedule.to ?? ""} onChange={(e) => schedule({ ...r.schedule, to: e.target.value || null })} className="bg-transparent text-white/70 [color-scheme:dark]" />
              <span className="text-white/25">optional</span>
            </div>
          </div>
          <span className="text-white/35">Time</span>
          <div className="flex items-center gap-4 font-mono text-[13.5px]">
            <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="07:30" className="w-16 border-b border-white/15 bg-transparent text-white/85 placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
            <input type="number" min={0} value={r.estimatedMinutes ?? ""} onChange={(e) => setR({ ...r, estimatedMinutes: e.target.value ? Number(e.target.value) : null })} placeholder="min" className="w-14 border-b border-white/15 bg-transparent text-white/85 placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
            <span className="font-sans text-[12px] text-white/30">preferred time · estimated minutes</span>
          </div>
          <span className="text-white/35">Steps</span>
          <div className="space-y-1.5">
            {r.steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setR({ ...r, steps: [...r.steps.slice(0, i + 1), { id: "", title: "", order: i + 1 }, ...r.steps.slice(i + 1)] }); } }} placeholder={`Step ${i + 1}`} className="flex-1 border-b border-white/10 bg-transparent py-0.5 text-white/85 placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
                <StepCondition step={s} onChange={(c) => setStep(i, { condition: c })} />
                <button onClick={() => setR({ ...r, steps: r.steps.filter((_, k) => k !== i) })} className="text-white/25 hover:text-white" aria-label="Remove step"><X size={13} /></button>
              </div>
            ))}
            <button onClick={() => setR({ ...r, steps: [...r.steps, { id: "", title: "", order: r.steps.length }] })} className="flex items-center gap-1 text-[12.5px] text-white/40 hover:text-white"><Plus size={12} /> Add step</button>
          </div>
        </div>
        <div className="mt-7 flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!r.name.trim() || !r.steps.some((s) => s.title.trim())}>{routine.id ? "Save" : "Create"}</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/** Per-step condition: "Every day" or specific weekdays (e.g. Retinol Tue/Fri). */
function StepCondition({ step, onChange }: { step: RoutineStep; onChange: (c: Schedule | null) => void }) {
  const days = step.condition?.kind === "days" ? step.condition.weekdays ?? [] : null;
  return (
    <div className="flex items-center gap-1">
      {days === null ? (
        <button onClick={() => onChange({ kind: "days", weekdays: [] })} className="text-[11px] text-white/25 hover:text-white/70">every day</button>
      ) : (
        <>
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => { const on = days.includes(wd); return <button key={wd} onClick={() => onChange({ kind: "days", weekdays: on ? days.filter((d) => d !== wd) : [...days, wd] })} className={cn("h-5 w-5 rounded-[2px] text-[9.5px]", on ? "bg-white text-black" : "bg-white/[0.06] text-white/40")}>{WEEKDAY_SHORT[wd]![0]}</button>; })}
          <button onClick={() => onChange(null)} className="ml-1 text-[11px] text-white/25 hover:text-white/70">clear</button>
        </>
      )}
    </div>
  );
}
