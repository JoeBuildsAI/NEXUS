/**
 * Local-time date helpers for the LIFE domain. Calendar days are `DayKey`
 * strings ("2026-09-27") derived from LOCAL wall-clock time — never from UTC —
 * so midnight, DST changes and timezone moves cannot shift a day.
 *
 * PORTABLE: no DOM, no Tauri, no React. Consumable by a future mobile app.
 */
export type DayKey = string; // YYYY-MM-DD in local time

export const DAY_MS = 86_400_000;
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayKey(now: Date = new Date()): DayKey {
  return dayKey(now);
}
export function isDayKey(s: unknown): s is DayKey {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime());
}
/** Local midnight for a day key. */
export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}
/** Add whole calendar days (DST-safe: works on local date components, not ms). */
export function addDays(key: DayKey, n: number): DayKey {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function addMonths(key: DayKey, n: number): DayKey {
  const d = parseDay(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return dayKey(d);
}
export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}
/** Signed number of calendar days from a to b. */
export function diffDays(a: DayKey, b: DayKey): number {
  const da = parseDay(a), db = parseDay(b);
  // Use UTC construction from local components so DST offsets don't yield 23/25 h days.
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / DAY_MS);
}
export function compareDays(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: DayKey): number {
  return parseDay(key).getDay();
}
/** Start of the week containing `key` (weekStartsOn: 0 Sunday, 1 Monday). */
export function startOfWeek(key: DayKey, weekStartsOn: 0 | 1 = 1): DayKey {
  const wd = weekdayOf(key);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(key, -back);
}
export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}
export function endOfMonth(key: DayKey): DayKey {
  const d = parseDay(key);
  return `${key.slice(0, 7)}-${pad(daysInMonth(d.getFullYear(), d.getMonth()))}`;
}
export function* eachDay(from: DayKey, to: DayKey): Generator<DayKey> {
  let k = from;
  while (compareDays(k, to) <= 0) {
    yield k;
    k = addDays(k, 1);
  }
}
export function daysBetween(from: DayKey, to: DayKey): DayKey[] {
  return [...eachDay(from, to)];
}

/** Minutes since local midnight (0–1439). */
export type MinuteOfDay = number;
export function minuteOfDay(d: Date): MinuteOfDay {
  return d.getHours() * 60 + d.getMinutes();
}
/** Local Date for a day key + minute of day. */
export function at(key: DayKey, minute: MinuteOfDay): Date {
  const d = parseDay(key);
  d.setMinutes(minute);
  return d;
}
export function epoch(key: DayKey, minute: MinuteOfDay = 0): number {
  return at(key, minute).getTime();
}
/** Day key + minute for an epoch, in local time. */
export function localParts(ms: number): { day: DayKey; minute: MinuteOfDay } {
  const d = new Date(ms);
  return { day: dayKey(d), minute: minuteOfDay(d) };
}
export function formatMinute(m: MinuteOfDay, hour12 = true): string {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  if (!hour12) return `${pad(h)}:${pad(mm)}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mm)} ${h < 12 ? "AM" : "PM"}`;
}
export function parseTimeInput(s: string): MinuteOfDay | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
export function formatDayLong(key: DayKey): string {
  const d = parseDay(key);
  return `${WEEKDAY_NAMES[d.getDay()]} · ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}
export function formatDayShort(key: DayKey): string {
  const d = parseDay(key);
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}`;
}
export function relativeDayLabel(key: DayKey, today: DayKey): string {
  const n = diffDays(today, key);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return formatDayLong(key);
}
export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
export function formatDurationMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
