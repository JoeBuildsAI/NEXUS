import { useMemo, useState } from "react";
import { FolderPlus, HardDrive, Lock, RefreshCw, Trash2, Unplug, Usb, X } from "lucide-react";
import { SettingsSection, SettingRow, Select } from "../SettingsControls";
import { Toggle, Button, Badge } from "@/components/ui";
import { useSettingsStore } from "@/state/settingsStore";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { useMediaStore } from "@/state/mediaStore";
import { getProviders } from "@/providers";
import { requestConfirm } from "@/state/confirmStore";
import { notify } from "@/state/toastStore";
import { useAsync } from "@/hooks/useAsync";
import { config } from "@/core/config";
import { formatRelativeTime } from "@/lib/utils";
import { isOffline } from "@/core/errors";

export function MediaSettingsSection() {
  const { media, setMedia } = useSettingsStore();
  const provider = useMemo(() => getProviders().media, []);
  const roots = useMediaLibraryStore((s) => s.roots);
  const scan = useMediaLibraryStore((s) => s.scan);
  const fileCount = useMediaLibraryStore((s) => s.files.length);
  const clearWorkspace = useMediaStore((s) => s.clearAll);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: health, reload: reloadHealth } = useAsync(() => provider.health?.() ?? Promise.resolve(null), [roots.length, fileCount]);

  const authorize = async () => {
    setBusy("add");
    try {
      const root = await provider.authorizeRoot();
      if (root) {
        notify.success("Folder authorized", `${root.kind === "removable" ? "Removable drive" : "Fixed drive"} · indexing now`);
        await provider.scanRoot?.(root.id);
        notify.success("Media indexed", `${useMediaLibraryStore.getState().roots.find((r) => r.id === root.id)?.fileCount ?? 0} files found`);
      }
    } catch (e) {
      notify.error("Could not authorize folder", String((e as Error).message ?? e));
    } finally {
      setBusy(null);
      reloadHealth();
    }
  };

  const rescan = async (id: string) => {
    setBusy(id);
    try {
      await provider.scanRoot?.(id);
      notify.success("Rescan complete");
    } catch (e) {
      notify.warn(isOffline(e) ? "Media source disconnected" : "Rescan failed", isOffline(e) ? "Reconnect the drive and try again." : undefined);
    } finally {
      setBusy(null);
    }
  };

  const revoke = (id: string) =>
    requestConfirm({
      title: "Remove authorization?",
      message: "NEXUS will stop indexing and accessing this location immediately. Its index, favorites and collection entries are removed. Files are untouched.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => void provider.revokeRoot(id).then(() => notify.neutral("Authorization removed")),
    });

  const clearHistory = () =>
    requestConfirm({
      title: "Clear media history?",
      message: "Removes the local index, favorites and collections. Authorized locations stay authorized. Your files are not deleted.",
      confirmLabel: "Clear history",
      danger: true,
      onConfirm: () => void provider.clearHistory().then(() => notify.neutral("Media history cleared")),
    });

  return (
    <SettingsSection title="Media" description="Private local media. NEXUS only ever reads folders you authorize here.">
      <div className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/85">Authorized media locations</p>
            <p className="mt-0.5 text-xs text-white/40">Internal or removable — but only because you selected it. Removable drives are never scanned automatically and are excluded from cleanup.</p>
          </div>
          {health && <Badge tone={health.state === "available" ? "nominal" : health.state === "not-configured" ? "neutral" : "warning"}>{health.summary}</Badge>}
        </div>

        <div className="mt-4 space-y-2">
          {roots.map((r) => {
            const disconnected = r.exists === false;
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] px-4 py-3">
                <span className="text-white/40">{disconnected ? <Unplug size={16} className="text-status-attention" /> : r.kind === "removable" ? <Usb size={16} /> : <HardDrive size={16} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-white/80" data-selectable="true">{r.path}</p>
                  <p className="mt-0.5 text-[11px] text-white/35">
                    {disconnected ? "Disconnected" : `${r.fileCount ?? 0} files`}
                    {r.kind === "removable" && " · removable"}
                    {r.lastScannedAt ? ` · indexed ${formatRelativeTime(r.lastScannedAt)}` : " · not indexed yet"}
                    {scan && scan.rootId === r.id && !scan.done && ` · scanning… ${scan.files} files / ${scan.folders} folders`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy != null || disconnected} onClick={() => void rescan(r.id)} title="Rescan">
                  <RefreshCw size={13} className={busy === r.id ? "animate-spin" : ""} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => revoke(r.id)} title="Remove authorization"><X size={14} /></Button>
              </div>
            );
          })}
          {roots.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-5 text-center text-xs text-white/35">
              <Lock size={14} className="mx-auto mb-2 text-white/25" />
              No locations authorized. {config.demoMode && "The workspace shows the demo library until you add one."}
            </div>
          )}
        </div>
        <Button size="sm" variant="primary" className="mt-3" disabled={busy != null} onClick={() => void authorize()}>
          <FolderPlus size={14} /> {busy === "add" ? "Authorizing…" : "Add folder"}
        </Button>
        {scan && !scan.done && (
          <button onClick={() => void provider.cancelScan?.()} className="ml-3 text-xs text-white/40 hover:text-white">Cancel scan</button>
        )}
      </div>

      <SettingRow label="Default grid" description="Player layout used when opening the workspace.">
        <Select
          value={`${media.defaultColumns}x${media.defaultRows}`}
          onChange={(v) => { const [c, r] = v.split("x").map(Number); setMedia({ defaultColumns: c, defaultRows: r }); }}
          options={[{ value: "2x1", label: "2 × 1" }, { value: "2x2", label: "2 × 2" }, { value: "3x2", label: "3 × 2" }, { value: "3x3", label: "3 × 3" }]}
        />
      </SettingRow>
      <SettingRow label="Pause when hidden" description="Pause all players when the workspace is hidden.">
        <Toggle checked={media.pauseOnHide} onChange={(v) => setMedia({ pauseOnHide: v })} />
      </SettingRow>
      <SettingRow label="Generate local thumbnails" description="Off by default. Thumbnails would be generated and cached locally only — never uploaded.">
        <Toggle checked={false} disabled onChange={() => undefined} />
      </SettingRow>
      <SettingRow label="Clear workspace" description="Unload every player slot now.">
        <Button size="sm" variant="outline" onClick={() => { clearWorkspace(); notify.neutral("Workspace cleared"); }}>Clear workspace</Button>
      </SettingRow>
      <SettingRow label="Clear media history" description="Remove the local index, favorites and collections.">
        <Button size="sm" variant="danger" onClick={clearHistory}><Trash2 size={14} /> Clear history</Button>
      </SettingRow>
    </SettingsSection>
  );
}
