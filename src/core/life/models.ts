import type { DayKey, MinuteOfDay } from "./time";
import type { Recurrence, Schedule } from "./recurrence";

/**
 * LIFE domain models. Every entity is sync-ready: stable id, createdAt /
 * updatedAt, optional tombstone (deletedAt) and a monotonically increasing
 * revision. PORTABLE — no Windows, Tauri or React types.
 *
 * Privacy class: PERSONAL (routines, fitness, nutrition, calendar, tasks).
 */
export interface Entity {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  rev: number;
  /** Sample/demo rows are flagged so they can be removed and never mix into analytics silently. */
  demo?: boolean;
}

// ---------------------------------------------------------------- calendar
export type CalendarSource = "local" | "google" | "microsoft";
export interface CalendarEvent extends Entity {
  title: string;
  description?: string;
  /** Local day + minute; all-day events use startMinute 0 / endMinute 0 with endDay ≥ day. */
  day: DayKey;
  startMinute: MinuteOfDay;
  endDay: DayKey;
  endMinute: MinuteOfDay;
  allDay: boolean;
  /** IANA timezone the event was created in (for future external sync). */
  timezone: string;
  recurrence?: Recurrence | null;
  source: CalendarSource;
  sourceAccountId?: string | null;
  location?: string;
  url?: string;
  /** Category token used for the colour hairline. */
  category: "personal" | "work" | "fitness" | "meal" | "routine" | "travel" | "other";
  readOnly: boolean;
  externalId?: string | null;
}

/** A concrete occurrence of an event on a day (recurring series expanded). */
export interface EventOccurrence {
  event: CalendarEvent;
  day: DayKey;
  startMinute: MinuteOfDay;
  endMinute: MinuteOfDay;
  /** True when the occurrence continues from/into another day. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  key: string;
}

// ------------------------------------------------------------------- tasks
export type TaskPriority = "low" | "normal" | "high";
export type TaskStatus = "open" | "done";
export interface Task extends Entity {
  title: string;
  notes?: string;
  dueDay?: DayKey | null;
  dueMinute?: MinuteOfDay | null;
  durationMinutes?: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  tags: string[];
  recurrence?: Schedule | null;
  /** Show on Today even without a due date. */
  today: boolean;
  /** Someday: parked, hidden from Today/Upcoming. */
  someday: boolean;
  completedAt?: number | null;
  source: "local";
}

// ---------------------------------------------------------------- routines
export type RoutineCategory = "morning" | "evening" | "skincare" | "hygiene" | "hair" | "cleaning" | "supplements" | "study" | "preparation" | "custom";
export interface RoutineStep {
  id: string;
  title: string;
  notes?: string;
  order: number;
  estimatedMinutes?: number | null;
  /** Product / item reference (free text; never a link). */
  item?: string | null;
  /** Step applies only when this schedule occurs on the day (e.g. retinol Tue/Fri). */
  condition?: Schedule | null;
}
export interface Routine extends Entity {
  name: string;
  category: RoutineCategory;
  schedule: Schedule;
  preferredMinute?: MinuteOfDay | null;
  estimatedMinutes?: number | null;
  steps: RoutineStep[];
  enabled: boolean;
  notes?: string;
}
export type StepState = "done" | "skipped";
/** One routine on one day. Absent = nothing logged yet. */
export interface RoutineCompletion extends Entity {
  routineId: string;
  day: DayKey;
  steps: Record<string, StepState>;
  /** "Not today": the whole routine is dismissed for this day. */
  dismissed: boolean;
}

// ----------------------------------------------------------------- fitness
export type MuscleGroup = "chest" | "back" | "shoulders" | "biceps" | "triceps" | "forearms" | "quads" | "hamstrings" | "glutes" | "calves" | "core" | "full-body" | "cardio";
export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "kettlebell" | "band" | "other";
export interface Exercise extends Entity {
  name: string;
  muscles: MuscleGroup[];
  equipment: Equipment;
  notes?: string;
  instructions?: string;
}
export interface WorkoutSetTarget {
  repsMin: number;
  repsMax: number;
  weight?: number | null;
}
export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  order: number;
  sets: WorkoutSetTarget[];
  restSeconds: number;
  notes?: string;
}
export interface WorkoutTemplate extends Entity {
  name: string;
  exercises: WorkoutExercise[];
  notes?: string;
  /** Category token shown in Today/Calendar ("Push", "Legs", …). */
  label?: string;
}
export type ProgramMode = "weekly" | "rotating" | "manual";
export interface FitnessProgram extends Entity {
  name: string;
  mode: ProgramMode;
  /** weekly: weekday (0–6) → template id or null (rest). */
  weekly: (string | null)[];
  /** rotating: sequence of template ids / null (rest), anchored at `anchor`. */
  rotation: (string | null)[];
  anchor: DayKey;
  /** manual: explicit day → template id. */
  manual: Record<DayKey, string>;
  enabled: boolean;
}
export interface CompletedSet {
  id: string;
  index: number;
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
  done: boolean;
  notes?: string;
}
export interface SessionExercise {
  id: string;
  exerciseId: string;
  order: number;
  sets: CompletedSet[];
  skipped: boolean;
  notes?: string;
}
export type SessionStatus = "active" | "finished" | "abandoned";
export interface WorkoutSession extends Entity {
  templateId: string | null;
  name: string;
  day: DayKey;
  startedAt: number;
  finishedAt?: number | null;
  status: SessionStatus;
  exercises: SessionExercise[];
  notes?: string;
}

