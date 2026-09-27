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
      <div className="py-4">
        <p className="text-sm text-white/85">Environment</p>
        <p className="mt-0.5 text-xs text-white/40">The ambient scene behind everything. Modes subtly shift its energy.</p>
        <div className="mt-4 grid grid-cols-5 gap-2.5">
          {(Object.keys(ENVIRONMENTS) as EnvironmentPreset[]).map((key) => {
            const env = ENVIRONMENTS[key];
            const active = appearance.environment === key;
            return (
              <button
                key={key}
                onClick={() => setAppearance({ environment: key })}
                title={env.description}
                className={cn("group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all", active ? "border-accent/50 shadow-glow-sm" : "border-white/[0.08] hover:border-white/20")}
              >
                <div className="relative h-14 overflow-hidden rounded-md" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${env.base[0]}, ${env.base[1]} 55%, ${env.base[2]})` }}>
                  {env.lights.slice(0, 2).map((c, i) => (
                    <span key={i} className="absolute h-10 w-10 rounded-full blur-md" style={{ background: c, left: `${20 + i * 40}%`, top: `${30 + i * 20}%`, opacity: 3 }} />
                  ))}
                </div>
                <p className="mt-2 text-[11px] font-medium tracking-wide2 text-white/80">{env.label}</p>
                {active && <Check size={12} className="absolute right-2 top-2 text-accent" />}
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
