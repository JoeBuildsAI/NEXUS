import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Star, X } from "lucide-react";
import { useLifeStore } from "@/state/lifeStore";
import { useNavigationStore } from "@/state/navigationStore";
import type { Meal, MealPlanEntry, MealSlot, Unit } from "@/core/life/models";
import { FACT_LABEL, FACT_UNIT, mealFacts, servingsOf, type FactKey } from "@/core/life/nutrition";
import { addDays, daysBetween, formatDayShort, startOfWeek, todayKey, type DayKey } from "@/core/life/time";
import { requestConfirm } from "@/state/confirmStore";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
const UNITS: Unit[] = ["g", "kg", "oz", "lb", "ml", "l", "cup", "tbsp", "tsp", "piece", "serving", "slice", "scoop"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STATUS_LABEL: Record<MealPlanEntry["status"], string> = { planned: "", eaten: "eaten", partial: "partial", skipped: "skipped", replaced: "replaced" };

/** Meals: weekly planner with logging, meal library with derived nutrition, meal editor. */
export function MealsSection() {
  const life = useLifeStore();
  const focus = useNavigationStore((s) => s.lifeFocus);
  const today = todayKey();
  const [week, setWeek] = useState(startOfWeek(today));
  const days = daysBetween(week, addDays(week, 6));
  const [selectedMeal, setSelectedMeal] = useState<string | null>(null);
  const [editor, setEditor] = useState<Meal | "new" | null>(null);
  const [picker, setPicker] = useState<{ day: DayKey; slot: MealSlot; replaceEntry?: string } | null>(null);
  useEffect(() => { if (focus?.section === "meals" && focus.id) { const e = life.mealPlan.find((x) => x.id === focus.id); if (e) setSelectedMeal(e.mealId); else if (life.meals.some((x) => x.id === focus.id)) setSelectedMeal(focus.id); } }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const meal = life.meals.find((m) => m.id === selectedMeal) ?? null;
  const facts = useMemo(() => (meal ? mealFacts(meal, life.foods) : null), [meal, life.foods]);

  return (
    <div className="grid gap-x-16 gap-y-12 xl:grid-cols-[1.5fr_1fr]">
      <div>
        <div className="flex items-baseline gap-4">
          <p className="label">Week of {formatDayShort(week)}</p>
          <span className="flex items-center gap-1 text-white/40"><button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week" className="hover:text-white"><ChevronLeft size={14} /></button><button onClick={() => setWeek(startOfWeek(today))} className="px-1 text-[12px] hover:text-white">This week</button><button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week" className="hover:text-white"><ChevronRight size={14} /></button></span>
        </div>
        <div className="rule mt-3" />
        <div className="grid grid-cols-[72px_repeat(7,1fr)] gap-x-2 pt-3">
          <span />
          {days.map((d) => <p key={d} className={cn("pb-2 font-mono text-[11.5px] tabular", d === today ? "text-white" : "text-white/40")}>{formatDayShort(d)}</p>)}
          {SLOTS.map((slot) => (
            <SlotRow key={slot} slot={slot} days={days} today={today} onPick={(day, replaceEntry) => setPicker({ day, slot, replaceEntry })} onOpen={setSelectedMeal} />
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-white/30">Click an empty slot to plan · click a meal to inspect · log with the small actions · the grocery list derives from this plan.</p>
      </div>

      <div>
        {meal && facts ? (
          <div>
            <div className="flex items-baseline justify-between">
              <p className="label">{meal.name}</p>
              <span className="flex gap-4 text-[12px] text-white/35">
                <button onClick={() => void life.patch("meals", meal.id, { favorite: !meal.favorite })} className="hover:text-white">{meal.favorite ? "Unfavorite" : "Favorite"}</button>
                <button onClick={() => setEditor(meal)} className="hover:text-white">Edit</button>
                <button onClick={() => requestConfirm({ title: `Delete ${meal.name}?`, message: "Planned entries that use it will show as “Meal”.", confirmLabel: "Delete", danger: true, onConfirm: () => { void life.remove("meals", [meal.id]); setSelectedMeal(null); } })} className="hover:text-status-critical">Delete</button>
                <button onClick={() => setSelectedMeal(null)} className="hover:text-white"><X size={12} /></button>
              </span>
            </div>
            <div className="rule mt-3 mb-3" />
            <p className="text-[12.5px] text-white/40">{cap(meal.slot)} · {meal.servings} serving{meal.servings === 1 ? "" : "s"}</p>
            <ul className="mt-3 divide-y divide-white/[0.05]">
              {meal.ingredients.map((i) => { const f = life.foods.find((x) => x.id === i.foodId); const s = f ? servingsOf(f, i.amount, i.unit) : null; return <li key={i.id} className="flex items-baseline gap-3 py-1.5 text-[14px]"><span className="text-white/85">{f?.name ?? "Unknown food"}</span><span className="ml-auto font-mono text-[12.5px] tabular text-white/45">{i.amount} {i.unit}{s == null ? " · unit mismatch" : ""}</span></li>; })}
            </ul>
            <p className="label mt-6">Per serving</p>
            <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1.5 text-[13.5px]">
              {(["calories", "protein", "carbs", "fat", "fiber"] as FactKey[]).map((k) => <div key={k} className="flex items-baseline justify-between"><span className="text-white/55">{FACT_LABEL[k]}</span><span className="font-mono tabular text-white">{facts[k].provenance === "estimated" ? "~" : ""}{Math.round(facts[k].value)} {FACT_UNIT[k]}{facts[k].complete ? "" : "†"}</span></div>)}
            </div>
            {!facts.calories.complete && <p className="mt-2 text-[11.5px] text-white/30">† {facts.calories.unknown} ingredient{facts.calories.unknown === 1 ? "" : "s"} without nutrition data — excluded, not zeroed.</p>}
            {meal.instructions && <p className="mt-5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/60">{meal.instructions}</p>}
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between"><p className="label">Meal library</p><button onClick={() => setEditor("new")} className="flex items-center gap-1.5 text-[12.5px] text-white/45 hover:text-white"><Plus size={13} /> New meal</button></div>
            <div className="rule mt-3" />
            {life.meals.length === 0 && <p className="py-4 text-[13px] text-white/35">No meals yet. A meal is a reusable template built from foods.</p>}
            <ul className="divide-y divide-white/[0.05]">
              {life.meals.slice().sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)).map((m) => { const f = mealFacts(m, life.foods); return (
                <li key={m.id} className="flex items-baseline gap-3 py-2.5 text-[14px]">
                  {m.favorite && <Star size={11} className="fill-white/60 text-white/60" />}
                  <button onClick={() => setSelectedMeal(m.id)} className="text-white/85 hover:text-white">{m.name}</button>
                  <span className="text-[11.5px] text-white/30">{cap(m.slot)}</span>
                  <span className="ml-auto font-mono text-[12px] tabular text-white/45">{f.calories.provenance === "estimated" ? "~" : ""}{Math.round(f.calories.value)} kcal · {Math.round(f.protein.value)} P{f.calories.complete ? "" : " †"}</span>
                </li>
              ); })}
            </ul>
          </div>
        )}
      </div>

      {picker && <MealPicker day={picker.day} slot={picker.slot} replaceEntry={picker.replaceEntry} onClose={() => setPicker(null)} />}
      {editor && <MealEditor meal={editor === "new" ? null : editor} onClose={() => setEditor(null)} onSaved={setSelectedMeal} />}
    </div>
  );
}

function SlotRow({ slot, days, today, onPick, onOpen }: { slot: MealSlot; days: DayKey[]; today: DayKey; onPick: (day: DayKey, replaceEntry?: string) => void; onOpen: (mealId: string) => void }) {
  const life = useLifeStore();
  return (
    <>
      <span className="pt-2 text-micro text-white/35">{cap(slot)}</span>
      {days.map((d) => {
        const entries = life.mealPlan.filter((e) => e.day === d && e.slot === slot);
        return (
          <div key={d} className={cn("min-h-[64px] border-t border-white/[0.06] py-1.5", d === today && "bg-white/[0.02]")}>
            {entries.map((e) => {
              const m = life.meals.find((x) => x.id === e.mealId);
              const rep = e.status === "replaced" ? life.meals.find((x) => x.id === e.replacedWithMealId) : null;
              return (
                <div key={e.id} className={cn("group", e.status !== "planned" && "opacity-60")}>
                  <button onClick={() => onOpen(rep?.id ?? e.mealId)} className="block w-full truncate text-left text-[12.5px] text-white/85 hover:text-white">{rep ? `${rep.name} ↺` : m?.name ?? "Meal"}</button>
                  <div className="flex flex-wrap gap-x-2 text-[10.5px] text-white/30">
                    {e.status !== "planned" && <span className="text-white/45">{STATUS_LABEL[e.status]}</span>}
                    {d <= today && e.status === "planned" && <><button onClick={() => void life.logMeal(e.id, "eaten")} className="hover:text-white">eaten</button><button onClick={() => void life.logMeal(e.id, "partial")} className="hover:text-white">half</button><button onClick={() => void life.logMeal(e.id, "skipped")} className="hover:text-white">skip</button><button onClick={() => onPick(d, e.id)} className="hover:text-white">swap</button></>}
                    {e.status !== "planned" && <button onClick={() => void life.logMeal(e.id, "planned")} className="opacity-0 group-hover:opacity-100 hover:text-white">undo</button>}
                    <button onClick={() => void life.remove("mealPlan", [e.id])} className="opacity-0 group-hover:opacity-100 hover:text-white">remove</button>
                  </div>
                </div>
              );
            })}
            {entries.length === 0 && <button onClick={() => onPick(d)} className="h-full w-full text-left text-[12px] text-white/0 transition-colors hover:text-white/40">+ plan</button>}
          </div>
        );
      })}
    </>
  );
}

function MealPicker({ day, slot, replaceEntry, onClose }: { day: DayKey; slot: MealSlot; replaceEntry?: string; onClose: () => void }) {
  const life = useLifeStore();
  const [q, setQ] = useState("");
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; document.addEventListener("keydown", onKey, true); return () => document.removeEventListener("keydown", onKey, true); }, [onClose]);
  const meals = life.meals.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(a.slot === slot) < Number(b.slot === slot) ? 1 : -1);
  const foods = q ? life.foods.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];
  const choose = async (mealId?: string, foodId?: string) => {
    if (replaceEntry) await life.logMeal(replaceEntry, "replaced", { mealId, foodId });
    else if (mealId) await life.planMeal(day, slot, mealId);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-strong w-[520px] max-w-[94vw] rounded-md p-7">
        <p className="text-micro text-white/35">{replaceEntry ? "Replace with" : `Plan ${slot} · ${formatDayShort(day)}`}</p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search meals" className="mt-3 h-10 w-full border-b border-white/15 bg-transparent text-[16px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
        <ul className="mt-3 max-h-[50vh] divide-y divide-white/[0.05] overflow-y-auto">
          {meals.map((m) => <li key={m.id}><button onClick={() => void choose(m.id)} className="flex w-full items-baseline gap-3 py-2 text-left text-[14.5px] text-white/85 hover:text-white"><span>{m.name}</span><span className="text-[11.5px] text-white/30">{cap(m.slot)}</span><span className="ml-auto font-mono text-[12px] tabular text-white/40">{Math.round(mealFacts(m, life.foods).calories.value)} kcal</span></button></li>)}
          {replaceEntry && foods.map((f) => <li key={f.id}><button onClick={() => void choose(undefined, f.id)} className="flex w-full items-baseline gap-3 py-2 text-left text-[14.5px] text-white/70 hover:text-white"><span>{f.name}</span><span className="text-[11.5px] text-white/30">single food · 1 serving</span></button></li>)}
          {meals.length === 0 && <li className="py-3 text-[13px] text-white/35">No matching meals.</li>}
        </ul>
      </div>
    </div>
  );
}

