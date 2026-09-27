import { useState } from "react";
import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Button, Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { useLifeStore } from "@/state/lifeStore";
import { useNavigationStore } from "@/state/navigationStore";
import { formatMinute, parseTimeInput } from "@/core/life/time";
import { requestNotificationPermission, notificationPermission } from "@/hooks/useReminders";

export function LifeSettingsSection() {
  const { life, setLife } = useSettingsStore();
  const targets = useLifeStore((s) => s.targets);
  const openLife = useNavigationStore((s) => s.openLife);
  const [perm, setPerm] = useState(notificationPermission());
  const TimeField = ({ value, onChange }: { value: number; onChange: (m: number) => void }) => (
    <input defaultValue={formatMinute(value, false)} onBlur={(e) => { const m = parseTimeInput(e.target.value); if (m != null) onChange(m); }} className="w-16 border-b border-white/15 bg-transparent text-right font-mono text-[13.5px] text-white focus:border-white/50 focus:outline-none" />
  );
  return (
    <SettingsSection title="Life" description="Routines, fitness, nutrition, meals, groceries, calendar and tasks work entirely on this machine. These settings shape how they show up during the day.">
      <SettingRow label="Reminders" description="Quiet, in-app reminders for what is coming up. Off by default. System notifications are used only when Windows has granted permission.">
        <Toggle checked={life.reminders} onChange={(v) => { setLife({ reminders: v }); if (v) void requestNotificationPermission().then(setPerm); }} />
      </SettingRow>
      {life.reminders && (
        <>
          <SettingRow label="Remind me about" description={`System notifications: ${perm === "granted" ? "allowed" : perm === "denied" ? "blocked by Windows — in-app only" : "not requested"}.`}>
            <div className="flex flex-wrap gap-4 text-[12.5px]">
              {([["remindEvents", "Events"], ["remindWorkouts", "Workouts"], ["remindRoutines", "Routines"], ["remindMeals", "Meals"], ["remindTasks", "Tasks"]] as const).map(([k, l]) => <button key={k} onClick={() => setLife({ [k]: !life[k] })} className={life[k] ? "text-white" : "text-white/35 hover:text-white/70"}>{l}</button>)}
            </div>
          </SettingRow>
          <SettingRow label="Lead time" description="How early to remind before a timed item.">
            <Select value={String(life.leadMinutes)} onChange={(v) => setLife({ leadMinutes: Number(v) })} options={[{ value: "0", label: "At the time" }, { value: "5", label: "5 minutes" }, { value: "10", label: "10 minutes" }, { value: "15", label: "15 minutes" }, { value: "30", label: "30 minutes" }]} />
          </SettingRow>
          <SettingRow label="Quiet hours" description="No reminders between these times.">
            <div className="flex items-center gap-2"><TimeField value={life.quietStart} onChange={(m) => setLife({ quietStart: m })} /><span className="text-white/30">→</span><TimeField value={life.quietEnd} onChange={(m) => setLife({ quietEnd: m })} /></div>
          </SettingRow>
        </>
      )}
      <SettingRow label="Default workout time" description="When a program schedules a workout without a calendar event, Today places it here.">
        <TimeField value={life.workoutMinute} onChange={(m) => setLife({ workoutMinute: m })} />
      </SettingRow>
      <SettingRow label="Nutrition targets" description={targets.calories ? `${targets.calories} kcal · ${targets.protein ?? "—"} g protein · ${targets.carbs ?? "—"} g carbs · ${targets.fat ?? "—"} g fat` : "No targets set. They are your own planning numbers, not recommendations."}>
        <Button size="sm" variant="outline" onClick={() => openLife("nutrition")}>Edit in Nutrition</Button>
      </SettingRow>
    </SettingsSection>
  );
}
