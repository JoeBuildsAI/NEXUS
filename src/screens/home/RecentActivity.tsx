import { useActivityStore } from "@/state/activityStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useNavigationStore } from "@/state/navigationStore";
import { formatRelativeTime } from "@/lib/utils";
import { SectionLabel } from "./HomeSurfaces";

/** Quiet, private activity ledger. Nothing here can name a media file or a message. */
export function RecentActivity() {
  const entries = useActivityStore((s) => s.entries);
  const enabled = useSettingsStore((s) => s.system.activityHistory);
  const navigate = useNavigationStore((s) => s.navigate);
  const selectGame = useNavigationStore((s) => s.selectGame);
  if (!enabled || entries.length === 0) return null;
  return (
    <div>
      <SectionLabel action="Clear" onAction={() => useActivityStore.getState().clear()}>Recent</SectionLabel>
      <ul className="divide-y divide-white/[0.05]">
        {entries.slice(0, 5).map((e) => (
          <li key={e.id} className="flex items-baseline gap-4 py-2">
            <button
              onClick={() => { if (e.gameId) { navigate("gaming"); selectGame(e.gameId); } }}
              className={`min-w-0 flex-1 truncate text-left text-[14px] text-white/65 ${e.gameId ? "hover:text-white" : "cursor-default"}`}
              disabled={!e.gameId}
            >
              {e.text}
            </button>
            <span className="shrink-0 font-mono text-[11px] tabular text-white/30">{formatRelativeTime(e.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
