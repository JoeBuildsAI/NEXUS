import { useState } from "react";
import { X } from "lucide-react";
import { SettingsSection, SettingRow, Select, TextInput } from "../SettingsControls";
import { Toggle, Button } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { useModeStore } from "@/state/modeStore";

/**
 * Gaming Mode config. The background-app allowlist is the set of processes the
 * user marked "Close when Gaming Mode starts" (System → Processes). Only those —
 * and only when system safety is enabled — can ever be closed (gracefully, never force-killed).
 */
export function GamingSettingsSection() {
  const { gaming, setGaming, system } = useSettingsStore();
  const prefs = useProcessPrefsStore((s) => s.prefs);
  const setPref = useProcessPrefsStore((s) => s.setPref);
  const stepsFor = useModeStore((s) => s.stepsFor);
  const [draft, setDraft] = useState("");

  const allow = Object.entries(prefs).filter(([, p]) => p === "close").map(([n]) => n);
  const never = Object.entries(prefs).filter(([, p]) => p === "never").map(([n]) => n);

  const addApp = () => {
    const name = draft.trim();
    if (!name) return;
    setPref(name.endsWith(".exe") ? name : `${name}.exe`, "close");
    setDraft("");
  };

  return (
    <SettingsSection title="Gaming" description="Gaming Mode behavior and the apps you allow it to close.">
      <SettingRow label="Gaming Mode" description="Enable the Gaming operating mode and its optimizations.">
        <Toggle checked={gaming.gamingModeEnabled} onChange={(v) => setGaming({ gamingModeEnabled: v })} />
      </SettingRow>

      <div className="py-5">
        <p className="text-[15px] text-white/85">Close when Gaming Mode starts</p>
        <p className="mt-1 text-[13px] text-white/40">Exact process names. Also manageable per process from System → Processes. Protected classes can never be added.</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {allow.map((app) => (
            <span key={app} className="group flex items-center gap-2 font-mono text-[13px] text-white/80">
              {app}
              <button onClick={() => setPref(app, "normal")} className="text-white/25 transition-colors hover:text-white" aria-label={`Remove ${app}`}><X size={12} /></button>
            </span>
          ))}
          {allow.length === 0 && <span className="text-[13px] text-white/30">No apps on the allowlist.</span>}
        </div>
        <div className="mt-4 flex items-end gap-4">
          <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addApp()} placeholder="ProcessName.exe" className="w-64 font-mono" />
          <Button size="sm" variant="ghost" onClick={addApp}>Add</Button>
        </div>
        {never.length > 0 && <p className="mt-4 text-[13px] text-white/40">Never touch: <span className="font-mono text-white/60">{never.join(", ")}</span></p>}
      </div>

      <div className="py-5">
        <p className="text-[15px] text-white/85">Gaming Mode will</p>
        <ul className="mt-3 space-y-2">
          {stepsFor("gaming").map((s) => (
            <li key={s.id} className="grid grid-cols-[1fr_auto] items-baseline gap-6 text-[13px]">
              <span className="text-white/55"><span className="text-white/85">{s.label}</span> — {s.detail}</span>
              <span className={`font-mono text-[10.5px] tracking-wide2 ${s.live ? "text-white/70" : "text-white/30"}`}>{s.live ? "APPLY" : "RECORD"}</span>
            </li>
          ))}
        </ul>
        {system.safety === "observe" && <p className="mt-3 text-[12px] text-white/35">Observe-only: steps are recorded, not applied. Change in Settings → System.</p>}
      </div>

      <SettingRow label="Default launcher" description="Preferred launcher for game actions.">
        <Select value={gaming.defaultLauncher} onChange={(v) => setGaming({ defaultLauncher: v })} options={[{ value: "steam", label: "Steam" }, { value: "epic", label: "Epic" }, { value: "gog", label: "GOG" }, { value: "xbox", label: "Xbox" }]} />
      </SettingRow>
    </SettingsSection>
  );
}
