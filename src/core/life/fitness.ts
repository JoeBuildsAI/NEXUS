import type { CompletedSet, Exercise, FitnessProgram, SessionExercise, WorkoutSession, WorkoutTemplate } from "./models";
import { newId } from "./models";
import { diffDays, weekdayOf, type DayKey } from "./time";

/** Template scheduled by an enabled program for a day (null = rest / nothing). */
export function scheduledTemplateId(program: FitnessProgram | null | undefined, day: DayKey): string | null {
  if (!program || !program.enabled || program.deletedAt) return null;
  if (program.mode === "manual") return program.manual[day] ?? null;
  if (program.mode === "weekly") return program.weekly[weekdayOf(day)] ?? null;
  const n = program.rotation.length;
  if (!n) return null;
  const d = diffDays(program.anchor, day);
  return program.rotation[((d % n) + n) % n] ?? null;
}

/** Build a fresh session from a template, pre-filling targets and previous values. */
export function startSession(template: WorkoutTemplate | null, day: DayKey, now: number, previous?: WorkoutSession | null, name?: string): WorkoutSession {
  const exercises: SessionExercise[] = (template?.exercises ?? []).slice().sort((a, b) => a.order - b.order).map((we, i) => {
    const prev = previous?.exercises.find((pe) => pe.exerciseId === we.exerciseId);
    return {
      id: newId("se"),
      exerciseId: we.exerciseId,
      order: i,
      skipped: false,
      notes: we.notes,
      sets: we.sets.map((t, k) => ({ id: newId("cs"), index: k, weight: prev?.sets[k]?.weight ?? t.weight ?? null, reps: null, rpe: null, done: false })),
    };
  });
  return { id: newId("ws"), createdAt: now, updatedAt: now, rev: 1, templateId: template?.id ?? null, name: name ?? template?.name ?? "Workout", day, startedAt: now, finishedAt: null, status: "active", exercises };
}

export function targetFor(template: WorkoutTemplate | null | undefined, exerciseId: string, setIndex: number): { repsMin: number; repsMax: number; weight: number | null } | null {
  const we = template?.exercises.find((e) => e.exerciseId === exerciseId);
  const t = we?.sets[setIndex] ?? we?.sets.at(-1);
  return t ? { repsMin: t.repsMin, repsMax: t.repsMax, weight: t.weight ?? null } : null;
}

export function setVolume(s: CompletedSet): number {
  return s.done && s.weight != null && s.reps != null ? s.weight * s.reps : 0;
}
export function sessionVolume(s: WorkoutSession): number {
  return s.exercises.reduce((sum, e) => sum + e.sets.reduce((a, st) => a + setVolume(st), 0), 0);
}
export function sessionSetsDone(s: WorkoutSession): { done: number; total: number } {
  const all = s.exercises.filter((e) => !e.skipped).flatMap((e) => e.sets);
  return { done: all.filter((x) => x.done).length, total: all.length };
}
export function sessionDurationMinutes(s: WorkoutSession, now = Date.now()): number {
  return Math.max(0, Math.round(((s.finishedAt ?? now) - s.startedAt) / 60_000));
}

/** Most recent finished session that used this exercise (for "previous" values). */
export function previousSessionFor(sessions: readonly WorkoutSession[], templateId: string | null, exerciseIds: readonly string[], before: number): WorkoutSession | null {
  const finished = sessions.filter((s) => s.status === "finished" && s.startedAt < before && !s.deletedAt).sort((a, b) => b.startedAt - a.startedAt);
  return finished.find((s) => (templateId && s.templateId === templateId) || s.exercises.some((e) => exerciseIds.includes(e.exerciseId))) ?? null;
}

export interface ExerciseBest {
  exerciseId: string;
  /** Heaviest completed weight. */
  maxWeight: number | null;
  /** Best estimated 1RM (Epley) among completed sets with reps ≤ 12; null when no weight. */
  estimated1rm: number | null;
  bestVolumeSet: number;
  sessionCount: number;
  lastDay: DayKey | null;
}
export function exerciseBests(sessions: readonly WorkoutSession[], exerciseId: string): ExerciseBest {
  let maxWeight: number | null = null, e1rm: number | null = null, bestVol = 0, count = 0, lastDay: DayKey | null = null;
  for (const s of sessions) {
    if (s.deletedAt || s.status !== "finished") continue;
    let used = false;
    for (const e of s.exercises) {
      if (e.exerciseId !== exerciseId || e.skipped) continue;
      for (const st of e.sets) {
        if (!st.done || st.reps == null) continue;
        used = true;
        if (st.weight != null) {
          maxWeight = Math.max(maxWeight ?? 0, st.weight);
          if (st.reps <= 12 && st.reps > 0) e1rm = Math.max(e1rm ?? 0, Math.round(st.weight * (1 + st.reps / 30)));
          bestVol = Math.max(bestVol, st.weight * st.reps);
        }
      }
    }
    if (used) { count++; if (!lastDay || s.day > lastDay) lastDay = s.day; }
  }
  return { exerciseId, maxWeight, estimated1rm: e1rm, bestVolumeSet: bestVol, sessionCount: count, lastDay };
}

/** Is this completed set a new max-weight PB against earlier sessions? */
export function isPersonalBest(prior: readonly WorkoutSession[], exerciseId: string, set: CompletedSet): boolean {
  if (!set.done || set.weight == null || set.reps == null || set.reps <= 0) return false;
  const best = exerciseBests(prior, exerciseId);
  return best.maxWeight == null || set.weight > best.maxWeight;
}

export interface FitnessSummary {
  sessions: number;
  totalVolume: number;
  totalMinutes: number;
  /** Scheduled workouts in the window vs sessions finished (adherence 0–1, null without a program). */
  adherence: number | null;
  byWeek: { week: DayKey; sessions: number; volume: number }[];
}
export function fitnessSummary(sessions: readonly WorkoutSession[], program: FitnessProgram | null, from: DayKey, to: DayKey, weekStart: (d: DayKey) => DayKey): FitnessSummary {
  const inRange = sessions.filter((s) => !s.deletedAt && s.status === "finished" && s.day >= from && s.day <= to);
  const byWeek = new Map<DayKey, { sessions: number; volume: number }>();
  for (const s of inRange) {
    const w = weekStart(s.day);
    const cur = byWeek.get(w) ?? { sessions: 0, volume: 0 };
    byWeek.set(w, { sessions: cur.sessions + 1, volume: cur.volume + sessionVolume(s) });
  }
  let scheduled = 0;
  if (program) {
    let d = from;
    while (d <= to) { if (scheduledTemplateId(program, d)) scheduled++; d = nextDay(d); }
  }
  return {
    sessions: inRange.length,
    totalVolume: inRange.reduce((a, s) => a + sessionVolume(s), 0),
    totalMinutes: inRange.reduce((a, s) => a + sessionDurationMinutes(s), 0),
    adherence: program && scheduled ? Math.min(1, inRange.length / scheduled) : null,
    byWeek: [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([week, v]) => ({ week, ...v })),
  };
}
function nextDay(d: DayKey): DayKey {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(y!, m! - 1, dd! + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function exerciseName(exercises: readonly Exercise[], id: string): string {
  return exercises.find((e) => e.id === id)?.name ?? "Exercise";
}