// --------------------------------------------------------------- nutrition
export type Provenance = "known" | "estimated" | "user";
/** A nutrition metric with its provenance; null = UNKNOWN (never treated as 0). */
export interface Metric {
  value: number | null;
  provenance: Provenance | null;
}
export interface NutritionFacts {
  calories: Metric;
  protein: Metric;
  carbs: Metric;
  fat: Metric;
  fiber?: Metric;
  sugar?: Metric;
  sodium?: Metric;
}
export type Unit = "g" | "kg" | "oz" | "lb" | "ml" | "l" | "cup" | "tbsp" | "tsp" | "piece" | "serving" | "slice" | "scoop";
export interface Food extends Entity {
  name: string;
  brand?: string;
  servingAmount: number;
  servingUnit: Unit;
  /** Per serving. */
  facts: NutritionFacts;
  category: GroceryCategory;
  /** Estimated price per serving when known; null = unknown (never fabricated). */
  pricePerServing?: number | null;
  source: "user" | "sample" | "import";
  notes?: string;
}
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "custom";
export interface Ingredient {
  id: string;
  foodId: string;
  amount: number;
  unit: Unit;
}
export interface Meal extends Entity {
  name: string;
  slot: MealSlot;
  ingredients: Ingredient[];
  servings: number;
  instructions?: string;
  favorite: boolean;
  notes?: string;
}
export type MealLogStatus = "planned" | "eaten" | "partial" | "skipped" | "replaced";
export interface MealPlanEntry extends Entity {
  day: DayKey;
  slot: MealSlot;
  mealId: string;
  minute?: MinuteOfDay | null;
  /** Portion of the meal's one serving actually planned/eaten (1 = one serving). */
  portion: number;
  status: MealLogStatus;
  /** When status is "replaced": what was eaten instead. */
  replacedWithMealId?: string | null;
  replacedWithFoodId?: string | null;
}
export interface NutritionTargets {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber?: number | null;
}

// --------------------------------------------------------------- groceries
export type GroceryCategory = "produce" | "meat" | "dairy" | "pantry" | "frozen" | "bakery" | "beverages" | "household" | "other";
export interface GroceryItem extends Entity {
  name: string;
  foodId?: string | null;
  quantity: number;
  unit: Unit;
  category: GroceryCategory;
  /** Meal ids this requirement came from; empty for manual items. */
  sourceMealIds: string[];
  purchased: boolean;
  /** "Already have": excluded from the list but kept for the record. */
  haveIt: boolean;
  estimatedPrice?: number | null;
  actualPrice?: number | null;
  /** Week the list belongs to (Monday key), or "manual". */
  week: DayKey | "manual";
  manual: boolean;
}
export interface PantryItem extends Entity {
  name: string;
  foodId?: string | null;
  quantity: number;
  unit: Unit;
  expiresDay?: DayKey | null;
  lowThreshold?: number | null;
}

export type LifeCollection = "events" | "tasks" | "routines" | "routineCompletions" | "exercises" | "workoutTemplates" | "programs" | "sessions" | "foods" | "meals" | "mealPlan" | "groceries" | "pantry";

export interface LifeEntityMap {
  events: CalendarEvent;
  tasks: Task;
  routines: Routine;
  routineCompletions: RoutineCompletion;
  exercises: Exercise;
  workoutTemplates: WorkoutTemplate;
  programs: FitnessProgram;
  sessions: WorkoutSession;
  foods: Food;
  meals: Meal;
  mealPlan: MealPlanEntry;
  groceries: GroceryItem;
  pantry: PantryItem;
}

export const LIFE_COLLECTIONS: readonly LifeCollection[] = ["events", "tasks", "routines", "routineCompletions", "exercises", "workoutTemplates", "programs", "sessions", "foods", "meals", "mealPlan", "groceries", "pantry"];

let seq = 0;
/** Stable, sortable id: time prefix + random suffix. */
export function newId(prefix = "l"): string {
  seq = (seq + 1) % 4096;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36).padStart(3, "0")}-${Math.random().toString(36).slice(2, 8)}`;
}
export function stamp<T extends object>(data: T, now = Date.now(), prefix?: string): T & Entity {
  const id = (data as { id?: unknown }).id;
  return { ...data, id: typeof id === "string" && id ? id : newId(prefix), createdAt: now, updatedAt: now, rev: 1 } as T & Entity;
}
export function touch<T extends Entity>(e: T, patch: Partial<T>, now = Date.now()): T {
  return { ...e, ...patch, updatedAt: now, rev: e.rev + 1 };
}
