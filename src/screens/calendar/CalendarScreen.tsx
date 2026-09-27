import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { useNavigationStore, type CalendarView } from "@/state/navigationStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useClock } from "@/hooks/useClock";
import { groupByDay, layoutColumns, occurrencesInRange, occurrencesOnDay } from "@/core/life/calendar";
import type { CalendarEvent, EventOccurrence } from "@/core/life/models";
import { addDays, addMonths, daysBetween, daysInMonth, endOfMonth, formatDayLong, formatMinute, minuteOfDay, MONTH_NAMES, parseDay, relativeDayLabel, startOfMonth, startOfWeek, todayKey, WEEKDAY_SHORT, type DayKey } from "@/core/life/time";
import { EventEditor, type EventDraft } from "./EventEditor";
import { cn } from "@/lib/utils";

const VIEWS: { id: CalendarView; label: string }[] = [{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }, { id: "agenda", label: "Agenda" }];
const HOUR_PX = 56;
const CATEGORY_TONE: Record<CalendarEvent["category"], string> = { personal: "bg-white/70", work: "bg-white/40", fitness: "bg-status-nominal/70", meal: "bg-white/25", routine: "bg-white/30", travel: "bg-status-attention/70", other: "bg-white/20" };

/**
 * Calendar. Local events are fully editable (create / edit / delete / series
 * exceptions / drag to move in day and week views); external providers appear
 * read-only when connected. Black, editorial, thin lines.
 */
export function CalendarScreen() {
  const now = useClock(30_000);
  const today = todayKey(now);
  const life = useLifeStore();
  const view = useNavigationStore((s) => s.calendarView);
  const setView = useNavigationStore((s) => s.setCalendarView);
  const anchor = useNavigationStore((s) => s.calendarDay) ?? today;
  const setAnchor = useNavigationStore((s) => s.setCalendarDay);
  const hour12 = useSettingsStore((s) => s.profile.clockFormat === "12h");
  const [editor, setEditor] = useState<EventDraft | null>(null);
  useEffect(() => { void life.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: ← → move, T today, D/W/M/Y/A views, N new
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || editor) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft") setAnchor(step(anchor, view, -1));
      else if (k === "arrowright") setAnchor(step(anchor, view, 1));
      else if (k === "t") setAnchor(today);
      else if (k === "n") setEditor(newDraft(anchor, 9 * 60));
      else if (["d", "w", "m", "y", "a"].includes(k)) setView(({ d: "day", w: "week", m: "month", y: "year", a: "agenda" } as const)[k as "d" | "w" | "m" | "y" | "a"]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, view, today, editor, setAnchor, setView]);

  const openEvent = (o: EventOccurrence) => {
    const e = o.event;
    if (e.readOnly) return;
    setEditor({ id: e.id, title: e.title, day: e.day, startMinute: e.startMinute, endDay: e.endDay, endMinute: e.endMinute, allDay: e.allDay, category: e.category, location: e.location ?? "", description: e.description ?? "", recurrence: e.recurrence ?? null, occurrenceDay: o.day });
  };
  const title = view === "day" ? formatDayLong(anchor) : view === "week" ? weekTitle(anchor) : view === "year" ? anchor.slice(0, 4) : view === "agenda" ? "Agenda" : `${MONTH_NAMES[parseDay(anchor).getMonth()]} ${anchor.slice(0, 4)}`;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1880px] flex-col px-12 pt-6 2xl:px-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-end gap-5">
          <h1 className="font-display text-display-lg font-semibold uppercase tracking-wide text-white">{title}</h1>
          <div className="flex items-center gap-1 pb-2">
            <button onClick={() => setAnchor(step(anchor, view, -1))} aria-label="Previous" className="flex h-7 w-7 items-center justify-center text-white/40 hover:text-white"><ChevronLeft size={15} /></button>
            <button onClick={() => setAnchor(today)} className={cn("px-2 text-[12.5px]", anchor === today ? "text-white/30" : "text-white/55 hover:text-white")}>Today</button>
            <button onClick={() => setAnchor(step(anchor, view, 1))} aria-label="Next" className="flex h-7 w-7 items-center justify-center text-white/40 hover:text-white"><ChevronRight size={15} /></button>
          </div>
        </div>
        <div className="flex items-center gap-6 pb-2 text-[13px]">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)} className={cn("relative pb-1 transition-colors", view === v.id ? "text-white" : "text-white/40 hover:text-white/75")}>
              {v.label}
              {view === v.id && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
            </button>
          ))}
          <button onClick={() => setEditor(newDraft(anchor, 9 * 60))} className="flex items-center gap-1.5 text-white/55 hover:text-white"><Plus size={13} /> New</button>
        </div>
      </div>
      <div className="rule mt-3" />

      <div className="min-h-0 flex-1 overflow-hidden pt-4">
        {view === "day" && <DayView day={anchor} events={life.events} today={today} nowMinute={minuteOfDay(now)} hour12={hour12} onOpen={openEvent} onCreate={(day, minute) => setEditor(newDraft(day, minute))} onMove={(id, day, m) => void life.moveEvent(id, day, m)} />}
        {view === "week" && <WeekView anchor={anchor} events={life.events} today={today} nowMinute={minuteOfDay(now)} hour12={hour12} onOpen={openEvent} onCreate={(day, minute) => setEditor(newDraft(day, minute))} onMove={(id, day, m) => void life.moveEvent(id, day, m)} onPickDay={(d) => { setAnchor(d); setView("day"); }} />}
        {view === "month" && <MonthView anchor={anchor} events={life.events} today={today} onPickDay={(d) => { setAnchor(d); setView("day"); }} onOpen={openEvent} />}
        {view === "year" && <YearView anchor={anchor} events={life.events} today={today} onPickMonth={(d) => { setAnchor(d); setView("month"); }} onPickDay={(d) => { setAnchor(d); setView("day"); }} />}
        {view === "agenda" && <AgendaView anchor={anchor} events={life.events} today={today} hour12={hour12} onOpen={openEvent} />}
      </div>
      {editor && <EventEditor draft={editor} onClose={() => setEditor(null)} />}
    </div>
  );
}

