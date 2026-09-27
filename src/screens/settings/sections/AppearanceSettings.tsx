import { Check } from "lucide-react";
import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle, Slider } from "@/components/ui";
import { useSettingsStore, type BackgroundPerformance, type EnvironmentPreset } from "@/state/settingsStore";
import { ENVIRONMENTS } from "@/components/background/environments";
import { cn } from "@/lib/utils";

export function AppearanceSettings() {
  const { appearance, setAppearance } = useSettingsStore();
  return (
    <SettingsSection title="Appearance" description="Environment, motion and glass.">
      <div className="py-5">
        <p className="text-[15px] text-white/85">Environment</p>
        <p className="mt-1 text-[13px] text-white/40">The ambient scene behind everything. Modes shift its energy; Media blacks it out.</p>
        <div className="mt-5 grid grid-cols-5 gap-3">
          {(Object.keys(ENVIRONMENTS) as EnvironmentPreset[]).map((key) => {
            const env = ENVIRONMENTS[key];
            const active = appearance.environment === key;
            return (
              <button key={key} onClick={() => setAppearance({ environment: key })} title={env.description} aria-pressed={active} className="group text-left">
                <div className={cn("relative h-16 overflow-hidden rounded-sm bg-black transition-shadow duration-300", active ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] group-hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]")} style={{ background: `radial-gradient(120% 90% at 50% 0%, ${env.base[0]}, ${env.base[1]} 55%, ${env.base[2]})` }}>
                  {env.lights.slice(0, 2).map((c, i) => (
                    <span key={i} className="absolute h-12 w-12 rounded-full blur-lg" style={{ background: c, left: `${15 + i * 45}%`, top: `${20 + i * 25}%`, opacity: 4 }} />
                  ))}
                  {active && <Check size={11} className="absolute right-1.5 top-1.5 text-white" />}
                </div>
                <p className={cn("mt-2 text-micro transition-colors", active ? "text-white" : "text-white/40 group-hover:text-white/70")}>{env.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      <SettingRow label="Background performance" description="Lower tiers cut particle counts and effects. Auto-reduced while a game runs.">
        <Select<BackgroundPerformance>
          value={appearance.backgroundPerformance}
          onChange={(v) => setAppearance({ backgroundPerformance: v })}
          options={[{ value: "full", label: "Full" }, { value: "balanced", label: "Balanced" }, { value: "minimal", label: "Minimal" }]}
        />
      </SettingRow>
      <SettingRow label="Background intensity" description="Density and brightness of the ambient scene.">
        <div className="w-48"><Slider value={appearance.backgroundIntensity} onChange={(v) => setAppearance({ backgroundIntensity: v })} valueLabel={`${appearance.backgroundIntensity}%`} /></div>
      </SettingRow>
      <SettingRow label="Glass intensity" description="Strength of translucent surfaces.">
        <div className="w-48"><Slider value={appearance.glassIntensity} onChange={(v) => setAppearance({ glassIntensity: v })} valueLabel={`${appearance.glassIntensity}%`} /></div>
      </SettingRow>
      <SettingRow label="Cursor lighting" description="A soft light follows the cursor across the environment.">
        <Toggle checked={appearance.cursorLighting} onChange={(v) => setAppearance({ cursorLighting: v })} />
      </SettingRow>
      <SettingRow label="Animations" description="Interface transitions and effects.">
        <Toggle checked={appearance.animationsEnabled} onChange={(v) => setAppearance({ animationsEnabled: v })} />
      </SettingRow>
      <SettingRow label="Telemetry animation" description="Animate live telemetry visualizations.">
        <Toggle checked={appearance.telemetryAnimation} onChange={(v) => setAppearance({ telemetryAnimation: v })} />
      </SettingRow>
      <SettingRow label="Reduced motion" description="Minimize animation for comfort and performance.">
        <Toggle checked={appearance.reducedMotion} onChange={(v) => setAppearance({ reducedMotion: v })} />
      </SettingRow>
    </SettingsSection>
  );
}
