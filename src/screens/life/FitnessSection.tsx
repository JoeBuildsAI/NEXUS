import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { useNavigationStore } from "@/state/navigationStore";
import type { Exercise, FitnessProgram, WorkoutSession, WorkoutTemplate } from "@/core/life/models";
import { exerciseBests, exerciseName, fitnessSummary, isPersonalBest, scheduledTemplateId, sessionDurationMinutes, sessionSetsDone, sessionVolume, targetFor } from "@/core/life/fitness";
import { addDays, formatDayShort, startOfWeek, todayKey, WEEKDAY_SHORT } from "@/core/life/time";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Tab = "today" | "templates" | "program" | "history";

/** Fitness: scheduled workout, real session workflow, templates, program scheduler, history + PBs. */
export function FitnessSection() {
  const life = useLifeStore();
  const focus = useNavigationStore((s) => s.lifeFocus);
  const today = todayKey();
  const [tab, setTab] = useState<Tab>("today");
  const active = life.sessions.find((s) => s.status === "active") ?? null;
  const program = life.programs.find((p) => p.enabled) ?? null;
  const templateId = scheduledTemplateId(program, today);
  const template = life.workoutTemplates.find((t) => t.id === templateId) ?? null;
  const [editing, setEditing] = useState<WorkoutTemplate | "new" | null>(null);
  useEffect(() => {
    if (focus?.section !== "fitness" || !focus.action) return;
    if (focus.action === "start" && !active) void life.startWorkout(focus.id ?? templateId);
    setTab("today");
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex gap-6 text-[13px]">
        {(["today", "templates", "program", "history"] as Tab[]).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("pb-1 capitalize transition-colors", tab === t ? "text-white" : "text-white/40 hover:text-white/75")}>{t}</button>)}
      </div>
      <div className="rule mt-1 mb-6" />
      {tab === "today" && (active ? <ActiveSession session={active} /> : (
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="label">Scheduled today</p>
            <div className="rule mt-3 mb-4" />
            {template ? (
              <>
                <p className="font-display text-display-sm uppercase tracking-wide text-white">{template.name}</p>
                <ul className="mt-4 divide-y divide-white/[0.05]">
                  {template.exercises.map((e) => <li key={e.id} className="flex items-baseline gap-4 py-2 text-[14.5px]"><span className="text-white/85">{exerciseName(life.exercises, e.exerciseId)}</span><span className="ml-auto font-mono text-[12px] tabular text-white/40">{e.sets.length} × {e.sets[0]?.repsMin}–{e.sets[0]?.repsMax}{e.sets[0]?.weight != null ? ` · ${e.sets[0].weight} lb` : ""}</span></li>)}
                </ul>
                <div className="mt-6 flex gap-3"><Button variant="primary" onClick={() => void life.startWorkout(template.id)}>Start workout</Button></div>
              </>
            ) : (
              <>
                <p className="text-[14px] text-white/45">{program ? "Rest day." : "No program is scheduled."} Start any template below.</p>
                <ul className="mt-4 divide-y divide-white/[0.05]">
                  {life.workoutTemplates.map((t) => <li key={t.id} className="flex items-baseline gap-4 py-2.5"><span className="text-[14.5px] text-white/85">{t.name}</span><span className="text-[12px] text-white/35">{t.exercises.length} exercises</span><button onClick={() => void life.startWorkout(t.id)} className="ml-auto text-[12.5px] text-white/50 hover:text-white">Start</button></li>)}
                  {life.workoutTemplates.length === 0 && <li className="py-2 text-[13px] text-white/35">No templates yet — create one under Templates.</li>}
                </ul>
                <button onClick={() => void life.startWorkout(null, today, "Free workout")} className="mt-4 text-[12.5px] text-white/40 hover:text-white">Start an empty workout</button>
              </>
            )}
          </div>
          <RecentSessions sessions={life.sessions} exercises={life.exercises} />
        </div>
      ))}
      {tab === "templates" && <Templates onEdit={setEditing} />}
      {tab === "program" && <ProgramEditor />}
      {tab === "history" && <History />}
      {editing && <TemplateEditor template={editing === "new" ? null : editing} exercises={life.exercises} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ active session
function ActiveSession({ session }: { session: WorkoutSession }) {
  const life = useLifeStore();
  const template = life.workoutTemplates.find((t) => t.id === session.templateId) ?? null;
  const prior = useMemo(() => life.sessions.filter((s) => s.id !== session.id && s.status === "finished"), [life.sessions, session.id]);
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(id); }, []);
  const remaining = rest ? Math.max(0, Math.ceil((rest.until - tick) / 1000)) : 0;
  useEffect(() => { if (rest && remaining === 0) setRest(null); }, [rest, remaining]);
  const progress = sessionSetsDone(session);
  const finish = () => {
    if (progress.done === 0) {
      requestConfirm({ title: "Abandon this workout?", message: "No sets were logged. The session is kept as abandoned.", confirmLabel: "Abandon", danger: true, onConfirm: () => void life.finishWorkout(session.id, "abandoned") });
      return;
    }
    void life.finishWorkout(session.id, "finished").then(() => notify.success("Workout finished", `${progress.done} sets · ${Math.round(sessionVolume(session)).toLocaleString()} volume · ${sessionDurationMinutes(session)} min`));
  };
  return (
    <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[1.4fr_0.6fr]">
      <div>
        <div className="flex flex-wrap items-baseline gap-5">
          <p className="font-display text-display-sm uppercase tracking-wide text-white">{session.name}</p>
          <span className="font-mono text-[12.5px] tabular text-white/45">{progress.done} / {progress.total} sets · {sessionDurationMinutes(session, tick)} min · {Math.round(sessionVolume(session)).toLocaleString()} vol</span>
          <span className="ml-auto flex gap-4 text-[12.5px]">
            <button onClick={() => requestConfirm({ title: "Abandon this workout?", message: "Logged sets stay in history as an abandoned session.", confirmLabel: "Abandon", danger: true, onConfirm: () => void life.finishWorkout(session.id, "abandoned") })} className="text-white/35 hover:text-status-critical">Abandon</button>
            <Button size="sm" variant="primary" onClick={finish}>Finish workout</Button>
          </span>
        </div>
        <div className="mt-6 space-y-8">
          {session.exercises.map((ex) => {
            const name = exerciseName(life.exercises, ex.exerciseId);
            const prev = prior.find((s) => s.exercises.some((e) => e.exerciseId === ex.exerciseId))?.exercises.find((e) => e.exerciseId === ex.exerciseId);
            const restSeconds = template?.exercises.find((e) => e.exerciseId === ex.exerciseId)?.restSeconds ?? 90;
            return (
              <div key={ex.id} className={cn(ex.skipped && "opacity-40")}>
                <div className="flex items-baseline gap-4">
                  <p className="font-display text-[17px] uppercase tracking-wide text-white/90">{name}</p>
                  {prev && <span className="text-[12px] text-white/35">last: {prev.sets.filter((s) => s.done).map((s) => `${s.weight ?? "bw"}×${s.reps}`).join("  ")}</span>}
                  <button onClick={() => void life.skipExercise(session.id, ex.id, !ex.skipped)} className="ml-auto text-[12px] text-white/35 hover:text-white">{ex.skipped ? "Unskip" : "Skip"}</button>
                </div>
                {!ex.skipped && (
                  <div className="mt-2">
                    <div className="grid grid-cols-[52px_120px_90px_90px_70px_1fr] gap-x-4 text-micro text-white/30"><span>Set</span><span>Target</span><span>Weight</span><span>Reps</span><span>RPE</span><span /></div>
                    {ex.sets.map((st, i) => {
                      const target = targetFor(template, ex.exerciseId, i);
                      const pb = st.done && isPersonalBest(prior, ex.exerciseId, st);
                      return (
                        <div key={st.id} className={cn("grid grid-cols-[52px_120px_90px_90px_70px_1fr] items-center gap-x-4 border-t border-white/[0.05] py-1.5", st.done && "text-white/55")}>
                          <span className="font-mono text-[12.5px] tabular text-white/50">{i + 1}</span>
                          <span className="font-mono text-[12px] tabular text-white/40">{target ? `${target.repsMin}–${target.repsMax}${target.weight != null ? ` · ${target.weight}` : ""}` : "—"}</span>
                          <input type="number" inputMode="decimal" step="0.5" min={0} value={st.weight ?? ""} placeholder="bw" onChange={(e) => void life.updateSet(session.id, ex.id, st.id, { weight: e.target.value === "" ? null : Number(e.target.value) })} className="w-20 border-b border-white/10 bg-transparent font-mono text-[14px] tabular text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" aria-label={`Set ${i + 1} weight`} />
                          <input type="number" inputMode="numeric" min={0} value={st.reps ?? ""} onChange={(e) => void life.updateSet(session.id, ex.id, st.id, { reps: e.target.value === "" ? null : Number(e.target.value) })} onKeyDown={(e) => { if (e.key === "Enter" && st.reps != null) { void life.updateSet(session.id, ex.id, st.id, { done: true }); setRest({ until: Date.now() + restSeconds * 1000, total: restSeconds }); } }} className="w-16 border-b border-white/10 bg-transparent font-mono text-[14px] tabular text-white focus:border-white/50 focus:outline-none" aria-label={`Set ${i + 1} reps`} />
                          <input type="number" inputMode="decimal" step="0.5" min={1} max={10} value={st.rpe ?? ""} onChange={(e) => void life.updateSet(session.id, ex.id, st.id, { rpe: e.target.value === "" ? null : Number(e.target.value) })} className="w-12 border-b border-white/10 bg-transparent font-mono text-[13px] tabular text-white/70 focus:border-white/50 focus:outline-none" aria-label={`Set ${i + 1} RPE`} />
                          <div className="flex items-center gap-4">
                            <button onClick={() => { const done = !st.done; void life.updateSet(session.id, ex.id, st.id, { done }); if (done) setRest({ until: Date.now() + restSeconds * 1000, total: restSeconds }); }} disabled={!st.done && st.reps == null} className={cn("flex h-7 items-center gap-1.5 rounded-sm px-3 text-[12px] transition-colors", st.done ? "bg-white text-black" : "bg-white/[0.06] text-white/70 hover:bg-white/[0.12] disabled:opacity-30")}><Check size={12} /> {st.done ? "Done" : "Complete"}</button>
                            {pb && <span className="text-micro text-status-nominal/80">PB</span>}
                            <button onClick={() => void life.removeSet(session.id, ex.id, st.id)} className="ml-auto text-white/20 hover:text-white" aria-label="Remove set"><X size={12} /></button>
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => void life.addSet(session.id, ex.id)} className="mt-1.5 flex items-center gap-1 text-[12px] text-white/35 hover:text-white"><Plus size={11} /> Add set</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="label">Rest</p>
        <div className="rule mt-3 mb-4" />
        {rest ? (
          <div>
            <p className="font-sans text-[56px] font-semibold tabular leading-none tracking-tight text-white">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>
            <div className="mt-3 h-px w-full bg-white/10"><div className="h-px bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${(remaining / rest.total) * 100}%` }} /></div>
            <div className="mt-3 flex gap-4 text-[12.5px] text-white/40"><button onClick={() => setRest({ ...rest, until: rest.until + 30_000, total: rest.total + 30 })} className="hover:text-white">+30 s</button><button onClick={() => setRest(null)} className="hover:text-white">Skip rest</button></div>
          </div>
        ) : (
          <p className="text-[13px] text-white/35">Completing a set starts the rest timer. Enter in the reps field also completes the set.</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">{[60, 90, 120, 180].map((s) => <button key={s} onClick={() => setRest({ until: Date.now() + s * 1000, total: s })} className="rounded-sm bg-white/[0.06] px-3 py-1 text-[12px] text-white/60 hover:text-white">{s} s</button>)}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ recent + history
function RecentSessions({ sessions, exercises }: { sessions: readonly WorkoutSession[]; exercises: readonly Exercise[] }) {
  const recent = sessions.filter((s) => s.status !== "active").sort((a, b) => b.startedAt - a.startedAt).slice(0, 6);
  return (
    <div>
      <p className="label">Recent</p>
      <div className="rule mt-3" />
      {recent.length === 0 && <p className="py-4 text-[13px] text-white/35">No sessions yet.</p>}
      <ul className="divide-y divide-white/[0.05]">
        {recent.map((s) => { const p = sessionSetsDone(s); return (
          <li key={s.id} className={cn("py-2.5", s.status === "abandoned" && "opacity-50")}>
            <div className="flex items-baseline gap-4 text-[14.5px]"><span className="text-white/85">{s.name}</span><span className="font-mono text-[12px] tabular text-white/40">{formatDayShort(s.day)} · {p.done} sets · {Math.round(sessionVolume(s)).toLocaleString()} vol · {sessionDurationMinutes(s)} min{s.status === "abandoned" ? " · abandoned" : ""}</span></div>
            <p className="truncate text-[11.5px] text-white/30">{s.exercises.filter((e) => !e.skipped).map((e) => exerciseName(exercises, e.exerciseId)).join(" · ")}</p>
          </li>
        ); })}
      </ul>
    </div>
  );
}

function History() {
  const life = useLifeStore();
  const today = todayKey();
  const program = life.programs.find((p) => p.enabled) ?? null;
  const summary = useMemo(() => fitnessSummary(life.sessions, program, addDays(today, -83), today, (d) => startOfWeek(d)), [life.sessions, program, today]);
  const bests = useMemo(() => life.exercises.map((e) => ({ e, b: exerciseBests(life.sessions, e.id) })).filter((x) => x.b.sessionCount > 0).sort((a, b) => (b.b.maxWeight ?? 0) - (a.b.maxWeight ?? 0)), [life.exercises, life.sessions]);
  const maxVol = Math.max(1, ...summary.byWeek.map((w) => w.volume));
  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-2">
      <div>
        <p className="label">Last 12 weeks</p>
        <div className="rule mt-3 mb-4" />
        <div className="grid grid-cols-4 gap-6">
          <Fig n={String(summary.sessions)} l="Sessions" /><Fig n={Math.round(summary.totalVolume).toLocaleString()} l="Volume" /><Fig n={`${Math.round(summary.totalMinutes / 60)} h`} l="Training time" /><Fig n={summary.adherence != null ? `${Math.round(summary.adherence * 100)}%` : "—"} l={program ? "Adherence" : "No program"} />
        </div>
        <div className="mt-8 flex h-24 items-end gap-1">{summary.byWeek.map((w) => <div key={w.week} title={`${w.week} · ${w.sessions} sessions`} className="flex-1 bg-white/60" style={{ height: `${Math.max(4, (w.volume / maxVol) * 100)}%` }} />)}{summary.byWeek.length === 0 && <p className="text-[13px] text-white/35">No finished sessions in this window.</p>}</div>
        <p className="mt-2 text-[11.5px] text-white/30">Weekly volume (weight × reps of completed sets). Bodyweight sets add no volume.</p>
        <RecentSessions sessions={life.sessions} exercises={life.exercises} />
      </div>
      <div>
        <p className="label">Exercise bests</p>
        <div className="rule mt-3" />
        {bests.length === 0 && <p className="py-4 text-[13px] text-white/35">Bests appear after finished sessions.</p>}
        <ul className="divide-y divide-white/[0.05]">
          {bests.map(({ e, b }) => <li key={e.id} className="flex items-baseline gap-4 py-2.5 text-[14px]"><span className="text-white/85">{e.name}</span><span className="ml-auto font-mono text-[12px] tabular text-white/45">{b.maxWeight != null ? `${b.maxWeight} max · e1RM ${b.estimated1rm ?? "—"}` : "bodyweight"} · {b.sessionCount} sessions{b.lastDay ? ` · ${formatDayShort(b.lastDay)}` : ""}</span></li>)}
        </ul>
        <p className="mt-3 text-[11.5px] text-white/30">Estimated 1RM uses the Epley formula on sets of 12 reps or fewer. Planning figures, not medical guidance.</p>
      </div>
    </div>
  );
}
function Fig({ n, l }: { n: string; l: string }) {
  return <div><p className="font-sans text-[26px] font-semibold tabular tracking-tight text-white">{n}</p><p className="text-[12px] text-white/40">{l}</p></div>;
}

// ------------------------------------------------------------------ templates + exercises
function Templates({ onEdit }: { onEdit: (t: WorkoutTemplate | "new") => void }) {
  const life = useLifeStore();
  const [newExercise, setNewExercise] = useState("");
  const addExercise = async () => {
    const name = newExercise.trim();
    if (!name) return;
    await life.upsert("exercises", [{ id: `ex-${Date.now().toString(36)}`, createdAt: Date.now(), updatedAt: Date.now(), rev: 1, name, muscles: [], equipment: "other" }]);
    setNewExercise("");
  };
  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="flex items-baseline justify-between"><p className="label">Workout templates</p><button onClick={() => onEdit("new")} className="flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white"><Plus size={13} /> New template</button></div>
        <div className="rule mt-3" />
        {life.workoutTemplates.length === 0 && <p className="py-4 text-[13px] text-white/35">No templates yet.</p>}
        <ul className="divide-y divide-white/[0.05]">
          {life.workoutTemplates.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex items-baseline gap-4"><button onClick={() => onEdit(t)} className="font-display text-[16px] uppercase tracking-wide text-white/90 hover:text-white">{t.name}</button><span className="text-[12px] text-white/35">{t.exercises.length} exercises · {t.exercises.reduce((a, e) => a + e.sets.length, 0)} sets</span><span className="ml-auto flex gap-4 text-[12px] text-white/35"><button onClick={() => void life.startWorkout(t.id)} className="hover:text-white">Start</button><button onClick={() => onEdit(t)} className="hover:text-white">Edit</button><button onClick={() => requestConfirm({ title: `Delete ${t.name}?`, message: "Past sessions keep their data.", confirmLabel: "Delete", danger: true, onConfirm: () => void life.remove("workoutTemplates", [t.id]) })} className="hover:text-status-critical">Delete</button></span></div>
              <p className="truncate text-[12px] text-white/35">{t.exercises.map((e) => exerciseName(life.exercises, e.exerciseId)).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label">Exercises</p>
        <div className="rule mt-3 mb-2" />
        <form onSubmit={(e) => { e.preventDefault(); void addExercise(); }}><input value={newExercise} onChange={(e) => setNewExercise(e.target.value)} placeholder="Add an exercise" className="h-9 w-full border-b border-white/10 bg-transparent text-[14px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" /></form>
        <ul className="mt-2 max-h-[52vh] divide-y divide-white/[0.05] overflow-y-auto">
          {life.exercises.slice().sort((a, b) => a.name.localeCompare(b.name)).map((e) => <li key={e.id} className="group flex items-baseline gap-3 py-2 text-[14px]"><span className="text-white/80">{e.name}</span><span className="text-[11.5px] text-white/30">{e.muscles.join(", ")}{e.muscles.length ? " · " : ""}{e.equipment}</span><button onClick={() => void life.remove("exercises", [e.id])} className="ml-auto text-white/0 group-hover:text-white/30 hover:!text-white" aria-label="Remove"><X size={12} /></button></li>)}
        </ul>
      </div>
    </div>
  );
}

function TemplateEditor({ template, exercises, onClose }: { template: WorkoutTemplate | null; exercises: readonly Exercise[]; onClose: () => void }) {
  const life = useLifeStore();
  const [t, setT] = useState<WorkoutTemplate>(template ?? { id: "", createdAt: 0, updatedAt: 0, rev: 0, name: "", exercises: [] });
  const [pick, setPick] = useState("");
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; document.addEventListener("keydown", onKey, true); return () => document.removeEventListener("keydown", onKey, true); }, [onClose]);
  const add = (exerciseId: string) => setT({ ...t, exercises: [...t.exercises, { id: `we-${Date.now().toString(36)}-${t.exercises.length}`, exerciseId, order: t.exercises.length, sets: [{ repsMin: 8, repsMax: 12, weight: null }, { repsMin: 8, repsMax: 12, weight: null }, { repsMin: 8, repsMax: 12, weight: null }], restSeconds: 90 }] });
  const upd = (i: number, p: Partial<WorkoutTemplate["exercises"][number]>) => setT({ ...t, exercises: t.exercises.map((e, k) => (k === i ? { ...e, ...p } : e)) });
  const move = (i: number, dir: -1 | 1) => { const arr = [...t.exercises]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j]!, arr[i]!]; setT({ ...t, exercises: arr.map((e, k) => ({ ...e, order: k })) }); };
  const save = async () => {
    if (!t.name.trim() || !t.exercises.length) return;
    const now = Date.now();
    await life.upsert("workoutTemplates", [t.id ? { ...t, name: t.name.trim(), updatedAt: now, rev: t.rev + 1 } : { ...t, id: `wt-${now.toString(36)}`, name: t.name.trim(), label: t.name.trim(), createdAt: now, updatedAt: now, rev: 1 }]);
    onClose();
  };
  const matches = pick.trim() ? exercises.filter((e) => e.name.toLowerCase().includes(pick.toLowerCase())).slice(0, 6) : [];
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-strong max-h-[90vh] w-[720px] max-w-[94vw] overflow-y-auto rounded-md p-7">
        <p className="text-micro text-white/35">{template ? "Edit template" : "New template"}</p>
        <input autoFocus value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Push, Pull, Legs, Full body…" className="mt-3 w-full border-b border-white/15 bg-transparent pb-2 font-display text-[24px] font-semibold tracking-wide text-white placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
        <div className="mt-6 space-y-4">
          {t.exercises.map((e, i) => (
            <div key={e.id} className="border-t border-white/[0.06] pt-3">
              <div className="flex items-baseline gap-3">
                <span className="text-[15px] text-white/90">{exerciseName(exercises, e.exerciseId)}</span>
                <span className="ml-auto flex gap-3 text-[11.5px] text-white/35"><button onClick={() => move(i, -1)} className="hover:text-white">↑</button><button onClick={() => move(i, 1)} className="hover:text-white">↓</button><button onClick={() => setT({ ...t, exercises: t.exercises.filter((_, k) => k !== i) })} className="hover:text-status-critical">Remove</button></span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12.5px] tabular text-white/70">
                <label className="flex items-center gap-2"><span className="font-sans text-white/35">Sets</span><input type="number" min={1} max={12} value={e.sets.length} onChange={(ev) => { const n = Math.max(1, Math.min(12, Number(ev.target.value) || 1)); const base = e.sets[0] ?? { repsMin: 8, repsMax: 12, weight: null }; upd(i, { sets: Array.from({ length: n }, (_, k) => e.sets[k] ?? { ...base }) }); }} className="w-10 border-b border-white/10 bg-transparent focus:outline-none" /></label>
                <label className="flex items-center gap-2"><span className="font-sans text-white/35">Reps</span><input type="number" min={1} value={e.sets[0]?.repsMin ?? 8} onChange={(ev) => upd(i, { sets: e.sets.map((s) => ({ ...s, repsMin: Number(ev.target.value) || 1 })) })} className="w-10 border-b border-white/10 bg-transparent focus:outline-none" /><span>–</span><input type="number" min={1} value={e.sets[0]?.repsMax ?? 12} onChange={(ev) => upd(i, { sets: e.sets.map((s) => ({ ...s, repsMax: Number(ev.target.value) || 1 })) })} className="w-10 border-b border-white/10 bg-transparent focus:outline-none" /></label>
                <label className="flex items-center gap-2"><span className="font-sans text-white/35">Weight</span><input type="number" min={0} step="0.5" value={e.sets[0]?.weight ?? ""} placeholder="—" onChange={(ev) => upd(i, { sets: e.sets.map((s) => ({ ...s, weight: ev.target.value === "" ? null : Number(ev.target.value) })) })} className="w-14 border-b border-white/10 bg-transparent placeholder:text-white/25 focus:outline-none" /></label>
                <label className="flex items-center gap-2"><span className="font-sans text-white/35">Rest</span><input type="number" min={0} step={15} value={e.restSeconds} onChange={(ev) => upd(i, { restSeconds: Number(ev.target.value) || 0 })} className="w-12 border-b border-white/10 bg-transparent focus:outline-none" /><span className="font-sans text-white/35">s</span></label>
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-5">
          <input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Add exercise…" className="h-9 w-full border-b border-white/10 bg-transparent text-[14px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
          {matches.length > 0 && <ul className="absolute z-10 mt-1 w-full bg-[#0b0b0b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">{matches.map((m) => <li key={m.id}><button onClick={() => { add(m.id); setPick(""); }} className="block w-full px-3 py-1.5 text-left text-[13.5px] text-white/80 hover:bg-white/[0.06] hover:text-white">{m.name}</button></li>)}</ul>}
          {pick.trim() && matches.length === 0 && <button onClick={async () => { const id = `ex-${Date.now().toString(36)}`; await life.upsert("exercises", [{ id, createdAt: Date.now(), updatedAt: Date.now(), rev: 1, name: pick.trim(), muscles: [], equipment: "other" }]); add(id); setPick(""); }} className="mt-2 text-[12.5px] text-white/45 hover:text-white">Create “{pick.trim()}” as a new exercise</button>}
        </div>
        <div className="mt-7 flex items-center gap-3"><Button variant="primary" size="sm" onClick={() => void save()} disabled={!t.name.trim() || !t.exercises.length}>{template ? "Save" : "Create"}</Button><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ program
function ProgramEditor() {
  const life = useLifeStore();
  const today = todayKey();
  const program = life.programs[0] ?? null;
  const ensure = async (): Promise<FitnessProgram> => {
    if (program) return program;
    const now = Date.now();
    const p: FitnessProgram = { id: `prog-${now.toString(36)}`, createdAt: now, updatedAt: now, rev: 1, name: "My program", mode: "weekly", weekly: [null, null, null, null, null, null, null], rotation: [], anchor: startOfWeek(today), manual: {}, enabled: true };
    await life.upsert("programs", [p]);
    return p;
  };
  const patch = async (p: Partial<FitnessProgram>) => { const cur = await ensure(); await life.patch("programs", cur.id, p); };
  const tmplName = (id: string | null) => (id ? life.workoutTemplates.find((t) => t.id === id)?.name ?? "?" : "Rest");
  const Picker = ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="bg-transparent text-[13.5px] text-white/85 focus:outline-none [color-scheme:dark]">
      <option value="">Rest</option>
      {life.workoutTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1fr_1fr]">
      <div>
        <div className="flex items-baseline gap-4">
          <p className="label">Program</p>
          {program && <button onClick={() => void patch({ enabled: !program.enabled })} className="text-[12px] text-white/40 hover:text-white">{program.enabled ? "Enabled · pause" : "Paused · enable"}</button>}
        </div>
        <div className="rule mt-3 mb-4" />
        <div className="flex gap-5 text-[13px]">{(["weekly", "rotating", "manual"] as const).map((m) => <button key={m} onClick={() => void patch({ mode: m })} className={cn("capitalize", (program?.mode ?? "weekly") === m ? "text-white" : "text-white/40 hover:text-white/80")}>{m}</button>)}</div>
        {(program?.mode ?? "weekly") === "weekly" && (
          <ul className="mt-4 divide-y divide-white/[0.05]">{[1, 2, 3, 4, 5, 6, 0].map((wd) => <li key={wd} className="flex items-center gap-4 py-2"><span className="w-10 text-[13px] text-white/45">{WEEKDAY_SHORT[wd]}</span><Picker value={program?.weekly[wd] ?? null} onChange={(v) => { const w = [...(program?.weekly ?? [null, null, null, null, null, null, null])]; w[wd] = v; void patch({ weekly: w }); }} /></li>)}</ul>
        )}
        {program?.mode === "rotating" && (
          <div className="mt-4">
            <ul className="divide-y divide-white/[0.05]">{program.rotation.map((id, i) => <li key={i} className="flex items-center gap-4 py-2"><span className="w-10 font-mono text-[12px] text-white/45">D{i + 1}</span><Picker value={id} onChange={(v) => { const r = [...program.rotation]; r[i] = v; void patch({ rotation: r }); }} /><button onClick={() => void patch({ rotation: program.rotation.filter((_, k) => k !== i) })} className="ml-auto text-white/25 hover:text-white"><X size={12} /></button></li>)}</ul>
            <div className="mt-3 flex items-center gap-4 text-[12.5px]"><button onClick={() => void patch({ rotation: [...program.rotation, null] })} className="text-white/45 hover:text-white">Add day</button><span className="text-white/30">Starts</span><input type="date" value={program.anchor} onChange={(e) => void patch({ anchor: e.target.value })} className="bg-transparent text-white/70 [color-scheme:dark]" /></div>
          </div>
        )}
        {program?.mode === "manual" && (
          <ul className="mt-4 divide-y divide-white/[0.05]">{Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => <li key={d} className="flex items-center gap-4 py-2"><span className="w-20 text-[13px] text-white/45">{formatDayShort(d)}</span><Picker value={program.manual[d] ?? null} onChange={(v) => { const m = { ...program.manual }; if (v) m[d] = v; else delete m[d]; void patch({ manual: m }); }} /></li>)}</ul>
        )}
      </div>
      <div>
        <p className="label">Next 14 days</p>
        <div className="rule mt-3" />
        <ul className="divide-y divide-white/[0.05]">{Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => { const id = scheduledTemplateId(program, d); return <li key={d} className={cn("flex items-baseline gap-4 py-2 text-[14px]", !id && "opacity-40")}><span className="w-20 font-mono text-[12px] tabular text-white/45">{formatDayShort(d)}</span><span className="text-white/85">{tmplName(id)}</span></li>; })}</ul>
        <p className="mt-3 text-[11.5px] text-white/30">Scheduled workouts appear on Today and in the Calendar.</p>
      </div>
    </div>
  );
}
