import { useMemo, useState } from "react";
import { Check, Circle, Plus, X } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import type { GroceryCategory, GroceryItem, PantryItem, Unit } from "@/core/life/models";
import { CATEGORY_LABEL, CATEGORY_ORDER, lowStock, summarizeList } from "@/core/life/grocery";
import { addDays, formatDayShort, startOfWeek, todayKey, type DayKey } from "@/core/life/time";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const UNITS: Unit[] = ["g", "kg", "oz", "lb", "ml", "l", "cup", "tbsp", "tsp", "piece", "serving", "slice", "scoop"];

/** Groceries derived from the meal plan (aggregated, pantry-aware) plus manual items and a light pantry. */
export function GroceriesSection() {
  const life = useLifeStore();
  const today = todayKey();
  const [week, setWeek] = useState<DayKey>(startOfWeek(today));
  const [usePantry, setUsePantry] = useState(true);
  const [showPurchased, setShowPurchased] = useState(false);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => life.groceries.filter((g) => g.week === week), [life.groceries, week]);
  const summary = useMemo(() => summarizeList(items), [items]);
  const low = useMemo(() => lowStock(life.pantry), [life.pantry]);
  const regenerate = async () => { setBusy(true); try { await life.regenerateGroceries(week, { usePantry }); } finally { setBusy(false); } };
  const addManual = async () => {
    const m = /^(\d+(?:\.\d+)?)\s*(\w+)?\s+(.+)$/.exec(manual.trim());
    const qty = m ? Number(m[1]) : 1;
    const unit = (m && UNITS.includes(m[2] as Unit) ? (m[2] as Unit) : "piece");
    const name = m ? (UNITS.includes(m[2] as Unit) ? m[3]! : `${m[2] ?? ""} ${m[3]}`.trim()) : manual.trim();
    if (!name) return;
    await life.addGroceryItem(week, { name, quantity: qty, unit, category: guessCategory(name, life.foods.map((f) => ({ name: f.name, category: f.category }))) });
    setManual("");
  };

  return (
    <div className="grid gap-x-16 gap-y-12 xl:grid-cols-[1.4fr_1fr]">
      <div>
        <div className="flex flex-wrap items-baseline gap-5">
          <p className="label">Shopping list</p>
          <span className="flex gap-3 text-[12.5px]">{[-7, 0, 7].map((o) => { const w = addDays(startOfWeek(today), o); return <button key={o} onClick={() => setWeek(w)} className={cn(week === w ? "text-white" : "text-white/40 hover:text-white/80")}>{o === 0 ? "This week" : o < 0 ? "Last week" : "Next week"}</button>; })}<span className="font-mono text-[11px] text-white/25">{formatDayShort(week)}</span></span>
          <span className="ml-auto flex items-center gap-4 text-[12.5px]">
            <button onClick={() => setUsePantry((v) => !v)} className={cn(usePantry ? "text-white/70" : "text-white/35")}>{usePantry ? "Pantry subtracted" : "Ignoring pantry"}</button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void regenerate()}>{items.length ? "Rebuild from plan" : "Build from meal plan"}</Button>
          </span>
        </div>
        <div className="rule mt-3" />
        <div className="flex flex-wrap items-baseline gap-6 py-4 font-mono text-[12.5px] tabular text-white/45">
          <span><span className="text-[22px] font-sans font-semibold text-white">{summary.remaining}</span> to buy</span>
          <span>{summary.purchased} purchased</span>
          <span>{summary.haveIt} already have</span>
          {summary.estimatedTotal != null ? <span>~${summary.estimatedTotal.toFixed(2)} estimated{summary.unpriced ? ` · ${summary.unpriced} unpriced` : ""}</span> : <span className="text-white/30">no price data</span>}
          <button onClick={() => setShowPurchased((v) => !v)} className="ml-auto font-sans text-white/35 hover:text-white">{showPurchased ? "Hide done" : "Show done"}</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void addManual(); }}><input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Add item · “2 kg rice” or “paper towels”" className="mb-2 h-9 w-full border-b border-white/10 bg-transparent text-[14px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" /></form>
        {items.length === 0 && <p className="py-6 text-[13.5px] text-white/35">No list for this week. Build it from the meal plan or add items by hand.</p>}
        {summary.byCategory.map(({ category, items: list }) => {
          const visible = list.filter((g) => showPurchased || (!g.purchased && !g.haveIt));
          if (!visible.length) return null;
          return (
            <div key={category} className="mt-4">
              <p className="text-micro text-white/35">{CATEGORY_LABEL[category]}</p>
              <ul className="mt-1 divide-y divide-white/[0.05]">
                {visible.map((g) => <GroceryRow key={g.id} item={g} />)}
              </ul>
            </div>
          );
        })}
      </div>

      <div>
        <p className="label">Pantry</p>
        <div className="rule mt-3 mb-2" />
        <PantryEditor />
        {low.length > 0 && <p className="mt-4 text-[12px] text-white/40">Low: {low.map((p) => p.name).join(", ")}</p>}
        <p className="mt-6 text-[11.5px] leading-relaxed text-white/30">Pantry quantities are subtracted from derived requirements when units are compatible. Prices come only from foods you priced; nothing is guessed. Retailer ordering stays behind a provider boundary — the list works without any store account.</p>
      </div>
    </div>
  );
}