function newDraft(day: DayKey, minute: number): EventDraft {
  return { title: "", day, startMinute: minute, endDay: day, endMinute: Math.min(1440, minute + 60), allDay: false, category: "personal", location: "", description: "", recurrence: null };
}
function step(anchor: DayKey, view: CalendarView, dir: 1 | -1): DayKey {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week" || view === "agenda") return addDays(anchor, 7 * dir);
  if (view === "month") return addMonths(anchor, dir);
  return addMonths(anchor, 12 * dir);
}
function weekTitle(anchor: DayKey): string {
  const s = startOfWeek(anchor), e = addDays(s, 6);
  const a = parseDay(s), b = parseDay(e);
  return a.getMonth() === b.getMonth() ? `${MONTH_NAMES[a.getMonth()]} ${a.getDate()}–${b.getDate()}` : `${MONTH_NAMES[a.getMonth()]!.slice(0, 3)} ${a.getDate()} – ${MONTH_NAMES[b.getMonth()]!.slice(0, 3)} ${b.getDate()}`;
}

// ------------------------------------------------------------------ timeline (day + week columns)
interface ColumnProps {
  day: DayKey;
  occ: EventOccurrence[];
  today: DayKey;
  nowMinute: number;
  hour12: boolean;
  onOpen: (o: EventOccurrence) => void;
  onCreate: (day: DayKey, minute: number) => void;
  onMove: (id: string, day: DayKey, minute: number) => void;
  compact?: boolean;
}

