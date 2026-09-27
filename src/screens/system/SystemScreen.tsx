import { Tabs, type TabItem } from "@/components/ui";
import { useNavigationStore, type SystemTab } from "@/state/navigationStore";
import { SystemOverview } from "./SystemOverview";
import { ProcessViewer } from "./ProcessViewer";
import { StorageAnalyzer } from "./StorageAnalyzer";
import { StartupApps } from "./StartupApps";
import { HardwareInventory } from "./HardwareInventory";

const TABS: TabItem<SystemTab>[] = [
  { id: "overview", label: "Overview" },
  { id: "hardware", label: "Hardware" },
  { id: "processes", label: "Processes" },
  { id: "storage", label: "Storage" },
  { id: "startup", label: "Startup" },
];

/** System — a hardware control surface. */
export function SystemScreen() {
  const tab = useNavigationStore((s) => s.systemTab);
  const setTab = useNavigationStore((s) => s.setSystemTab);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1880px] items-end gap-10 px-12 pb-8 pt-8 2xl:px-16">
        <h1 className="font-display text-display-md font-semibold uppercase tracking-wide2 text-white">System</h1>
        <Tabs tabs={TABS} value={tab} onChange={setTab} className="pb-1" />
      </div>
      <div className="mx-auto min-h-0 w-full max-w-[1880px] flex-1 overflow-y-auto px-12 pb-16 pt-4 2xl:px-16">
        {tab === "overview" && <SystemOverview />}
        {tab === "hardware" && <HardwareInventory />}
        {tab === "processes" && <ProcessViewer />}
        {tab === "storage" && <StorageAnalyzer />}
        {tab === "startup" && <StartupApps />}
      </div>
    </div>
  );
}
