import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

function Key({ children }: { children: string }) {
  return <kbd className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[11px] text-white/80">{children}</kbd>;
}

export function ShortcutsSettingsSection() {
  const { shortcuts, setShortcuts } = useSettingsStore();
  const mod = shortcuts.screenPrefix === "ctrl" ? "Ctrl" : "Alt";
  return (
    <SettingsSection title="Shortcuts" description="Keyboard-first control. Shortcuts never fire while you are typing in a field (except the palette and privacy).">
      <SettingRow label="Command palette"><Key>Ctrl + Space</Key></SettingRow>
      <SettingRow label="Privacy mode" description="Also registered system-wide on the desktop build."><Key>Ctrl + Shift + `</Key></SettingRow>
      <SettingRow label="Close overlay / back"><Key>Esc</Key></SettingRow>
      <SettingRow label="Screen shortcuts" description="Jump directly to a screen.">
        <Toggle checked={shortcuts.screenShortcutsEnabled} onChange={(v) => setShortcuts({ screenShortcutsEnabled: v })} />
      </SettingRow>
      <SettingRow label="Screen modifier" description="Modifier used with number keys.">
        <Select<"ctrl" | "alt"> value={shortcuts.screenPrefix} onChange={(v) => setShortcuts({ screenPrefix: v })} options={[{ value: "ctrl", label: "Ctrl" }, { value: "alt", label: "Alt" }]} />
      </SettingRow>
      <div className="grid grid-cols-2 gap-y-2 py-4 text-sm text-white/60 sm:grid-cols-3">
        {[["1", "Home"], ["2", "Gaming"], ["3", "Media"], ["4", "System"], ["5", "Communications"], ["6", "Settings"]].map(([k, l]) => (
          <span key={k} className="flex items-center gap-2"><Key>{`${mod} + ${k}`}</Key> {l}</span>
        ))}
      </div>
      <SettingRow label="Developer panel" description="Development builds only."><Key>Ctrl + Shift + D</Key></SettingRow>
    </SettingsSection>
  );
}