function TimeColumn({ day, occ, today, nowMinute, hour12, onOpen, onCreate, onMove, compact }: ColumnProps) {
  const timed = occ.filter((o) => !o.event.allDay);
  const cols = useMemo(() => layoutColumns(timed), [timed]);
  const ref = useRef<HTMLDivElement>(null);
  const minuteAt = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1439, Math.round(((clientY - r.top) / (HOUR_PX * 24)) * 1440 / 15) * 15));
  };
  return (
    <div
      ref={ref}
      className="relative"
      style={{ height: HOUR_PX * 24 }}
      onDoubleClick={(e) => { if (e.target === e.currentTarget) onCreate(day, minuteAt(e.clientY)); }}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-nexus-event")) e.preventDefault(); }}
      onDrop={(e) => { const id = e.dataTransfer.getData("application/x-nexus-event"); if (id) { e.preventDefault(); onMove(id, day, minuteAt(e.clientY)); } }}
    >
      {Array.from({ length: 24 }, (_, h) => <div key={h} className="absolute inset-x-0 border-t border-white/[0.05]" style={{ top: h * HOUR_PX }} />)}
      {day === today && <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-white/80" style={{ top: (nowMinute / 1440) * HOUR_PX * 24 }}><span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-white" /></div>}
      {timed.map((o) => {
        const c = cols.get(o.key) ?? { col: 0, cols: 1 };
        const top = (o.startMinute / 1440) * HOUR_PX * 24;
        const height = Math.max(22, ((o.endMinute - o.startMinute) / 1440) * HOUR_PX * 24 - 2);
        const past = o.day < today || (o.day === today && o.endMinute <= nowMinute);
        return (
          <button
            key={o.key}
            draggable={!o.event.readOnly && !o.continuesBefore}
            onDragStart={(e) => { e.dataTransfer.setData("application/x-nexus-event", o.event.id); e.dataTransfer.effectAllowed = "move"; }}
            onClick={() => onOpen(o)}
            className={cn("absolute overflow-hidden rounded-[2px] border-l-2 bg-white/[0.04] px-2 py-1 text-left transition-colors hover:bg-white/[0.08]", past && "opacity-55", o.event.readOnly && "cursor-default")}
            style={{ top, height, left: `calc(${(c.col / c.cols) * 100}% + 2px)`, width: `calc(${100 / c.cols}% - 4px)`, borderColor: `rgba(255,255,255,${o.event.category === "fitness" ? 0.7 : 0.35})` }}
            title={o.event.title}
          >
            <span className={cn("block truncate text-[12.5px] leading-tight", compact ? "text-white/85" : "text-white/90")}>{o.event.title}</span>
            {height > 34 && <span className="block font-mono text-[10.5px] tabular text-white/40">{formatMinute(o.startMinute, hour12)}{o.continuesAfter ? " →" : ` – ${formatMinute(o.endMinute, hour12)}`}</span>}
          </button>
        );
      })}
    </div>
  );
}

