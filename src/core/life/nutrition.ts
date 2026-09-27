import type { Food, Ingredient, Meal, MealPlanEntry, Metric, NutritionFacts, NutritionTargets, Unit } from "./models";
import type { DayKey } from "./time";

/**
 * Nutrition math with provenance. UNKNOWN stays unknown: a total that includes
 * any unknown component is reported with `complete: false` and the unknown
 * count, never silently as if the missing part were zero.
 */
export const UNKNOWN: Metric = { value: null, provenance: null };
export const metric = (value: number | null, provenance: Metric["provenance"] = "user"): Metric => ({ value, provenance: value == null ? null : provenance });

export interface Total {
  value: number;
  /** Number of components with unknown values that were left out. */
  unknown: number;
  /** All components known. */
  complete: boolean;
  /** Weakest provenance among contributors (known ≻ user ≻ estimated). */
  provenance: Metric["provenance"];
}
const RANK: Record<NonNullable<Metric["provenance"]>, number> = { known: 3, user: 2, estimated: 1 };

export function sumMetrics(parts: readonly { metric: Metric | undefined; factor: number }[]): Total {
  let value = 0, unknown = 0, prov: Metric["provenance"] = null, any = false;
  for (const p of parts) {
    const m = p.metric;
    if (!m || m.value == null) { unknown++; continue; }
    any = true;
    value += m.value * p.factor;
    if (!prov || RANK[m.provenance!] < RANK[prov]) prov = m.provenance;
  }
  return { value: Math.round(value * 10) / 10, unknown, complete: unknown === 0 && any, provenance: prov };
}

export type FactKey = "calories" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | "sodium";
export const FACT_KEYS: FactKey[] = ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"];
export const FACT_LABEL: Record<FactKey, string> = { calories: "Calories", protein: "Protein", carbs: "Carbohydrates", fat: "Fat", fiber: "Fiber", sugar: "Sugar", sodium: "Sodium" };
export const FACT_UNIT: Record<FactKey, string> = { calories: "kcal", protein: "g", carbs: "g", fat: "g", fiber: "g", sugar: "g", sodium: "mg" };

export type Totals = Record<FactKey, Total>;

// ---------------------------------------------------------------- units
/** Grams per unit for mass; ml per unit for volume; null = count-like. */
const MASS_G: Partial<Record<Unit, number>> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOLUME_ML: Partial<Record<Unit, number>> = { ml: 1, l: 1000, cup: 240, tbsp: 15, tsp: 5 };
export type UnitFamily = "mass" | "volume" | "count";
export function unitFamily(u: Unit): UnitFamily {
  return MASS_G[u] ? "mass" : VOLUME_ML[u] ? "volume" : "count";
}
/** Convert amount between compatible units; null when incompatible (count vs mass etc.). */
export function convertUnit(amount: number, from: Unit, to: Unit): number | null {
  if (from === to) return amount;
  const fa = unitFamily(from), fb = unitFamily(to);
  if (fa !== fb) return null;
  if (fa === "mass") return (amount * MASS_G[from]!) / MASS_G[to]!;
  if (fa === "volume") return (amount * VOLUME_ML[from]!) / VOLUME_ML[to]!;
  // count-like units (piece, serving, slice, scoop) are only convertible to themselves
  return null;
}

/** How many servings of `food` an ingredient amount represents; null when units are incompatible. */
export function servingsOf(food: Food, amount: number, unit: Unit): number | null {
  const converted = convertUnit(amount, unit, food.servingUnit);
  if (converted == null || food.servingAmount <= 0) return null;
  return converted / food.servingAmount;
}

/** Nutrition of a meal per ONE serving, derived from ingredients. */
export function mealFacts(meal: Meal, foods: readonly Food[], portion = 1): Totals & { incompatible: number } {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const contributions: { food: Food; servings: number }[] = [];
  let incompatible = 0;
  for (const ing of meal.ingredients) {
    const food = byId.get(ing.foodId);
    if (!food) { incompatible++; continue; }
    const s = servingsOf(food, ing.amount, ing.unit);
    if (s == null) { incompatible++; continue; }
    contributions.push({ food, servings: s });
  }
  const perServing = Math.max(1, meal.servings || 1);
  const out = {} as Totals & { incompatible: number };
  for (const k of FACT_KEYS) {
    const t = sumMetrics(contributions.map((c) => ({ metric: c.food.facts[k], factor: (c.servings * portion) / perServing })));
    // Ingredients that could not be resolved count as unknown for every metric.
    out[k] = { ...t, unknown: t.unknown + incompatible, complete: t.complete && incompatible === 0 };
  }
  out.incompatible = incompatible;
  return out;
}

export function foodFacts(food: Food, servings: number): Totals {
  const out = {} as Totals;
  for (const k of FACT_KEYS) out[k] = sumMetrics([{ metric: food.facts[k], factor: servings }]);
  return out;
}