function MealEditor({ meal, onClose, onSaved }: { meal: Meal | null; onClose: () => void; onSaved: (id: string) => void }) {
  const life = useLifeStore();
  const [m, setM] = useState<Meal>(meal ?? { id: "", createdAt: 0, updatedAt: 0, rev: 0, name: "", slot: "dinner", ingredients: [], servings: 1, favorite: false });
  const [pick, setPick] = useState("");
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; document.addEventListener("keydown", onKey, true); return () => document.removeEventListener("keydown", onKey, true); }, [onClose]);
  const matches = pick.trim() ? life.foods.filter((f) => f.name.toLowerCase().includes(pick.toLowerCase())).slice(0, 6) : [];
  const facts = mealFacts(m, life.foods);
  const save = async () => {
    if (!m.name.trim()) return;
    const now = Date.now();
    const row = m.id ? { ...m, name: m.name.trim(), updatedAt: now, rev: m.rev + 1 } : { ...m, id: `ml-${now.toString(36)}`, name: m.name.trim(), createdAt: now, updatedAt: now, rev: 1 };
    await life.upsert("meals", [row]);
    onSaved(row.id);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-strong max-h-[90vh] w-[640px] max-w-[94vw] overflow-y-auto rounded-md p-7">
        <p className="text-micro text-white/35">{meal ? "Edit meal" : "New meal"}</p>
        <input autoFocus value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Meal name" className="mt-3 w-full border-b border-white/15 bg-transparent pb-2 font-display text-[24px] font-semibold tracking-wide text-white placeholder:text-white/20 focus:border-white/50 focus:outline-none" />
        <div className="mt-6 grid grid-cols-[92px_1fr] gap-x-6 gap-y-4 text-[14px]">
          <span className="text-white/35">Slot</span>
          <div className="flex gap-4 text-[12.5px]">{[...SLOTS, "custom" as MealSlot].map((s) => <button key={s} onClick={() => setM({ ...m, slot: s })} className={cn(m.slot === s ? "text-white" : "text-white/40 hover:text-white/80")}>{cap(s)}</button>)}</div>
          <span className="text-white/35">Servings</span>
          <input type="number" min={1} value={m.servings} onChange={(e) => setM({ ...m, servings: Math.max(1, Number(e.target.value) || 1) })} className="w-16 border-b border-white/15 bg-transparent font-mono text-[13.5px] text-white focus:outline-none" />
          <span className="text-white/35">Ingredients</span>
          <div>
            {m.ingredients.map((i, k) => { const f = life.foods.find((x) => x.id === i.foodId); const ok = f ? servingsOf(f, i.amount, i.unit) != null : false; return (
              <div key={i.id} className="flex items-center gap-3 py-1 text-[13.5px]">
                <span className="min-w-0 flex-1 truncate text-white/85">{f?.name ?? "Unknown"}</span>
                <input type="number" min={0} step="any" value={i.amount} onChange={(e) => setM({ ...m, ingredients: m.ingredients.map((x, j) => (j === k ? { ...x, amount: Number(e.target.value) } : x)) })} className="w-16 border-b border-white/10 bg-transparent text-right font-mono text-[13px] text-white focus:outline-none" />
                <select value={i.unit} onChange={(e) => setM({ ...m, ingredients: m.ingredients.map((x, j) => (j === k ? { ...x, unit: e.target.value as Unit } : x)) })} className={cn("bg-transparent text-[12.5px] [color-scheme:dark] focus:outline-none", ok ? "text-white/70" : "text-status-attention/80")}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                {!ok && <span className="text-micro text-status-attention/70" title={`Serving is in ${f?.servingUnit}`}>unit mismatch</span>}
                <button onClick={() => setM({ ...m, ingredients: m.ingredients.filter((_, j) => j !== k) })} className="text-white/25 hover:text-white" aria-label="Remove"><X size={12} /></button>
              </div>
            ); })}
            <div className="relative mt-2">
              <input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Add ingredient…" className="h-8 w-full border-b border-white/10 bg-transparent text-[13.5px] text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none" />
              {matches.length > 0 && <ul className="absolute z-10 mt-1 w-full bg-[#0b0b0b] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">{matches.map((f) => <li key={f.id}><button onClick={() => { setM({ ...m, ingredients: [...m.ingredients, { id: `ing-${Date.now().toString(36)}-${m.ingredients.length}`, foodId: f.id, amount: f.servingAmount, unit: f.servingUnit }] }); setPick(""); }} className="block w-full px-3 py-1.5 text-left text-[13.5px] text-white/80 hover:bg-white/[0.06] hover:text-white">{f.name} <span className="text-white/30">· {f.servingAmount} {f.servingUnit}</span></button></li>)}</ul>}
            </div>
          </div>
          <span className="text-white/35">Notes</span>
          <textarea value={m.instructions ?? ""} onChange={(e) => setM({ ...m, instructions: e.target.value })} rows={2} placeholder="Instructions, optional" className="resize-none border-b border-white/10 bg-transparent text-white/85 placeholder:text-white/20 focus:outline-none" />
        </div>
        <p className="mt-5 font-mono text-[12px] tabular text-white/45">Per serving · {Math.round(facts.calories.value)} kcal · {Math.round(facts.protein.value)} P · {Math.round(facts.carbs.value)} C · {Math.round(facts.fat.value)} F{facts.calories.complete ? "" : " · † partly unknown"}</p>
        <div className="mt-6 flex items-center gap-3"><Button variant="primary" size="sm" onClick={() => void save()} disabled={!m.name.trim()}>{meal ? "Save" : "Create"}</Button><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}