function GroceryRow({ item }: { item: GroceryItem }) {
  const life = useLifeStore();
  const done = item.purchased || item.haveIt;
  return (
    <li className={cn("group flex items-center gap-3 py-2 text-[14px]", done && "opacity-45")}>
      <button onClick={() => void life.patch("groceries", item.id, { purchased: !item.purchased, haveIt: false })} aria-label={item.purchased ? "Unmark" : "Purchased"}>{item.purchased ? <Check size={15} className="text-white" /> : <Circle size={15} className={cn("text-white/25 group-hover:text-white/60", item.haveIt && "text-white/10")} />}</button>
      <span className={cn("min-w-0 flex-1 truncate", done && "line-through decoration-white/20")}>{item.name}{item.haveIt ? <span className="ml-2 text-micro text-white/40">have it</span> : ""}</span>
      <input type="number" min={0} step="any" value={item.quantity} onChange={(e) => void life.patch("groceries", item.id, { quantity: Number(e.target.value) })} className="w-16 border-b border-transparent bg-transparent text-right font-mono text-[12.5px] tabular text-white/70 focus:border-white/30 focus:outline-none" aria-label="Quantity" />
      <span className="w-12 text-[12px] text-white/40">{item.unit}</span>
      <span className="w-14 text-right font-mono text-[12px] tabular text-white/40">{item.estimatedPrice != null ? `$${item.estimatedPrice.toFixed(2)}` : ""}</span>
      <span className="flex w-24 justify-end gap-3 text-[11.5px] text-white/0 group-hover:text-white/40">
        {!item.haveIt && <button onClick={() => void life.patch("groceries", item.id, { haveIt: true, purchased: false })} className="hover:!text-white">have</button>}
        <button onClick={() => void life.remove("groceries", [item.id])} className="hover:!text-white" aria-label="Remove"><X size={12} /></button>
      </span>
    </li>
  );
}

function PantryEditor() {
  const life = useLifeStore();
  const [draft, setDraft] = useState("");
  const add = async () => {
    const m = /^(\d+(?:\.\d+)?)\s*(\w+)?\s+(.+)$/.exec(draft.trim());
    const qty = m ? Number(m[1]) : 1;
    const unit = m && UNITS.includes(m[2] as Unit) ? (m[2] as Unit) : "piece";
    const name = m ? (UNITS.includes(m[2] as Unit) ? m[3]! : `${m[2] ?? ""} ${m[3]}`.trim()) : draft.trim();
    if (!name) return;
    const food = life.foods.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const now = Date.now();
    const row: PantryItem = { id: `pt-${now.toString(36)}`, createdAt: now, updatedAt: now, rev: 1, name: food?.name ?? name, foodId: food?.id ?? null, quantity: qty, unit: food && !m?.[2] ? food.servingUnit : unit, lowThreshold: null };
    await life.upsert("pantry", [row]);
    setDraft("");
  };
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex items-center gap-2"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add to pantry · “500 g rice”" className="h-9 flex-1 border-b border-white/10 bg-transparent text-[14px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" /><button type="submit" className="text-white/40 hover:text-white" aria-label="Add"><Plus size={14} /></button></form>
      {life.pantry.length === 0 && <p className="py-3 text-[13px] text-white/35">Pantry is empty (optional).</p>}
      <ul className="mt-1 divide-y divide-white/[0.05]">
        {life.pantry.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
          <li key={p.id} className="group flex items-center gap-3 py-2 text-[14px]">
            <span className="min-w-0 flex-1 truncate text-white/85">{p.name}</span>
            <input type="number" min={0} step="any" value={p.quantity} onChange={(e) => void life.patch("pantry", p.id, { quantity: Number(e.target.value) })} className="w-16 border-b border-transparent bg-transparent text-right font-mono text-[12.5px] tabular text-white/70 focus:border-white/30 focus:outline-none" aria-label="Quantity" />
            <span className="w-10 text-[12px] text-white/40">{p.unit}</span>
            <input type="number" min={0} step="any" value={p.lowThreshold ?? ""} placeholder="low" onChange={(e) => void life.patch("pantry", p.id, { lowThreshold: e.target.value === "" ? null : Number(e.target.value) })} className="w-12 border-b border-transparent bg-transparent text-right font-mono text-[11.5px] tabular text-white/40 placeholder:text-white/20 focus:border-white/30 focus:outline-none" aria-label="Low-stock threshold" />
            <button onClick={() => void life.remove("pantry", [p.id])} className="text-white/0 group-hover:text-white/30 hover:!text-white" aria-label="Remove"><X size={12} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function guessCategory(name: string, foods: { name: string; category: GroceryCategory }[]): GroceryCategory {
  const f = foods.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (f) return f.category;
  const n = name.toLowerCase();
  if (/towel|soap|detergent|paper|bag|clean/.test(n)) return "household";
  if (/milk|cheese|yogurt|egg|butter/.test(n)) return "dairy";
  if (/chicken|beef|pork|fish|salmon|turkey/.test(n)) return "meat";
  if (/apple|banana|lettuce|tomato|onion|pepper|broccoli|berr|fruit|veg/.test(n)) return "produce";
  if (/bread|bagel|tortilla|bun/.test(n)) return "bakery";
  if (/frozen|ice cream/.test(n)) return "frozen";
  if (/water|juice|coffee|tea|soda/.test(n)) return "beverages";
  return CATEGORY_ORDER.includes("pantry") ? "pantry" : "other";
}
