import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { DATA_POLICY } from "@/providers/intelligence/InboxIntelligenceProvider";

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

      <div className="py-5">
        <p className="text-[15px] text-white/85">Inbox intelligence</p>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">
          Optional. Communications is fully useful without it: classification, Inbox Health, cleanup and rules are deterministic and local. An intelligence provider can only <span className="text-white/60">propose</span> — you review and approve; NEXUS executes. No provider is configured in this build, so nothing leaves the machine regardless of the mode below.
        </p>
      </div>
      <SettingRow label="What may leave this machine" description={DATA_POLICY[ai.inboxMode]}>
        <Select
          value={ai.inboxMode}
          onChange={(v) => setAI({ inboxMode: v })}
          options={[
            { value: "off" as const, label: "Off · nothing" },
            { value: "metadata" as const, label: "Metadata only" },
            { value: "selected" as const, label: "Selected messages" },
            { value: "full" as const, label: "Full · subjects and bodies" },
          ]}
        />
      </SettingRow>
      <p className="pb-5 text-[12px] text-white/30">AI-generated text is always labelled. Proposals never delete, archive, unsubscribe, move or create rules on their own. Media content is never sent to any provider.</p>
    </SettingsSection>
  );
}
