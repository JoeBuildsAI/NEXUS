import { useState } from "react";
import { Film, Folder, LayoutGrid, Star, Clock, ShieldOff } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Tabs, type TabItem, Button } from "@/components/ui";
import { MediaLibrary } from "./MediaLibrary";
import { VideoWorkspace } from "./VideoWorkspace";
import { usePrivacyStore } from "@/state/privacyStore";

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

  return (
    <ScreenShell
      title="Media"
      subtitle="Private local workspace · content never shown on Home"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={activatePrivacy}>
            <ShieldOff size={14} /> Privacy
          </Button>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </div>
      }
    >
      {tab === "workspace" ? (
        <VideoWorkspace />
      ) : (
        <MediaLibrary view={tab} />
      )}
    </ScreenShell>
  );
}
