import type { Food, GroceryCategory, GroceryItem, Meal, MealPlanEntry, PantryItem, Unit } from "./models";
import { newId } from "./models";
import { convertUnit, unitFamily } from "./nutrition";
import type { DayKey } from "./time";

/**
 * Grocery derivation: MEAL PLAN → INGREDIENT REQUIREMENTS → AGGREGATE →
 * NORMALIZE UNITS → SUBTRACT PANTRY → SHOPPING LIST. Pure; never invents prices.
 */
export interface Requirement {
  foodId: string;
  name: string;
  quantity: number;
  unit: Unit;
  category: GroceryCategory;
  sourceMealIds: string[];
  /** Ingredient lines that could not be merged because their unit family differs. */
  conflicts: { quantity: number; unit: Unit; mealId: string }[];
}

/** Preferred display unit per family when aggregating mixed but compatible units. */
function canonicalUnit(units: Unit[]): Unit {
  const fam = unitFamily(units[0]!);
  if (fam === "mass") return units.some((u) => u === "kg" || u === "lb") && units.every((u) => u === "kg" || u === "lb") ? units[0]! : "g";
  if (fam === "volume") return units.every((u) => u === "l") ? "l" : "ml";
  return units[0]!;
}

export function deriveRequirements(plan: readonly MealPlanEntry[], meals: readonly Meal[], foods: readonly Food[], days: readonly DayKey[]): Requirement[] {
  const mealsById = new Map(meals.map((m) => [m.id, m]));
  const foodsById = new Map(foods.map((f) => [f.id, f]));
  const lines: { foodId: string; quantity: number; unit: Unit; mealId: string }[] = [];
  const daySet = new Set(days);
  for (const e of plan) {
    if (e.deletedAt || !daySet.has(e.day) || e.status === "skipped") continue;
    const meal = mealsById.get(e.mealId);
    if (!meal) continue;
    const perServing = Math.max(1, meal.servings || 1);
    for (const ing of meal.ingredients) lines.push({ foodId: ing.foodId, quantity: (ing.amount * e.portion) / perServing, unit: ing.unit, mealId: meal.id });
  }
  const byFood = new Map<string, typeof lines>();
  for (const l of lines) byFood.set(l.foodId, [...(byFood.get(l.foodId) ?? []), l]);
  const out: Requirement[] = [];
  for (const [foodId, ls] of byFood) {
    const food = foodsById.get(foodId);
    const families = new Map<string, typeof lines>();
    for (const l of ls) families.set(unitFamily(l.unit), [...(families.get(unitFamily(l.unit)) ?? []), l]);
    // The dominant family (most lines) becomes the requirement; others are conflicts shown to the user.
    const [dominant, ...rest] = [...families.values()].sort((a, b) => b.length - a.length);
    const unit = canonicalUnit(dominant!.map((l) => l.unit));
    const quantity = dominant!.reduce((s, l) => s + (convertUnit(l.quantity, l.unit, unit) ?? 0), 0);
    out.push({
      foodId,
      name: food?.name ?? "Unknown item",
      quantity: round(quantity),
      unit,
      category: food?.category ?? "other",
      sourceMealIds: [...new Set(ls.map((l) => l.mealId))],
      conflicts: rest.flat().map((l) => ({ quantity: round(l.quantity), unit: l.unit, mealId: l.mealId })),
    });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/** Subtract pantry stock (compatible units only). Returns remaining need per requirement. */
export function subtractPantry(reqs: readonly Requirement[], pantry: readonly PantryItem[]): (Requirement & { pantryCovered: number; remaining: number })[] {
  return reqs.map((r) => {
    const stock = pantry.filter((p) => !p.deletedAt && (p.foodId ? p.foodId === r.foodId : p.name.toLowerCase() === r.name.toLowerCase()));
    let covered = 0;
    for (const p of stock) {
      const c = convertUnit(p.quantity, p.unit, r.unit);
      if (c != null) covered += c;
    }
    const remaining = Math.max(0, r.quantity - covered);
    return { ...r, pantryCovered: round(Math.min(covered, r.quantity)), remaining: round(remaining) };
  });
}

/** Build/refresh the shopping list for a week, preserving manual items and purchased/haveIt flags. */
export function buildGroceryList(week: DayKey, reqs: readonly (Requirement & { remaining: number })[], existing: readonly GroceryItem[], foods: readonly Food[], now: number): GroceryItem[] {
  const foodsById = new Map(foods.map((f) => [f.id, f]));
  const prior = new Map(existing.filter((g) => g.week === week && !g.manual).map((g) => [g.foodId ?? g.name.toLowerCase(), g]));
  const derived: GroceryItem[] = reqs.filter((r) => r.remaining > 0).map((r) => {
    const old = prior.get(r.foodId);
    const food = foodsById.get(r.foodId);
    const price = food?.pricePerServing != null && food.servingAmount > 0 ? estimatePrice(food, r.remaining, r.unit) : null;
    return {
      id: old?.id ?? newId("g"),
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      rev: (old?.rev ?? 0) + 1,
      name: r.name,
      foodId: r.foodId,
      quantity: r.remaining,
      unit: r.unit,
      category: r.category,
      sourceMealIds: r.sourceMealIds,
      purchased: old?.purchased ?? false,
      haveIt: old?.haveIt ?? false,
      estimatedPrice: price,
      actualPrice: old?.actualPrice ?? null,
      week,
      manual: false,
    };
  });
  const manual = existing.filter((g) => g.week === week && g.manual && !g.deletedAt);
  return [...derived, ...manual];
}

/** Price only when the food has a known per-serving price and units convert; otherwise null. */
export function estimatePrice(food: Food, quantity: number, unit: Unit): number | null {
  if (food.pricePerServing == null) return null;
  const inServingUnit = convertUnit(quantity, unit, food.servingUnit);
  if (inServingUnit == null || food.servingAmount <= 0) return null;
  return Math.round((inServingUnit / food.servingAmount) * food.pricePerServing * 100) / 100;
}

export interface GrocerySummary {
  remaining: number;
  purchased: number;
  haveIt: number;
  /** Sum of known estimated prices for items still to buy; null if none have prices. */
  estimatedTotal: number | null;
  /** How many remaining items have no price. */
  unpriced: number;
  byCategory: { category: GroceryCategory; items: GroceryItem[] }[];
}
export const CATEGORY_ORDER: GroceryCategory[] = ["produce", "meat", "dairy", "bakery", "pantry", "frozen", "beverages", "household", "other"];
export const CATEGORY_LABEL: Record<GroceryCategory, string> = { produce: "Produce", meat: "Meat & fish", dairy: "Dairy & eggs", bakery: "Bakery", pantry: "Pantry", frozen: "Frozen", beverages: "Beverages", household: "Household", other: "Other" };

export function summarizeList(items: readonly GroceryItem[]): GrocerySummary {
  const live = items.filter((g) => !g.deletedAt);
  const toBuy = live.filter((g) => !g.purchased && !g.haveIt);
  const priced = toBuy.filter((g) => g.estimatedPrice != null);
  const byCategory = CATEGORY_ORDER.map((category) => ({ category, items: live.filter((g) => g.category === category).sort((a, b) => Number(a.purchased || a.haveIt) - Number(b.purchased || b.haveIt) || a.name.localeCompare(b.name)) })).filter((c) => c.items.length);
  return {
    remaining: toBuy.length,
    purchased: live.filter((g) => g.purchased).length,
    haveIt: live.filter((g) => g.haveIt).length,
    estimatedTotal: priced.length ? Math.round(priced.reduce((s, g) => s + (g.estimatedPrice ?? 0), 0) * 100) / 100 : null,
    unpriced: toBuy.length - priced.length,
    byCategory,
  };
}

export function lowStock(pantry: readonly PantryItem[]): PantryItem[] {
  return pantry.filter((p) => !p.deletedAt && p.lowThreshold != null && p.quantity <= p.lowThreshold);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
