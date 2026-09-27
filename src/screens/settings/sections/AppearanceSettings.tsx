import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle, Slider } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

export function AppearanceSettings() {
  const { appearance, setAppearance } = useSettingsStore();
  return (
    <SettingsSection title="Appearance" description="Tune the visual system and motion.">
      <SettingRow label="Background intensity" description="Density and brightness of the ambient background.">
        <div className="w-48">
          <Slider value={appearance.backgroundIntensity} onChange={(v) => setAppearance({ backgroundIntensity: v })} valueLabel={`${appearance.backgroundIntensity}%`} />
        </div>
      </SettingRow>
      <SettingRow label="Glass intensity" description="Strength of the translucent glass surfaces.">
        <div className="w-48">
          <Slider value={appearance.glassIntensity} onChange={(v) => setAppearance({ glassIntensity: v })} valueLabel={`${appearance.glassIntensity}%`} />
        </div>
      </SettingRow>
      <SettingRow label="Animations" description="Enable interface transitions and effects.">
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
