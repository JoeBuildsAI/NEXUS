import { addDays, addMonths, compareDays, diffDays, parseDay, weekdayOf, type DayKey } from "./time";

/**
 * Two recurrence models share this file:
 *  - `Schedule` — the LIFE cadence model (routines, programs, tasks): every day,
 *    weekdays, weekends, specific days, every N days, custom weekly, date range.
 *  - `Recurrence` — calendar-event recurrence (daily/weekly/monthly/yearly with
 *    interval, by-weekday, until/count) expanded over a date range.
 * Both operate on local DayKeys; nothing here touches UTC.
 */

export type ScheduleKind = "daily" | "weekdays" | "weekends" | "days" | "everyN" | "weekly" | "once";

export interface Schedule {
  kind: ScheduleKind;
  /** "days" and "weekly": 0–6 weekdays (0 = Sunday). */
  weekdays?: number[];
  /** "everyN": interval in days, anchored at `anchor` (or `from`). */
  every?: number;
  anchor?: DayKey;
  /** Optional active range (inclusive). "once" uses `from` as the single day. */
  from?: DayKey | null;
  to?: DayKey | null;
}

export const SCHEDULE_PRESETS: { id: string; label: string; schedule: Schedule }[] = [
  { id: "daily", label: "Every day", schedule: { kind: "daily" } },
  { id: "weekdays", label: "Weekdays", schedule: { kind: "weekdays" } },
  { id: "weekends", label: "Weekends", schedule: { kind: "weekends" } },
  { id: "mwf", label: "Mon · Wed · Fri", schedule: { kind: "days", weekdays: [1, 3, 5] } },
  { id: "tt", label: "Tue · Thu", schedule: { kind: "days", weekdays: [2, 4] } },
  { id: "every2", label: "Every 2 days", schedule: { kind: "everyN", every: 2 } },
  { id: "every3", label: "Every 3 days", schedule: { kind: "everyN", every: 3 } },
];

export function scheduleOccursOn(s: Schedule, day: DayKey): boolean {
  if (s.from && compareDays(day, s.from) < 0) return false;
  if (s.to && compareDays(day, s.to) > 0) return false;
  const wd = weekdayOf(day);
  switch (s.kind) {
    case "daily": return true;
    case "weekdays": return wd >= 1 && wd <= 5;
    case "weekends": return wd === 0 || wd === 6;
    case "days":
    case "weekly": return (s.weekdays ?? []).includes(wd);
    case "everyN": {
      const n = Math.max(1, Math.floor(s.every ?? 1));
      const anchor = s.anchor ?? s.from;
      if (!anchor) return true;
      const d = diffDays(anchor, day);
      return d >= 0 && d % n === 0;
    }
    case "once": return !!s.from && s.from === day;
  }
}

export function describeSchedule(s: Schedule): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (s.kind) {
    case "daily": return "Every day";
    case "weekdays": return "Weekdays";
    case "weekends": return "Weekends";
    case "days":
    case "weekly": return (s.weekdays ?? []).length === 7 ? "Every day" : (s.weekdays ?? []).slice().sort().map((d) => names[d]).join(" · ") || "Never";
    case "everyN": return s.every === 1 ? "Every day" : `Every ${s.every ?? 1} days`;
    case "once": return s.from ? `Once · ${s.from}` : "Once";
  }
}

/** Next day (≥ from) on which the schedule occurs, within `horizon` days. */
export function nextOccurrence(s: Schedule, from: DayKey, horizon = 370): DayKey | null {
  let k = from;
  for (let i = 0; i < horizon; i++) {
    if (scheduleOccursOn(s, k)) return k;
    k = addDays(k, 1);
  }
  return null;
}

// ------------------------------------------------------------- calendar events

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Recurrence {
  freq: Frequency;
  interval?: number;
  /** weekly: weekdays 0–6; defaults to the start day's weekday. */
  byWeekday?: number[];
  /** monthly: day of month (defaults to start day); clamps to month length. */
  byMonthDay?: number;
  until?: DayKey | null;
  count?: number | null;
  /** Skipped occurrence days (deleted single instances). */
  exceptions?: DayKey[];
}