export function addTotals(a: Totals, b: Totals): Totals {
  const out = {} as Totals;
  for (const k of FACT_KEYS) {
    const ta = a[k], tb = b[k];
    const prov = !ta.provenance ? tb.provenance : !tb.provenance ? ta.provenance : RANK[ta.provenance] < RANK[tb.provenance] ? ta.provenance : tb.provenance;
    out[k] = { value: Math.round((ta.value + tb.value) * 10) / 10, unknown: ta.unknown + tb.unknown, complete: ta.complete && tb.complete, provenance: prov };
  }
  return out;
}
export function emptyTotals(): Totals {
  const out = {} as Totals;
  for (const k of FACT_KEYS) out[k] = { value: 0, unknown: 0, complete: false, provenance: null };
  return out;
}

/** What an entry contributes given its log status (planned vs consumed views). */
export function entryFactor(e: MealPlanEntry, mode: "planned" | "consumed"): number {
  if (mode === "planned") return e.status === "skipped" ? 0 : e.portion;
  switch (e.status) {
    case "eaten": return e.portion;
    case "partial": return e.portion * 0.5;
    case "replaced": return e.portion;
    default: return 0; // planned / skipped: nothing consumed yet
  }
}

export interface DayNutrition {
  day: DayKey;
  planned: Totals;
  consumed: Totals;
  entries: number;
  logged: number;
}

export function dayNutrition(day: DayKey, plan: readonly MealPlanEntry[], meals: readonly Meal[], foods: readonly Food[]): DayNutrition {
  const mealsById = new Map(meals.map((m) => [m.id, m]));
  const foodsById = new Map(foods.map((f) => [f.id, f]));
  let planned = emptyTotals(), consumed = emptyTotals();
  let entries = 0, logged = 0;
  for (const e of plan) {
    if (e.day !== day || e.deletedAt) continue;
    entries++;
    if (e.status !== "planned") logged++;
    const meal = mealsById.get(e.mealId);
    const factsFor = (portion: number): Totals | null => {
      if (e.status === "replaced") {
        const rm = e.replacedWithMealId ? mealsById.get(e.replacedWithMealId) : null;
        if (rm) return mealFacts(rm, foods, portion);
        const rf = e.replacedWithFoodId ? foodsById.get(e.replacedWithFoodId) : null;
        if (rf) return foodFacts(rf, portion);
        return null;
      }
      return meal ? mealFacts(meal, foods, portion) : null;
    };
    const pf = entryFactor(e, "planned");
    const cf = entryFactor(e, "consumed");
    // Planned totals use the original meal even when replaced (what was planned).
    if (pf > 0 && meal) planned = addTotals(planned, mealFacts(meal, foods, pf));
    if (cf > 0) { const f = factsFor(cf); if (f) consumed = addTotals(consumed, f); }
  }
  // A day with entries but no known contributions is still "complete" (0 known parts) only if there were parts.
  return { day, planned, consumed, entries, logged };
}

export interface WeekNutrition {
  days: DayNutrition[];
  /** Averages over days that had planned entries. */
  averagePlanned: Partial<Record<FactKey, number>>;
  averageConsumed: Partial<Record<FactKey, number>>;
  /** Share of planned entries that were logged eaten/partial (adherence), null without entries. */
  adherence: number | null;
}
export function weekNutrition(days: readonly DayKey[], plan: readonly MealPlanEntry[], meals: readonly Meal[], foods: readonly Food[]): WeekNutrition {
  const dn = days.map((d) => dayNutrition(d, plan, meals, foods));
  const withPlan = dn.filter((d) => d.entries > 0);
  const avg = (pick: (d: DayNutrition) => Totals) => {
    const out: Partial<Record<FactKey, number>> = {};
    if (!withPlan.length) return out;
    for (const k of FACT_KEYS) out[k] = Math.round((withPlan.reduce((s, d) => s + pick(d)[k].value, 0) / withPlan.length) * 10) / 10;
    return out;
  };
  const entries = plan.filter((e) => days.includes(e.day) && !e.deletedAt);
  const eaten = entries.filter((e) => e.status === "eaten" || e.status === "partial" || e.status === "replaced").length;
  return { days: dn, averagePlanned: avg((d) => d.planned), averageConsumed: avg((d) => d.consumed), adherence: entries.length ? eaten / entries.length : null };
}

export function targetProgress(t: Totals, targets: NutritionTargets): { key: FactKey; value: number; target: number | null; ratio: number | null }[] {
  return (["calories", "protein", "carbs", "fat", "fiber"] as FactKey[]).map((key) => {
    const target = (targets as unknown as Record<string, number | null | undefined>)[key] ?? null;
    return { key, value: t[key].value, target, ratio: target ? t[key].value / target : null };
  });
}

/** Quick helper to build facts from plain numbers (user-entered). */
export function facts(v: Partial<Record<FactKey, number | null>>, provenance: NonNullable<Metric["provenance"]> = "user"): NutritionFacts {
  const m = (k: FactKey): Metric => ({ value: v[k] ?? null, provenance: v[k] == null ? null : provenance });
  return { calories: m("calories"), protein: m("protein"), carbs: m("carbs"), fat: m("fat"), fiber: m("fiber"), sugar: m("sugar"), sodium: m("sodium") };
}

export function ingredient(foodId: string, amount: number, unit: Unit, id = `ing-${Math.random().toString(36).slice(2, 8)}`): Ingredient {
  return { id, foodId, amount, unit };
}
