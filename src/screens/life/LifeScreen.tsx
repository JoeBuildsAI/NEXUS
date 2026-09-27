import { useEffect } from "react";
import { useNavigationStore, type LifeSection } from "@/state/navigationStore";
import { useLifeStore } from "@/state/lifeStore";
import { Button } from "@/components/ui";
import { LifeOverview } from "./LifeOverview";
import { RoutinesSection } from "./RoutinesSection";
import { FitnessSection } from "./FitnessSection";
import { NutritionSection } from "./NutritionSection";
import { MealsSection } from "./MealsSection";
import { GroceriesSection } from "./GroceriesSection";
import { TasksSection } from "./TasksSection";
import { cn } from "@/lib/utils";

const SECTIONS: { id: LifeSection; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "routines", label: "Routines" }, { id: "fitness", label: "Fitness" }, { id: "nutrition", label: "Nutrition" }, { id: "meals", label: "Meals" }, { id: "groceries", label: "Groceries" }, { id: "tasks", label: "Tasks" },
];

/** LIFE — routines, fitness, nutrition, meals, groceries, tasks. Local-first; nothing here needs an account. */
export function LifeScreen() {
  const section = useNavigationStore((s) => s.lifeSection);
  const setSection = useNavigationStore((s) => s.setLifeSection);
  const life = useLifeStore();
  useEffect(() => { void life.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const total = life.counts ? Object.values(life.counts).reduce((a, b) => a + b, 0) : 0;
  const empty = life.status === "ready" && total === 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1880px] flex-col px-12 pt-6 2xl:px-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-micro tracking-cinematic text-white/35">Life{life.hasDemo && <span className="ml-3 normal-case tracking-normal text-white/25">sample data</span>}</p>
          <h1 className="mt-3 font-display text-display-lg font-semibold uppercase tracking-wide text-white">{SECTIONS.find((s) => s.id === section)?.label}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-6 pb-2 text-[13px]">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)} className={cn("relative pb-1 transition-colors", section === s.id ? "text-white" : "text-white/40 hover:text-white/75")}>
              {s.label}
              {section === s.id && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
            </button>
          ))}
        </div>
      </div>
      <div className="rule mt-3" />

      <div className="min-h-0 flex-1 overflow-y-auto pb-12 pt-8">
        {life.status === "error" && <p className="text-[13.5px] text-status-attention/80">Personal data could not be opened: {life.error}. <button onClick={() => void life.reload()} className="text-white/70 hover:text-white">Try again</button></p>}
        {empty && section === "overview" ? (
          <div className="max-w-xl py-10">
            <p className="font-display text-display-md font-semibold uppercase tracking-wide text-white/85">Your life, locally</p>
            <p className="mt-4 text-[15px] leading-relaxed text-white/45">Routines, workouts, meals, groceries, calendar and tasks — all stored on this machine, no account required. Start from scratch or load clearly-labelled sample data to see how everything connects.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => void life.addSampleData()}>Load sample data</Button>
              <Button variant="ghost" onClick={() => setSection("routines")}>Create a routine</Button>
              <Button variant="ghost" onClick={() => setSection("fitness")}>Build a workout</Button>
            </div>
            <p className="mt-6 text-[12px] text-white/30">Sample rows are flagged and can be removed in one step from Settings → Data. They never mix into your real history silently.</p>
          </div>
        ) : (
          <>
            {section === "overview" && <LifeOverview />}
            {section === "routines" && <RoutinesSection />}
            {section === "fitness" && <FitnessSection />}
            {section === "nutrition" && <NutritionSection />}
            {section === "meals" && <MealsSection />}
            {section === "groceries" && <GroceriesSection />}
            {section === "tasks" && <TasksSection />}
          </>
        )}
      </div>
    </div>
  );
}
