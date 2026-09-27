import { useMemo, useState } from "react";
import { Film, Folder, LayoutGrid, Star, Clock, ShieldOff, Unplug } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Tabs, type TabItem, Button } from "@/components/ui";
import { MediaLibrary } from "./MediaLibrary";
import { VideoWorkspace } from "./VideoWorkspace";
import { usePrivacyStore } from "@/state/privacyStore";
import { useDevStore } from "@/state/devStore";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import { isOffline } from "@/core/errors";
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
  const provider = useMemo(() => getProviders().media, []);
  const { data: items, error } = useAsync<readonly MediaItem[]>(() => provider.getItems(), [mediaConnected]);

  const offline = error && isOffline(error);

  return (
    <ScreenShell
      eyebrow="Private"
      title="Media"
      subtitle="Local workspace · nothing here is shown on Home or in activity"
      wide
      actions={
        <div className="flex items-center gap-2">
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
            <p className="mt-5 font-display text-2xl tracking-cinematic text-white/85">MEDIA DRIVE DISCONNECTED</p>
            <p className="mt-3 text-sm leading-relaxed text-white/45">The authorized media root is not available. Reconnect the drive or authorize a different folder in Settings → Media. Your workspace layout is preserved.</p>
          </div>
        </div>
      ) : tab === "workspace" ? (
        <div className="h-[calc(100vh-230px)] min-h-[520px]">
          <VideoWorkspace items={items ?? []} />
        </div>
      ) : (
        <MediaLibrary view={tab} items={items ?? []} />
      )}
    </ScreenShell>
  );
}
