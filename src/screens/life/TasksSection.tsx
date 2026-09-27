import { useEffect, useMemo, useState } from "react";
import { Check, Circle } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useNavigationStore } from "@/state/navigationStore";
import type { Task } from "@/core/life/models";
import { isOverdue, parseQuickAdd, tasksForView, type TaskView } from "@/core/life/tasks";
import { addDays, formatMinute, parseTimeInput, relativeDayLabel, todayKey } from "@/core/life/time";
import { describeSchedule } from "@/core/life/recurrence";
import { cn } from "@/lib/utils";

const VIEWS: { id: TaskView; label: string }[] = [{ id: "today", label: "Today" }, { id: "inbox", label: "Inbox" }, { id: "upcoming", label: "Upcoming" }, { id: "someday", label: "Someday" }, { id: "completed", label: "Completed" }];

/** Lightweight personal tasks: quick-add line, five views, inline editing. Not a project manager. */
export function TasksSection() {
  const life = useLifeStore();
  const hour12 = useSettingsStore((s) => s.profile.clockFormat === "12h");
  const today = todayKey();
  const [view, setView] = useState<TaskView>("today");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const focus = useNavigationStore((s) => s.lifeFocus);
  useEffect(() => { if (focus?.section === "tasks" && focus.id) { setSelected(focus.id); const t = life.tasks.find((x) => x.id === focus.id); if (t) setView(t.status === "done" ? "completed" : t.someday ? "someday" : t.dueDay && t.dueDay > today ? "upcoming" : t.dueDay || t.today ? "today" : "inbox"); } }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useMemo(() => tasksForView(life.tasks, view, today), [life.tasks, view, today]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, tasksForView(life.tasks, v.id, today).length])) as Record<TaskView, number>, [life.tasks, today]);
  const sel = life.tasks.find((t) => t.id === selected) ?? null;

  const add = async () => {
    if (!draft.trim()) return;
    const p = parseQuickAdd(draft, today, addDays, parseTimeInput);
    await life.addTask({ title: p.title, dueDay: p.dueDay, dueMinute: p.dueMinute, priority: p.priority, tags: p.tags, today: view === "today" && !p.dueDay, someday: view === "someday" });
    setDraft("");
  };

  return (
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex items-center gap-3">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task · “Call dentist tomorrow 3pm !high #health”" aria-label="Quick add task" className="h-10 flex-1 border-b border-white/15 bg-transparent text-[15px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
        </form>
        <div className="mt-6 flex gap-6 text-[13px]">
          {VIEWS.map((v) => <button key={v.id} onClick={() => setView(v.id)} className={cn("flex items-baseline gap-1.5 pb-1 transition-colors", view === v.id ? "text-white" : "text-white/40 hover:text-white/75")}>{v.label}<span className="font-mono text-[10.5px] tabular text-white/30">{counts[v.id]}</span></button>)}
        </div>
        <div className="rule mt-1" />
        {tasks.length === 0 && <p className="py-8 text-[13.5px] text-white/35">{view === "completed" ? "Nothing completed yet." : view === "today" ? "Nothing due today." : "Empty."}</p>}
        <ul className="divide-y divide-white/[0.05]">
          {tasks.map((t) => {
            const overdue = isOverdue(t, today);
            return (
              <li key={t.id} className={cn("group flex items-center gap-4 py-2.5", t.status === "done" && "opacity-50")}>
                <button onClick={() => void life.toggleTask(t.id)} aria-label={t.status === "done" ? "Mark open" : "Complete"} className="shrink-0">{t.status === "done" ? <Check size={15} className="text-white" /> : <Circle size={15} className={cn(t.priority === "high" ? "text-white/70" : "text-white/25", "group-hover:text-white/60")} />}</button>
                <button onClick={() => setSelected(t.id === selected ? null : t.id)} className="flex min-w-0 flex-1 items-baseline gap-3 text-left">
                  <span className={cn("truncate text-[15px]", t.status === "done" ? "text-white/60 line-through decoration-white/20" : "text-white/90")}>{t.title}</span>
                  {t.tags.map((g) => <span key={g} className="text-micro text-white/30">#{g}</span>)}
                </button>
                <span className={cn("shrink-0 font-mono text-[11.5px] tabular", overdue ? "text-status-attention/80" : "text-white/35")}>{t.dueDay ? relativeDayLabel(t.dueDay, today) : t.recurrence ? describeSchedule(t.recurrence) : ""}{t.dueMinute != null ? ` ${formatMinute(t.dueMinute, hour12)}` : ""}{t.priority === "high" ? " · high" : t.priority === "low" ? " · low" : ""}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        {sel ? <TaskEditor task={sel} onClose={() => setSelected(null)} /> : (
          <div className="text-[13px] leading-relaxed text-white/35">
            <p className="label text-white/35">Quick add</p>
            <div className="rule mt-3 mb-3" />
            <p><span className="text-white/60">today · tomorrow · friday</span> set the day, <span className="text-white/60">3pm</span> a time, <span className="text-white/60">!high / !low</span> priority, <span className="text-white/60">#tag</span> tags. Select a task to edit notes, recurrence or move it to Someday.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const life = useLifeStore();
  const patch = (p: Partial<Task>) => void life.patch("tasks", task.id, p);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="label">Task</p>
        <span className="flex gap-4 text-[12px] text-white/35">
          <button onClick={() => { void life.remove("tasks", [task.id]); onClose(); }} className="hover:text-status-critical">Delete</button>
          <button onClick={onClose} className="hover:text-white">Close</button>
        </span>
      </div>
      <div className="rule mt-3 mb-4" />
      <input value={task.title} onChange={(e) => patch({ title: e.target.value })} className="w-full border-b border-white/10 bg-transparent pb-1 text-[18px] text-white focus:border-white/50 focus:outline-none" />
      <div className="mt-5 grid grid-cols-[92px_1fr] gap-x-6 gap-y-3 text-[13.5px]">
        <span className="text-white/35">Due</span>
        <div className="flex items-center gap-3">
          <input type="date" value={task.dueDay ?? ""} onChange={(e) => patch({ dueDay: e.target.value || null })} className="bg-transparent text-white/85 [color-scheme:dark] focus:outline-none" />
          <input value={task.dueMinute != null ? formatMinute(task.dueMinute, false) : ""} onBlur={(e) => patch({ dueMinute: e.target.value ? parseTimeInput(e.target.value) : null })} onChange={() => undefined} placeholder="time" className="w-14 border-b border-white/10 bg-transparent font-mono text-[12.5px] text-white/85 placeholder:text-white/25 focus:outline-none" />
          <button onClick={() => patch({ dueDay: null, dueMinute: null })} className="text-[12px] text-white/30 hover:text-white">clear</button>
        </div>
        <span className="text-white/35">Priority</span>
        <div className="flex gap-4 text-[12.5px]">{(["high", "normal", "low"] as const).map((p) => <button key={p} onClick={() => patch({ priority: p })} className={cn("capitalize", task.priority === p ? "text-white" : "text-white/40 hover:text-white/80")}>{p}</button>)}</div>
        <span className="text-white/35">Repeat</span>
        <div className="flex flex-wrap gap-4 text-[12.5px]">
          {[{ l: "Never", s: null }, { l: "Daily", s: { kind: "daily" as const } }, { l: "Weekdays", s: { kind: "weekdays" as const } }, { l: "Weekly", s: { kind: "days" as const, weekdays: [new Date(`${task.dueDay ?? todayKey()}T00:00:00`).getDay()] } }].map((o) => <button key={o.l} onClick={() => patch({ recurrence: o.s })} className={cn((o.s ? describeSchedule(o.s) : "Never") === (task.recurrence ? describeSchedule(task.recurrence) : "Never") ? "text-white" : "text-white/40 hover:text-white/80")}>{o.l}</button>)}
        </div>
        <span className="text-white/35">Lists</span>
        <div className="flex gap-4 text-[12.5px]">
          <button onClick={() => patch({ today: !task.today })} className={cn(task.today ? "text-white" : "text-white/40 hover:text-white/80")}>Show on Today</button>
          <button onClick={() => patch({ someday: !task.someday })} className={cn(task.someday ? "text-white" : "text-white/40 hover:text-white/80")}>Someday</button>
        </div>
        <span className="text-white/35">Tags</span>
        <input defaultValue={task.tags.join(" ")} onBlur={(e) => patch({ tags: e.target.value.split(/[\s,#]+/).map((x) => x.trim().toLowerCase()).filter(Boolean) })} placeholder="health pc" className="border-b border-white/10 bg-transparent text-white/85 placeholder:text-white/25 focus:outline-none" />
        <span className="text-white/35">Notes</span>
        <textarea defaultValue={task.notes ?? ""} onBlur={(e) => patch({ notes: e.target.value })} rows={3} className="resize-none border-b border-white/10 bg-transparent text-white/85 focus:outline-none" />
      </div>
    </div>
  );
}
