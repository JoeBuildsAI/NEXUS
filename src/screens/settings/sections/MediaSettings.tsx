import { FolderPlus, Trash2, X } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Toggle, Button } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { getProviders } from "@/providers";
import { requestConfirm } from "@/state/confirmStore";

export function MediaSettingsSection() {
  const { media, setMedia } = useSettingsStore();

  const authorize = async () => {
    const root = await getProviders().media.authorizeRoot();
    if (root) {
      setMedia({ authorizedFolders: [...media.authorizedFolders, root.path] });
    }
  };

  const clearHistory = () =>
    requestConfirm({
      title: "Clear media history?",
      message:
        "This removes all locally stored media history and index entries. Your files are not deleted.",
      confirmLabel: "Clear history",
      danger: true,
      onConfirm: () => void getProviders().media.clearHistory(),
    });

  return (
    <SettingsSection title="Media" description="Authorized folders, playback, and privacy of your library.">
      <div className="py-4">
        <p className="text-sm text-white/85">Authorized folders</p>
        <p className="mt-0.5 text-xs text-white/40">
          NEXUS only reads media from folders you explicitly authorize. Removable
          drives are never scanned automatically.
        </p>
        <div className="mt-3 space-y-2">
          {media.authorizedFolders.map((f) => (
            <div key={f} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
              <span className="truncate font-mono text-xs text-white/70">{f}</span>
              <button
                onClick={() =>
                  setMedia({ authorizedFolders: media.authorizedFolders.filter((x) => x !== f) })
                }
                className="text-white/40 hover:text-white"
                aria-label="Revoke"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {media.authorizedFolders.length === 0 && (
            <p className="text-xs text-white/30">No folders authorized.</p>
          )}
        </div>
        <Button size="sm" variant="outline" className="mt-3" onClick={authorize}>
          <FolderPlus size={14} /> Authorize folder
        </Button>
      </div>

      <SettingRow label="Default grid" description="Player layout used when opening the workspace.">
        <select
          value={`${media.defaultColumns}x${media.defaultRows}`}
          onChange={(e) => {
            const [c, r] = e.target.value.split("x").map(Number);
            setMedia({ defaultColumns: c, defaultRows: r });
          }}
          className="h-9 rounded-lg border border-white/[0.08] bg-void-800 px-3 text-sm text-white/85 focus:outline-none"
        >
          <option value="2x1">2 × 1</option>
          <option value="2x2">2 × 2</option>
          <option value="3x2">3 × 2</option>
          <option value="3x3">3 × 3</option>
        </select>
      </SettingRow>

      <SettingRow label="Pause when hidden" description="Pause all players when the workspace is hidden.">
        <Toggle checked={media.pauseOnHide} onChange={(v) => setMedia({ pauseOnHide: v })} />
      </SettingRow>

      <SettingRow label="Media history" description="Clear locally stored media history and index.">
        <Button size="sm" variant="danger" onClick={clearHistory}>
          <Trash2 size={14} /> Clear history
        </Button>
      </SettingRow>
    </SettingsSection>
  );
}
