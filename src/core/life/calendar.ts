import type { CalendarEvent, EventOccurrence } from "./models";
import { expandRecurrence } from "./recurrence";
import { addDays, compareDays, daysBetween, diffDays, type DayKey } from "./time";

/**
 * Calendar domain: expand events (incl. recurring series and multi-day spans)
 * into per-day occurrences for any day range. Pure and local-time only.
 */
export function eventDurationDays(e: CalendarEvent): number {
  return Math.max(0, diffDays(e.day, e.endDay));
}

/** Occurrences of one event that touch [from, to], one per calendar day touched. */
export function occurrencesOf(e: CalendarEvent, from: DayKey, to: DayKey): EventOccurrence[] {
  if (e.deletedAt) return [];
  const span = eventDurationDays(e);
  // Series starts that could touch the range: start days from (from - span) to `to`.
  const starts = e.recurrence ? expandRecurrence(e.day, e.recurrence, addDays(from, -span), to) : compareDays(e.day, to) <= 0 && compareDays(e.endDay, from) >= 0 ? [e.day] : [];
  const out: EventOccurrence[] = [];
  for (const start of starts) {
    const end = addDays(start, span);
    for (const day of daysBetween(start, end)) {
      if (compareDays(day, from) < 0 || compareDays(day, to) > 0) continue;
      const first = day === start, last = day === end;
      out.push({
        event: e,
        day,
        startMinute: e.allDay ? 0 : first ? e.startMinute : 0,
        endMinute: e.allDay ? 1440 : last ? (span === 0 ? e.endMinute : e.endMinute || 1440) : 1440,
        continuesBefore: !first,
        continuesAfter: !last,
        key: `${e.id}@${start}#${day}`,
      });
    }
  }
  return out;
}

export function occurrencesInRange(events: readonly CalendarEvent[], from: DayKey, to: DayKey): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const e of events) out.push(...occurrencesOf(e, from, to));
  return out.sort((a, b) => compareDays(a.day, b.day) || Number(b.event.allDay) - Number(a.event.allDay) || a.startMinute - b.startMinute || a.event.title.localeCompare(b.event.title));
}

export function occurrencesOnDay(events: readonly CalendarEvent[], day: DayKey): EventOccurrence[] {
  return occurrencesInRange(events, day, day);
}

/** Group by day for month/agenda views. */
export function groupByDay(occ: readonly EventOccurrence[]): Map<DayKey, EventOccurrence[]> {
  const m = new Map<DayKey, EventOccurrence[]>();
  for (const o of occ) m.set(o.day, [...(m.get(o.day) ?? []), o]);
  return m;
}

/**
 * Column layout for overlapping timed events in a day/week column: returns for
 * each occurrence a column index and the total columns in its cluster.
 */
export function layoutColumns(occ: readonly EventOccurrence[]): Map<string, { col: number; cols: number }> {
  const timed = occ.filter((o) => !o.event.allDay).slice().sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  const result = new Map<string, { col: number; cols: number }>();
  let cluster: EventOccurrence[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols: number[] = []; // end minute per column
    const assigned: [EventOccurrence, number][] = [];
    for (const o of cluster) {
      let c = cols.findIndex((end) => end <= o.startMinute);
      if (c === -1) { c = cols.length; cols.push(0); }
      cols[c] = o.endMinute;
      assigned.push([o, c]);
    }
    for (const [o, c] of assigned) result.set(o.key, { col: c, cols: cols.length });
    cluster = [];
    clusterEnd = -1;
  };
  for (const o of timed) {
    if (cluster.length && o.startMinute >= clusterEnd) flush();
    cluster.push(o);
    clusterEnd = Math.max(clusterEnd, o.endMinute);
  }
  if (cluster.length) flush();
  return result;
}

/** Validate/normalize an event draft (end after start; all-day spans whole days). */
export function normalizeEvent<T extends Pick<CalendarEvent, "day" | "startMinute" | "endDay" | "endMinute" | "allDay">>(e: T): T {
  let { day, startMinute, endDay, endMinute } = e;
  if (compareDays(endDay, day) < 0) endDay = day;
  if (e.allDay) return { ...e, startMinute: 0, endMinute: 0, endDay };
  if (endDay === day && endMinute <= startMinute) endMinute = Math.min(1440, startMinute + 30);
  return { ...e, day, startMinute, endDay, endMinute };
}

export function isEventDeletedOn(e: CalendarEvent, day: DayKey): boolean {
  return !!e.recurrence?.exceptions?.includes(day);
}