function HourGutter({ hour12 }: { hour12: boolean }) {
  return (
    <div className="relative w-14 shrink-0" style={{ height: HOUR_PX * 24 }}>
      {Array.from({ length: 24 }, (_, h) => <span key={h} className="absolute -translate-y-1/2 pr-3 text-right font-mono text-[10.5px] tabular text-white/30" style={{ top: h * HOUR_PX, right: 0 }}>{h === 0 ? "" : hour12 ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}` : `${String(h).padStart(2, "0")}:00`}</span>)}
    </div>
  );
}

function AllDayRow({ occ, onOpen }: { occ: EventOccurrence[]; onOpen: (o: EventOccurrence) => void }) {
  const all = occ.filter((o) => o.event.allDay);
  if (!all.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pb-2">
      {all.map((o) => <button key={o.key} onClick={() => onOpen(o)} className={cn("rounded-[2px] border-l-2 border-white/50 bg-white/[0.05] px-2 py-0.5 text-[12px] text-white/85 hover:bg-white/[0.09]", o.event.readOnly && "cursor-default")}>{o.event.title}{o.continuesBefore || o.continuesAfter ? " ↔" : ""}</button>)}
    </div>
  );
}

function useScrollToMorning(ref: React.RefObject<HTMLDivElement>, deps: unknown[]) {
  useEffect(() => { if (ref.current) ref.current.scrollTop = HOUR_PX * 7; }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

function DayView(p: { day: DayKey; events: readonly CalendarEvent[]; today: DayKey; nowMinute: number; hour12: boolean; onOpen: (o: EventOccurrence) => void; onCreate: (d: DayKey, m: number) => void; onMove: (id: string, d: DayKey, m: number) => void }) {
  const occ = useMemo(() => occurrencesOnDay(p.events, p.day), [p.events, p.day]);
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToMorning(scroller, [p.day]);
  return (
    <div className="flex h-full flex-col">
      <div className="pl-14"><AllDayRow occ={occ} onOpen={p.onOpen} /></div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex">
          <HourGutter hour12={p.hour12} />
          <div className="flex-1"><TimeColumn day={p.day} occ={occ} today={p.today} nowMinute={p.nowMinute} hour12={p.hour12} onOpen={p.onOpen} onCreate={p.onCreate} onMove={p.onMove} /></div>
        </div>
      </div>
      <p className="pt-2 text-[11.5px] text-white/25">Double-click to create · drag to move · ← → days · N new · T today</p>
    </div>
  );
}

function WeekView(p: { anchor: DayKey; events: readonly CalendarEvent[]; today: DayKey; nowMinute: number; hour12: boolean; onOpen: (o: EventOccurrence) => void; onCreate: (d: DayKey, m: number) => void; onMove: (id: string, d: DayKey, m: number) => void; onPickDay: (d: DayKey) => void }) {
  const start = startOfWeek(p.anchor);
  const days = daysBetween(start, addDays(start, 6));
  const occ = useMemo(() => groupByDay(occurrencesInRange(p.events, start, addDays(start, 6))), [p.events, start]);
  const scroller = useRef<HTMLDivElement>(null);
  useScrollToMorning(scroller, [start]);
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-x-1">
        <span />
        {days.map((d) => (
          <button key={d} onClick={() => p.onPickDay(d)} className="pb-2 text-left">
            <span className={cn("text-micro", d === p.today ? "text-white" : "text-white/35")}>{WEEKDAY_SHORT[parseDay(d).getDay()]}</span>
            <span className={cn("ml-2 font-sans text-[18px] font-semibold tabular", d === p.today ? "text-white" : "text-white/60")}>{parseDay(d).getDate()}</span>
          </button>
        ))}
        <span />
        {days.map((d) => <div key={`ad-${d}`}><AllDayRow occ={occ.get(d) ?? []} onOpen={p.onOpen} /></div>)}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-x-1">
          <HourGutter hour12={p.hour12} />
          {days.map((d) => <div key={d} className={cn("border-l border-white/[0.05]", d === p.today && "bg-white/[0.015]")}><TimeColumn day={d} occ={occ.get(d) ?? []} today={p.today} nowMinute={p.nowMinute} hour12={p.hour12} onOpen={p.onOpen} onCreate={p.onCreate} onMove={p.onMove} compact /></div>)}
        </div>
      </div>
    </div>
  );
}

function MonthView(p: { anchor: DayKey; events: readonly CalendarEvent[]; today: DayKey; onPickDay: (d: DayKey) => void; onOpen: (o: EventOccurrence) => void }) {
  const first = startOfMonth(p.anchor);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(endOfMonth(p.anchor)), 6);
  const days = daysBetween(gridStart, gridEnd);
  const occ = useMemo(() => groupByDay(occurrencesInRange(p.events, gridStart, gridEnd)), [p.events, gridStart, gridEnd]);
  const month = parseDay(p.anchor).getMonth();
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 pb-1">{[1, 2, 3, 4, 5, 6, 0].map((wd) => <span key={wd} className="text-micro text-white/35">{WEEKDAY_SHORT[wd]}</span>)}</div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[repeat(auto-fit,minmax(0,1fr))] border-l border-t border-white/[0.06]">
        {days.map((d) => {
          const list = occ.get(d) ?? [];
          const inMonth = parseDay(d).getMonth() === month;
          return (
            <div key={d} className={cn("group relative min-h-0 border-b border-r border-white/[0.06] p-1.5", !inMonth && "opacity-40")}>
              <button onClick={() => p.onPickDay(d)} className={cn("flex h-6 w-6 items-center justify-center rounded-full font-sans text-[13px] tabular", d === p.today ? "bg-white text-black" : "text-white/70 group-hover:text-white")}>{parseDay(d).getDate()}</button>
              <div className="mt-1 space-y-0.5 overflow-hidden">
                {list.slice(0, 4).map((o) => (
                  <button key={o.key} onClick={() => (o.event.readOnly ? p.onPickDay(d) : p.onOpen(o))} className="flex w-full items-center gap-1.5 truncate text-left text-[11.5px] text-white/75 hover:text-white">
                    <span className={cn("h-1 w-1 shrink-0 rounded-full", CATEGORY_TONE[o.event.category])} />
                    <span className="truncate">{o.event.title}</span>
                  </button>
                ))}
                {list.length > 4 && <button onClick={() => p.onPickDay(d)} className="text-[11px] text-white/35 hover:text-white">+{list.length - 4} more</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView(p: { anchor: DayKey; events: readonly CalendarEvent[]; today: DayKey; onPickMonth: (d: DayKey) => void; onPickDay: (d: DayKey) => void }) {
  const year = Number(p.anchor.slice(0, 4));
  const busy = useMemo(() => {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const m = new Map<DayKey, number>();
    for (const o of occurrencesInRange(p.events, from, to)) m.set(o.day, (m.get(o.day) ?? 0) + 1);
    return m;
  }, [p.events, year]);
  return (
    <div className="grid h-full grid-cols-3 gap-x-10 gap-y-8 overflow-y-auto pb-8 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, mi) => {
        const first = `${year}-${String(mi + 1).padStart(2, "0")}-01`;
        const lead = (parseDay(first).getDay() + 6) % 7;
        const n = daysInMonth(year, mi);
        return (
          <div key={mi}>
            <button onClick={() => p.onPickMonth(first)} className="font-display text-[15px] uppercase tracking-wide text-white/80 hover:text-white">{MONTH_NAMES[mi]}</button>
            <div className="mt-2 grid grid-cols-7 gap-y-1 text-center font-mono text-[10.5px] tabular">
              {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
              {Array.from({ length: n }, (_, i) => {
                const d = `${first.slice(0, 8)}${String(i + 1).padStart(2, "0")}`;
                const count = busy.get(d) ?? 0;
                return (
                  <button key={d} onClick={() => p.onPickDay(d)} className={cn("relative mx-auto flex h-5 w-5 items-center justify-center rounded-full", d === p.today ? "bg-white text-black" : count ? "text-white" : "text-white/35 hover:text-white/70")}>
                    {i + 1}
                    {count > 0 && d !== p.today && <span className="absolute -bottom-0.5 h-[3px] w-[3px] rounded-full bg-white/70" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaView(p: { anchor: DayKey; events: readonly CalendarEvent[]; today: DayKey; hour12: boolean; onOpen: (o: EventOccurrence) => void }) {
  const from = p.anchor < p.today ? p.anchor : p.today;
  const to = addDays(p.anchor, 30);
  const groups = useMemo(() => [...groupByDay(occurrencesInRange(p.events, from, to)).entries()].sort(([a], [b]) => (a < b ? -1 : 1)), [p.events, from, to]);
  if (!groups.length) return <p className="py-10 text-[14px] text-white/35">Nothing scheduled in the next 30 days.</p>;
  return (
    <div className="h-full overflow-y-auto pb-10">
      {groups.map(([day, list]) => (
        <div key={day} className="grid grid-cols-[200px_1fr] gap-x-8 border-b border-white/[0.05] py-4">
          <div>
            <p className={cn("font-display text-[15px] uppercase tracking-wide", day === p.today ? "text-white" : "text-white/70")}>{relativeDayLabel(day, p.today)}</p>
            {day !== p.today && <p className="text-micro text-white/30">{formatDayLong(day)}</p>}
          </div>
          <ul className="space-y-1.5">
            {list.map((o) => (
              <li key={o.key}>
                <button onClick={() => p.onOpen(o)} className="flex w-full items-baseline gap-4 text-left">
                  <span className="w-28 shrink-0 font-mono text-[12px] tabular text-white/40">{o.event.allDay ? "All day" : `${formatMinute(o.startMinute, p.hour12)}`}</span>
                  <span className={cn("h-1.5 w-1.5 shrink-0 self-center rounded-full", CATEGORY_TONE[o.event.category])} />
                  <span className="truncate text-[14.5px] text-white/85">{o.event.title}</span>
                  {o.event.location && <span className="truncate text-[12.5px] text-white/35">{o.event.location}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
