import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/core/life/models";
import type { Recurrence } from "@/core/life/recurrence";
import { describeRecurrence } from "@/core/life/recurrence";
import { formatMinute, parseTimeInput, type DayKey } from "@/core/life/time";
import { useLifeStore } from "@/state/lifeStore";
import { requestConfirm } from "@/state/confirmStore";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface EventDraft {
  id?: string;
  title: string;
  day: DayKey;
  startMinute: number;
  endDay: DayKey;
  endMinute: number;
  allDay: boolean;
  category: CalendarEvent["category"];
  location: string;
  description: string;
  recurrence: Recurrence | null;
  occurrenceDay?: DayKey;
}

const CATEGORIES: CalendarEvent["category"][] = ["personal", "work", "fitness", "meal", "routine", "travel", "other"];
const REPEATS: { label: string; value: Recurrence | null }[] = [
  { label: "Does not repeat", value: null },
  { label: "Daily", value: { freq: "daily" } },
  { label: "Weekdays", value: { freq: "weekly", byWeekday: [1, 2, 3, 4, 5] } },
  { label: "Weekly", value: { freq: "weekly" } },
  { label: "Every 2 weeks", value: { freq: "weekly", interval: 2 } },
  { label: "Monthly", value: { freq: "monthly" } },
  { label: "Yearly", value: { freq: "yearly" } },
];

/** Editorial event editor: title first, everything else as quiet inline fields. */
export function EventEditor({ draft, onClose }: { draft: EventDraft; onClose: () => void }) {
  const [d, setD] = useState<EventDraft>(draft);
  const [startText, setStartText] = useState(formatMinute(draft.startMinute, false));
  const [endText, setEndText] = useState(formatMinute(draft.endMinute, false));
  const { createEvent, updateEvent, deleteEvent } = useLifeStore();
  const ref = useRef<HTMLDivElement>(null);
  const isSeries = !!draft.id && !!draft.recurrence;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const save = async () => {
    const startMinute = parseTimeInput(startText) ?? d.startMinute;
    const endMinute = parseTimeInput(endText) ?? d.endMinute;
    const payload = { title: d.title.trim() || "Untitled", day: d.day, startMinute, endDay: d.endDay < d.day ? d.day : d.endDay, endMinute, allDay: d.allDay, category: d.category, location: d.location.trim() || undefined, description: d.description.trim() || undefined, recurrence: d.recurrence };
    if (d.id) await updateEvent(d.id, payload);
    else await createEvent(payload);
    onClose();
  };
  const remove = () => {
    if (!d.id) return onClose();
    if (isSeries && d.occurrenceDay) {
      requestConfirm({ title: "Delete this event?", message: "Remove only this occurrence, or the whole series?", confirmLabel: "This occurrence", onConfirm: async () => { await deleteEvent(d.id!, d.occurrenceDay); onClose(); }, secondaryLabel: "Whole series", onSecondary: async () => { await deleteEvent(d.id!); onClose(); } });
      return;
    }
    requestConfirm({ title: "Delete this event?", message: d.title, confirmLabel: "Delete", danger: true, onConfirm: async () => { await deleteEvent(d.id!); onClose(); } });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="glass-strong w-[560px] max-w-[94vw] rounded-md p-7">
        <p className="text-micro text-white/35">{d.id ? "Edit event" : "New event"}{isSeries ? " · series" : ""}</p>
        <input autoFocus value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void save()} placeholder="Title" className="mt-3 w-full border-b border-white/15 bg-transparent pb-2 font-display text-[24px] font-semibold tracking-wide text-white placeholder:text-white/20 focus:border-white/50 focus:outline-none" />

        <div className="mt-6 grid grid-cols-[92px_1fr] gap-x-6 gap-y-4 text-[14px]">
          <span className="text-white/35">Date</span>
          <div className="flex flex-wrap items-center gap-3">
            <input type="date" value={d.day} onChange={(e) => setD({ ...d, day: e.target.value, endDay: e.target.value > d.endDay ? e.target.value : d.endDay })} className="bg-transparent text-white/85 focus:outline-none [color-scheme:dark]" />
            <span className="text-white/25">→</span>
            <input type="date" value={d.endDay} min={d.day} onChange={(e) => setD({ ...d, endDay: e.target.value })} className="bg-transparent text-white/85 focus:outline-none [color-scheme:dark]" />
            <button onClick={() => setD({ ...d, allDay: !d.allDay })} className={cn("ml-2 text-[12.5px] transition-colors", d.allDay ? "text-white" : "text-white/40 hover:text-white/80")}>All day</button>
          </div>
          {!d.allDay && (
            <>
              <span className="text-white/35">Time</span>
              <div className="flex items-center gap-3 font-mono text-[13.5px]">
                <input value={startText} onChange={(e) => setStartText(e.target.value)} onBlur={() => { const m = parseTimeInput(startText); if (m != null) { setD({ ...d, startMinute: m }); setStartText(formatMinute(m, false)); } }} className="w-16 border-b border-white/15 bg-transparent text-white/85 focus:border-white/50 focus:outline-none" aria-label="Start time" />
                <span className="text-white/25">→</span>
                <input value={endText} onChange={(e) => setEndText(e.target.value)} onBlur={() => { const m = parseTimeInput(endText); if (m != null) { setD({ ...d, endMinute: m }); setEndText(formatMinute(m, false)); } }} className="w-16 border-b border-white/15 bg-transparent text-white/85 focus:border-white/50 focus:outline-none" aria-label="End time" />
                <span className="text-[12px] text-white/30">24-hour or 3pm</span>
              </div>
            </>
          )}
          <span className="text-white/35">Repeat</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {REPEATS.map((r) => <button key={r.label} onClick={() => setD({ ...d, recurrence: r.value ? { ...r.value, exceptions: d.recurrence?.exceptions } : null })} className={cn("transition-colors", describeRecurrence(d.recurrence) === describeRecurrence(r.value) ? "text-white" : "text-white/40 hover:text-white/80")}>{r.label}</button>)}
          </div>
          <span className="text-white/35">Category</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {CATEGORIES.map((c) => <button key={c} onClick={() => setD({ ...d, category: c })} className={cn("capitalize transition-colors", d.category === c ? "text-white" : "text-white/40 hover:text-white/80")}>{c}</button>)}
          </div>
          <span className="text-white/35">Location</span>
          <input value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder="Optional" className="border-b border-white/10 bg-transparent text-white/85 placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
          <span className="text-white/35">Notes</span>
          <textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={2} placeholder="Optional" className="resize-none border-b border-white/10 bg-transparent text-white/85 placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
        </div>

        <div className="mt-7 flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={() => void save()}>{d.id ? "Save" : "Create"}</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          {d.id && <button onClick={remove} className="ml-auto text-[12.5px] text-white/35 hover:text-status-critical">Delete</button>}
        </div>
      </div>
    </div>
  );
}
