import { useState } from "react";
import { Plus, X, Eye } from "lucide-react";
import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle, Button, Badge } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { useProcessPrefsStore } from "@/state/processPrefsStore";
import { useModeStore } from "@/state/modeStore";

/**
 * Gaming Mode config. The background-app ALLOWLIST is the set of processes the
 * user marked "Suspend in Gaming Mode" (System → Processes). Only those — and
 * only when system safety is enabled — can ever be closed (gracefully, never force-killed).
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
    <SettingsSection title="Gaming" description="Gaming Mode behavior and the background-app allowlist.">
      <SettingRow label="Gaming Mode" description="Enable the Gaming operating mode and its optimizations.">
        <Toggle checked={gaming.gamingModeEnabled} onChange={(v) => setGaming({ gamingModeEnabled: v })} />
      </SettingRow>

      <div className="py-4">
        <p className="text-sm text-white/85">Close when Gaming Mode starts</p>
        <p className="mt-0.5 text-xs text-white/40">
          Exact process names. Also manageable per-process from System → Processes. Protected classes can never be added.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {allow.map((app) => (
            <Badge key={app} tone="accent" className="gap-2 py-1 pr-1">
              <span className="font-mono">{app}</span>
              <button onClick={() => setPref(app, "normal")} className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/10" aria-label={`Remove ${app}`}><X size={11} /></button>
            </Badge>
          ))}
          {allow.length === 0 && <span className="text-xs text-white/30">No apps on the allowlist.</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addApp()} placeholder="ProcessName.exe" className="h-9 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 font-mono text-sm text-white/85 placeholder:text-white/25 focus:border-accent/40 focus:outline-none" />
          <Button size="sm" variant="outline" onClick={addApp}><Plus size={14} /> Add</Button>
        </div>
        {never.length > 0 && (
          <p className="mt-3 text-xs text-white/40">Never touch: <span className="font-mono text-white/60">{never.join(", ")}</span></p>
        )}
      </div>

      <div className="py-4">
        <p className="flex items-center gap-1.5 text-sm text-white/85"><Eye size={13} className="text-accent/70" /> Gaming Mode will</p>
        <ul className="mt-2 space-y-1.5">
          {stepsFor("gaming").map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-xs">
              <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${s.live ? "bg-accent" : "bg-white/30"}`} />
              <span className="text-white/60"><span className="text-white/80">{s.label}</span> — {s.detail}</span>
            </li>
          ))}
        </ul>
        {system.safety === "observe" && <p className="mt-2 text-[11px] text-white/35">Observe-only: steps are recorded, not applied. Change in Settings → System.</p>}
      </div>

      <SettingRow label="Default launcher" description="Preferred launcher for game actions.">
        <Select value={gaming.defaultLauncher} onChange={(v) => setGaming({ defaultLauncher: v })} options={[{ value: "steam", label: "Steam" }, { value: "epic", label: "Epic" }, { value: "gog", label: "GOG" }, { value: "xbox", label: "Xbox" }]} />
      </SettingRow>
    </SettingsSection>
  );
}
