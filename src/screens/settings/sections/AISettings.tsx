import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

export function AISettingsSection() {
  const { ai, setAI } = useSettingsStore();
  return (
    <SettingsSection title="AI" description="The assistant can only trigger registered application actions. It never receives shell access or executes arbitrary commands — for the local engine today and any future model provider.">
      <SettingRow label="Provider" description="Engine used to interpret commands. Cloud providers are not yet available.">
        <Select
          value={ai.provider}
          onChange={(v) => setAI({ provider: v })}
          options={[{ value: "local" as const, label: "Local engine" }, { value: "openai" as const, label: "OpenAI · soon" }, { value: "anthropic" as const, label: "Anthropic · soon" }].filter((o) => o.value === "local" || o.value === ai.provider)}
        />
      </SettingRow>
      <SettingRow label="Local command mode" description="Use the deterministic on-device command parser.">
        <Toggle checked={ai.localCommandMode} onChange={(v) => setAI({ localCommandMode: v })} />
      </SettingRow>
    </SettingsSection>
  );
}
