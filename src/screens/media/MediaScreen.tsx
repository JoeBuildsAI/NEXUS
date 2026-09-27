import { useMemo, useState } from "react";
import { FolderPlus, ShieldOff } from "lucide-react";
import { Tabs, type TabItem, Button } from "@/components/ui";
import { MediaLibrary } from "./MediaLibrary";
import { VideoWorkspace } from "./VideoWorkspace";
import { EmptyState } from "@/components/ui/EmptyState";
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
  { id: "workspace", label: "Workspace" },
  { id: "library", label: "Library" },
  { id: "favorites", label: "Favorites" },
  { id: "recent", label: "Recent" },
  { id: "collections", label: "Collections" },
];

/** Media — blackout. The environment recedes; content is the light. */
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
  const withMode = provider as { mode?: () => "real" | "demo" };
  const mode = typeof withMode.mode === "function" ? withMode.mode() : "demo";

  const authorize = async () => {
    const r = await provider.authorizeRoot();
    if (r) { notify.success("Folder authorized", "Indexing"); await provider.scanRoot?.(r.id).catch(() => undefined); reload(); }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1880px] items-end justify-between px-12 pb-6 pt-8 2xl:px-16">
        <div className="flex items-end gap-8">
          <h1 className="font-display text-display-md font-semibold uppercase tracking-wide2 text-white">Media</h1>
          <Tabs tabs={TABS} value={tab} onChange={setTab} className="pb-1" />
        </div>
        <div className="flex items-center gap-5 text-micro text-white/30">
          {mode === "demo" && <span>demo library</span>}
          {scan && !scan.done && <span className="text-white/60">indexing · {scan.files}</span>}
          {mode === "real" && fileCount > 0 && <span>{fileCount} files · private</span>}
          <button onClick={() => activatePrivacy("ui")} title="Ctrl+Shift+`" className="flex items-center gap-1.5 text-white/50 transition-colors hover:text-white"><ShieldOff size={12} /> privacy</button>
        </div>
      </div>

      <div className="mx-auto min-h-0 w-full max-w-[1880px] flex-1 overflow-y-auto px-12 pb-12 2xl:px-16">
        {offline ? (
          <EmptyState eyebrow="Media" title="Source disconnected" body="The authorized location is not reachable. Reconnect the drive or authorize a different folder. Your index and workspace are preserved." action={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={reload}>Retry</Button><Button variant="ghost" size="sm" onClick={() => { navigate("settings"); setSection("media"); }}>Media settings</Button></div>} />
        ) : tab === "workspace" ? (
          <div className="h-full min-h-[520px]">
            {mode === "real" && (items?.length ?? 0) === 0 && rootsCount === 0 ? (
              <EmptyState eyebrow="Media" title="No media location" body="Choose a private folder to enable your local library. NEXUS indexes only that location, on this machine." action={<Button variant="primary" onClick={() => void authorize()}><FolderPlus size={15} /> Add folder</Button>} />
            ) : (
              <VideoWorkspace items={items ?? []} />
            )}
          </div>
        ) : (
          <MediaLibrary view={tab} items={items ?? []} onChanged={reload} />
        )}
      </div>
    </div>
  );
}
