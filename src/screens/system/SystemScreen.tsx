import { Activity, HardDrive, ListTree, Rocket } from "lucide-react";
import { ScreenShell } from "@/components/layout/ScreenShell";
import { Tabs, type TabItem } from "@/components/ui";
import { useNavigationStore, type SystemTab } from "@/state/navigationStore";
import { SystemOverview } from "./SystemOverview";
import { ProcessViewer } from "./ProcessViewer";
import { StorageAnalyzer } from "./StorageAnalyzer";
import { StartupApps } from "./StartupApps";

const TABS: TabItem<SystemTab>[] = [
  { id: "overview", label: "Overview", icon: <Activity size={14} /> },
  { id: "processes", label: "Processes", icon: <ListTree size={14} /> },
  { id: "storage", label: "Storage", icon: <HardDrive size={14} /> },
  { id: "startup", label: "Startup", icon: <Rocket size={14} /> },
];

export function SystemScreen() {
  const tab = useNavigationStore((s) => s.systemTab);
  const setTab = useNavigationStore((s) => s.setSystemTab);

  return (
    <ScreenShell
      eyebrow="Windows"
      title="System Center"
      subtitle="Telemetry, processes, storage and startup"
      wide
      actions={<Tabs tabs={TABS} value={tab} onChange={setTab} />}
    >
      {tab === "overview" && <SystemOverview />}
      {tab === "processes" && <ProcessViewer />}
      {tab === "storage" && <StorageAnalyzer />}
      {tab === "startup" && <StartupApps />}
    </ScreenShell>
  );
}
