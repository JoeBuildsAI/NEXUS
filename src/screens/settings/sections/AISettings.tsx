import { ShieldCheck } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";

export function AISettingsSection() {
  const { ai, setAI } = useSettingsStore();
  return (
    <SettingsSection title="AI" description="Command interpretation and assistant configuration.">
      <div className="flex items-start gap-3 border-b border-white/[0.04] px-5 py-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-status-nominal" />
        <p className="text-xs leading-relaxed text-white/50">
          The assistant can only trigger registered application actions. It never
          receives shell access or executes arbitrary commands — this holds for the
          local engine today and any future LLM provider.
        </p>
      </div>

      <SettingRow label="Provider" description="Engine used to interpret commands.">
        <select
          value={ai.provider}
          onChange={(e) => setAI({ provider: e.target.value as "local" | "openai" | "anthropic" })}
          className="h-9 rounded-lg border border-white/[0.08] bg-void-800 px-3 text-sm text-white/85 focus:outline-none"
        >
          <option value="local">Local command engine</option>
          <option value="openai" disabled>OpenAI (coming soon)</option>
          <option value="anthropic" disabled>Anthropic (coming soon)</option>
        </select>
      </SettingRow>

      <SettingRow label="Local command mode" description="Use the deterministic on-device command parser.">
        <Toggle checked={ai.localCommandMode} onChange={(v) => setAI({ localCommandMode: v })} />
      </SettingRow>
    </SettingsSection>
  );
}
