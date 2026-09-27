import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import type { Food, NutritionTargets, Unit } from "@/core/life/models";
import { dayNutrition, FACT_KEYS, FACT_LABEL, FACT_UNIT, facts, targetProgress, weekNutrition, type FactKey, type Total } from "@/core/life/nutrition";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/core/life/grocery";
import { addDays, daysBetween, formatDayShort, startOfWeek, todayKey } from "@/core/life/time";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const UNITS: Unit[] = ["g", "kg", "oz", "lb", "ml", "l", "cup", "tbsp", "tsp", "piece", "serving", "slice", "scoop"];

/** Nutrition metrics (calories / macros) against user-configured planning targets, plus the food library. */
export function NutritionSection() {
  const life = useLifeStore();
  const today = todayKey();
  const week = startOfWeek(today);
  const days = daysBetween(week, addDays(week, 6));
  const day = useMemo(() => dayNutrition(today, life.mealPlan, life.meals, life.foods), [today, life.mealPlan, life.meals, life.foods]);
  const wk = useMemo(() => weekNutrition(days, life.mealPlan, life.meals, life.foods), [days, life.mealPlan, life.meals, life.foods]);
  const [editTargets, setEditTargets] = useState(false);
  const [foodEditor, setFoodEditor] = useState<Food | "new" | null>(null);
  const [query, setQuery] = useState("");
  const foods = life.foods.filter((f) => !query || f.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1fr_1fr]">
      <div>
        <div className="flex items-baseline justify-between"><p className="label">Today</p><button onClick={() => setEditTargets((v) => !v)} className="text-[12px] text-white/35 hover:text-white">{editTargets ? "Done" : "Edit targets"}</button></div>
        <div className="rule mt-3 mb-4" />
        {editTargets ? <TargetsEditor targets={life.targets} onSave={(t) => { void life.setTargets(t); setEditTargets(false); }} /> : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-8 gap-y-2 text-[14px]">
              <span className="text-micro text-white/30">Metric</span><span className="text-right text-micro text-white/30">Target</span><span className="text-right text-micro text-white/30">Planned</span><span className="text-right text-micro text-white/30">Eaten</span>
              {targetProgress(day.consumed, life.targets).map((p) => (
                <FactRow key={p.key} label={FACT_LABEL[p.key]} unit={FACT_UNIT[p.key]} target={p.target} planned={day.planned[p.key]} consumed={day.consumed[p.key]} />
              ))}
            </div>
            <p className="mt-4 text-[11.5px] leading-relaxed text-white/30">Targets are your own planning numbers — NEXUS never suggests them or implies they are appropriate for you. Values marked ~ include estimated data; “partly unknown” means an ingredient has no nutrition on file and was left out, not counted as zero.</p>
          </>
        )}

        <p className="label mt-10">This week</p>
        <div className="rule mt-3 mb-4" />
        <div className="grid grid-cols-4 gap-6">
          {(["calories", "protein", "carbs", "fat"] as FactKey[]).map((k) => <div key={k}><p className="font-sans text-[24px] font-semibold tabular tracking-tight text-white">{wk.averageConsumed[k] != null ? Math.round(wk.averageConsumed[k]!) : "—"}</p><p className="text-[12px] text-white/40">avg {FACT_LABEL[k].toLowerCase()} eaten{life.targets[k as keyof NutritionTargets] ? ` · ${life.targets[k as keyof NutritionTargets]} target` : ""}</p></div>)}
        </div>
        <div className="mt-5 flex h-20 items-end gap-2">
          {wk.days.map((d) => { const t = life.targets.calories ?? Math.max(1, ...wk.days.map((x) => x.planned.calories.value)); return (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day} · planned ${Math.round(d.planned.calories.value)} · eaten ${Math.round(d.consumed.calories.value)}`}>
              <div className="relative w-full" style={{ height: 56 }}>
                <div className="absolute bottom-0 w-full bg-white/[0.08]" style={{ height: `${Math.min(100, (d.planned.calories.value / t) * 100)}%` }} />
                <div className={cn("absolute bottom-0 w-full", d.day === today ? "bg-white" : "bg-white/55")} style={{ height: `${Math.min(100, (d.consumed.calories.value / t) * 100)}%` }} />
              </div>
              <span className={cn("font-mono text-[10px]", d.day === today ? "text-white" : "text-white/35")}>{formatDayShort(d.day).slice(0, 3)}</span>
            </div>
          ); })}
        </div>
        <p className="mt-2 text-[11.5px] text-white/30">Bars: eaten over planned, relative to the calorie target.{wk.adherence != null ? ` Meal-plan adherence ${Math.round(wk.adherence * 100)}%.` : ""}</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between"><p className="label">Foods</p><button onClick={() => setFoodEditor("new")} className="flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white"><Plus size={13} /> Add food</button></div>
        <div className="rule mt-3 mb-2" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods" className="h-9 w-full border-b border-white/10 bg-transparent text-[14px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
        {foods.length === 0 && <p className="py-4 text-[13px] text-white/35">No foods yet. Add one to start building meals.</p>}
        <ul className="mt-2 max-h-[60vh] divide-y divide-white/[0.05] overflow-y-auto">
          {foods.map((f) => (
            <li key={f.id} className="flex items-baseline gap-3 py-2 text-[14px]">
              <button onClick={() => setFoodEditor(f)} className="text-white/85 hover:text-white">{f.name}</button>
              <span className="text-[11.5px] text-white/30">{f.servingAmount} {f.servingUnit}</span>
              <span className="ml-auto font-mono text-[12px] tabular text-white/45">{f.facts.calories.value != null ? `${f.facts.calories.value} kcal` : "kcal unknown"}{f.facts.protein.value != null ? ` · ${f.facts.protein.value} P` : ""}</span>
              <span className={cn("text-micro", f.facts.calories.provenance === "known" ? "text-white/45" : f.facts.calories.provenance === "estimated" ? "text-status-attention/60" : "text-white/25")}>{f.facts.calories.provenance ?? "unknown"}</span>
            </li>
          ))}
        </ul>
      </div>
      {foodEditor && <FoodEditor food={foodEditor === "new" ? null : foodEditor} onClose={() => setFoodEditor(null)} />}
    </div>
  );
}

function FactRow({ label, unit, target, planned, consumed }: { label: string; unit: string; target: number | null; planned: Total; consumed: Total }) {
  const fmt = (t: Total) => `${t.provenance === "estimated" ? "~" : ""}${Math.round(t.value)}${t.complete ? "" : "†"}`;
  return (
    <>
      <span className="text-white/80">{label} <span className="text-[11px] text-white/30">{unit}</span></span>
      <span className="text-right font-mono text-[13px] tabular text-white/45">{target ?? "—"}</span>
      <span className="text-right font-mono text-[13px] tabular text-white/60">{fmt(planned)}</span>
      <span className={cn("text-right font-mono text-[13px] tabular", target && consumed.value > target * 1.1 ? "text-status-attention/80" : "text-white")}>{fmt(consumed)}</span>
    </>
  );
}

function TargetsEditor({ targets, onSave }: { targets: NutritionTargets; onSave: (t: NutritionTargets) => void }) {
  const [t, setT] = useState<NutritionTargets>(targets);
  const F = ({ k, label }: { k: keyof NutritionTargets; label: string }) => (
    <label className="flex items-baseline justify-between gap-4 text-[14px]"><span className="text-white/70">{label}</span><input type="number" min={0} value={t[k] ?? ""} placeholder="—" onChange={(e) => setT({ ...t, [k]: e.target.value === "" ? null : Number(e.target.value) })} className="w-24 border-b border-white/15 bg-transparent text-right font-mono text-[14px] tabular text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" /></label>
  );
  return (
    <div className="max-w-sm space-y-3">
      <F k="calories" label="Calories (kcal)" /><F k="protein" label="Protein (g)" /><F k="carbs" label="Carbohydrates (g)" /><F k="fat" label="Fat (g)" /><F k="fiber" label="Fiber (g)" />
      <div className="flex gap-3 pt-2"><Button size="sm" variant="primary" onClick={() => onSave(t)}>Save targets</Button><Button size="sm" variant="ghost" onClick={() => onSave(targets)}>Cancel</Button></div>
      <p className="text-[11.5px] text-white/30">Leave a field empty for no target.</p>
    </div>
  );
}

function FoodEditor({ food, onClose }: { food: Food | null; onClose: () => void }) {
  const life = useLifeStore();
  const [f, setF] = useState<Food>(food ?? { id: "", createdAt: 0, updatedAt: 0, rev: 0, name: "", servingAmount: 100, servingUnit: "g", facts: facts({}), category: "pantry", source: "user", pricePerServing: null });
  const [prov, setProv] = useState<"known" | "estimated" | "user">(food?.facts.calories.provenance ?? "user");
  const val = (k: FactKey) => f.facts[k]?.value ?? null;
  const setVal = (k: FactKey, v: string) => setF({ ...f, facts: { ...f.facts, [k]: { value: v === "" ? null : Number(v), provenance: v === "" ? null : prov } } });
  const save = async () => {
    if (!f.name.trim() || f.servingAmount <= 0) return;
    const now = Date.now();
    const factsOut = Object.fromEntries(FACT_KEYS.map((k) => [k, { value: val(k), provenance: val(k) == null ? null : prov }])) as unknown as Food["facts"];
    await life.upsert("foods", [f.id ? { ...f, name: f.name.trim(), facts: factsOut, updatedAt: now, rev: f.rev + 1 } : { ...f, id: `fd-${now.toString(36)}`, name: f.name.trim(), facts: factsOut, createdAt: now, updatedAt: now, rev: 1 }]);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-strong max-h-[90vh] w-[600px] max-w-[94vw] overflow-y-auto rounded-md p-7">
        <div className="flex items-baseline justify-between"><p className="text-micro text-white/35">{food ? "Edit food" : "New food"}</p>{food && <button onClick={() => { void life.remove("foods", [food.id]); onClose(); }} className="text-[12px] text-white/35 hover:text-status-critical">Delete</button>}</div>
        <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Food name" className="mt-3 w-full border-b border-white/15 bg-transparent pb-2 font-display text-[24px] font-semibold tracking-wide text-white placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
        <div className="mt-6 grid grid-cols-[92px_1fr] gap-x-6 gap-y-4 text-[14px]">
          <span className="text-white/35">Serving</span>
          <div className="flex items-center gap-3 font-mono text-[13.5px]"><input type="number" min={0.01} step="any" value={f.servingAmount} onChange={(e) => setF({ ...f, servingAmount: Number(e.target.value) })} className="w-20 border-b border-white/15 bg-transparent text-white focus:outline-none" /><select value={f.servingUnit} onChange={(e) => setF({ ...f, servingUnit: e.target.value as Unit })} className="bg-transparent text-white/85 [color-scheme:dark] focus:outline-none">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
          <span className="text-white/35">Category</span>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Food["category"] })} className="w-fit bg-transparent text-white/85 [color-scheme:dark] focus:outline-none">{CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
          <span className="text-white/35">Values are</span>
          <div className="flex gap-4 text-[12.5px]">{(["known", "estimated", "user"] as const).map((p) => <button key={p} onClick={() => setProv(p)} className={cn(prov === p ? "text-white" : "text-white/40 hover:text-white/80")}>{p === "known" ? "Known (label)" : p === "estimated" ? "Estimated" : "My entry"}</button>)}</div>
          <span className="text-white/35">Per serving</span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {FACT_KEYS.map((k) => <label key={k} className="flex items-baseline justify-between gap-2 text-[13px]"><span className="text-white/55">{FACT_LABEL[k]}</span><input type="number" min={0} step="any" value={val(k) ?? ""} placeholder="?" onChange={(e) => setVal(k, e.target.value)} className="w-16 border-b border-white/10 bg-transparent text-right font-mono text-[13px] tabular text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" /></label>)}
          </div>
          <span className="text-white/35">Price</span>
          <div className="flex items-center gap-2 font-mono text-[13.5px]"><span className="text-white/35">$</span><input type="number" min={0} step="0.01" value={f.pricePerServing ?? ""} placeholder="unknown" onChange={(e) => setF({ ...f, pricePerServing: e.target.value === "" ? null : Number(e.target.value) })} className="w-24 border-b border-white/10 bg-transparent text-white placeholder:text-white/25 focus:outline-none" /><span className="font-sans text-[12px] text-white/30">per serving · used for grocery estimates only when set</span></div>
        </div>
        <div className="mt-7 flex items-center gap-3"><Button variant="primary" size="sm" onClick={() => void save()} disabled={!f.name.trim()}>{food ? "Save" : "Create"}</Button><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><button onClick={onClose} className="ml-auto text-white/30 hover:text-white" aria-label="Close"><X size={14} /></button></div>
      </div>
    </div>
  );
}