export function describeRecurrence(r: Recurrence | null | undefined): string {
  if (!r) return "Does not repeat";
  const n = r.interval ?? 1;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const base = r.freq === "daily" ? (n === 1 ? "Daily" : `Every ${n} days`)
    : r.freq === "weekly" ? `${n === 1 ? "Weekly" : `Every ${n} weeks`}${r.byWeekday?.length ? ` on ${r.byWeekday.slice().sort().map((d) => names[d]).join(", ")}` : ""}`
    : r.freq === "monthly" ? (n === 1 ? "Monthly" : `Every ${n} months`)
    : n === 1 ? "Yearly" : `Every ${n} years`;
  return r.until ? `${base} until ${r.until}` : r.count ? `${base}, ${r.count} times` : base;
}

/**
 * Expand a recurring series into occurrence start days within [from, to].
 * `startDay` is the series' first occurrence. Bounded by `max` occurrences.
 */
export function expandRecurrence(startDay: DayKey, r: Recurrence, from: DayKey, to: DayKey, max = 2000): DayKey[] {
  const out: DayKey[] = [];
  const interval = Math.max(1, Math.floor(r.interval ?? 1));
  const exceptions = new Set(r.exceptions ?? []);
  const until = r.until && compareDays(r.until, to) < 0 ? r.until : to;
  let produced = 0; // counts occurrences from the series start, for `count`
  const push = (day: DayKey) => {
    produced++;
    if (r.count && produced > r.count) return false;
    if (compareDays(day, until) > 0) return false;
    if (compareDays(day, from) >= 0 && !exceptions.has(day)) out.push(day);
    return out.length < max;
  };
  if (r.freq === "daily") {
    // Jump close to `from` instead of iterating from the series start.
    let k = startDay;
    if (compareDays(k, from) < 0 && !r.count) {
      const skip = Math.floor(diffDays(k, from) / interval) * interval;
      k = addDays(k, skip);
    }
    while (compareDays(k, until) <= 0) { if (!push(k)) break; k = addDays(k, interval); }
  } else if (r.freq === "weekly") {
    const days = (r.byWeekday?.length ? r.byWeekday : [weekdayOf(startDay)]).slice().sort();
    let weekStart = addDays(startDay, -weekdayOf(startDay)); // Sunday of the start week
    if (compareDays(weekStart, from) < 0 && !r.count) {
      const weeks = Math.floor(diffDays(weekStart, from) / (7 * interval)) * interval;
      weekStart = addDays(weekStart, weeks * 7);
    }
    outer: while (compareDays(weekStart, until) <= 0) {
      for (const wd of days) {
        const day = addDays(weekStart, wd);
        if (compareDays(day, startDay) < 0) continue;
        if (compareDays(day, until) > 0) break outer;
        if (!push(day)) break outer;
      }
      weekStart = addDays(weekStart, 7 * interval);
    }
  } else if (r.freq === "monthly") {
    const dom = r.byMonthDay ?? parseDay(startDay).getDate();
    let i = 0;
    while (true) {
      const base = addMonths(`${startDay.slice(0, 7)}-01`, i * interval);
      const d = parseDay(base);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const day = `${base.slice(0, 7)}-${String(Math.min(dom, last)).padStart(2, "0")}`;
      if (compareDays(day, until) > 0) break;
      if (compareDays(day, startDay) >= 0 && !push(day)) break;
      i++;
      if (i > 12 * 200) break;
    }
  } else {
    const start = parseDay(startDay);
    for (let y = 0; ; y++) {
      const year = start.getFullYear() + y * interval;
      const last = new Date(year, start.getMonth() + 1, 0).getDate();
      const day = `${year}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(Math.min(start.getDate(), last)).padStart(2, "0")}`;
      if (compareDays(day, until) > 0) break;
      if (!push(day)) break;
      if (y > 500) break;
    }
  }
  return out;
}
