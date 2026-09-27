import { useMemo, useState } from "react";
import { Film, Folder, LayoutGrid, Star, Clock, ShieldOff, Unplug, FolderPlus } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Tabs, type TabItem, Button, Badge } from "@/components/ui";
import { MediaLibrary } from "./MediaLibrary";
import { VideoWorkspace } from "./VideoWorkspace";
import { usePrivacyStore } from "@/state/privacyStore";
import { useDevStore } from "@/state/devStore";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { useNavigationStore } from "@/state/navigationStore";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { isOffline } from "@/core/errors";
import { notify } from "@/state/toastStore";
import type { MediaItem } from "@/core/types";

type MediaTab = "workspace" | "library" | "favorites" | "recent" | "collections";

const TABS: TabItem<MediaTab>[] = [
  { id: "workspace", label: "Workspace", icon: <LayoutGrid size={14} /> },
  { id: "library", label: "Library", icon: <Film size={14} /> },
  { id: "favorites", label: "Favorites", icon: <Star size={14} /> },
  { id: "recent", label: "Recent", icon: <Clock size={14} /> },
  { id: "collections", label: "Collections", icon: <Folder size={14} /> },
];

export function MediaScreen() {
  const [tab, setTab] = useState<MediaTab>("workspace");
  const activatePrivacy = usePrivacyStore((s) => s.activate);
  const mediaConnected = useDevStore((s) => s.mediaConnected);
  const rootsCount = useMediaLibraryStore((s) => s.roots.length);
  const fileCount = useMediaLibraryStore((s) => s.files.length);
  const favCount = useMediaLibraryStore((s) => s.favorites.length);
  const scan = useMediaLibraryStore((s) => s.scan);
  const navigate = useNavigationStore((s) => s.navigate);
  const setSection = useNavigationStore((s) => s.setSettingsSection);
  const provider = useMemo(() => getProviders().media, []);
  const { data: items, error, reload } = useAsync<readonly MediaItem[]>(() => provider.getItems(), [mediaConnected, rootsCount, fileCount, favCount]);

  const offline = error && isOffline(error);
  const mode = "mode" in provider && typeof (provider as { mode?: () => "real" | "demo" }).mode === "function" ? (provider as { mode: () => "real" | "demo" }).mode() : "demo";

  const authorize = async () => {
    const r = await provider.authorizeRoot();
    if (r) {
      notify.success("Folder authorized", "Indexing now");
      await provider.scanRoot?.(r.id).catch(() => undefined);
      reload();
    }
  };

  return (
    <ScreenShell
      eyebrow="Private"
      title="Media"
      subtitle={mode === "demo" ? "Demo library · authorize a folder to use your own files" : `${fileCount} local files · nothing here is shown on Home or in activity`}
      wide
      actions={
        <div className="flex items-center gap-2">
          {mode === "demo" && <Badge tone="accent">Demo library</Badge>}
          {scan && !scan.done && <Badge tone="neutral">Indexing… {scan.files}</Badge>}
          <Button size="sm" variant="outline" onClick={() => activatePrivacy("ui")} title="Ctrl+Shift+`">
            <ShieldOff size={14} /> Privacy
          </Button>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </div>
      }
      className="min-h-[calc(100vh-220px)]"
    >
      {offline ? (
        <div className="flex min-h-[50vh] items-center justify-center text-center">
          <div className="max-w-md">
            <Unplug size={28} className="mx-auto text-white/30" />
            <p className="mt-5 font-display text-2xl tracking-cinematic text-white/85">MEDIA SOURCE DISCONNECTED</p>
            <p className="mt-3 text-sm leading-relaxed text-white/45">The authorized media location is not reachable. Reconnect the drive, or authorize a different folder. Your workspace layout and index are preserved.</p>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="outline" onClick={reload}>Retry</Button>
              <Button variant="ghost" onClick={() => { navigate("settings"); setSection("media"); }}>Media settings</Button>
            </div>
          </div>
        </div>
      ) : tab === "workspace" ? (
        <div className="h-[calc(100vh-230px)] min-h-[520px]">
          {mode === "real" && (items?.length ?? 0) === 0 && rootsCount === 0 ? (
            <div className="flex h-full items-center justify-center text-center">
              <div className="max-w-md">
                <FolderPlus size={28} className="mx-auto text-white/30" />
                <p className="mt-5 font-display text-2xl tracking-cinematic text-white/85">NO MEDIA AUTHORIZED</p>
                <p className="mt-3 text-sm leading-relaxed text-white/45">Pick the folder (or drive) that holds your videos. NEXUS indexes only that location, locally.</p>
                <Button variant="primary" className="mt-6" onClick={() => void authorize()}><FolderPlus size={15} /> Authorize a folder</Button>
              </div>
            </div>
          ) : (
            <VideoWorkspace items={items ?? []} />
          )}
        </div>
      ) : (
        <MediaLibrary view={tab} items={items ?? []} onChanged={reload} />
      )}
    </ScreenShell>
  );
}
