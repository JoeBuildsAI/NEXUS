import { Activity, Gamepad2, HardDrive, Mail, Play, Trophy } from "lucide-react";
import { QuickCard } from "./QuickCard";
import { Badge } from "@/components/ui";
import { useNavigationStore } from "@/state/navigationStore";
import { useAsync } from "@/hooks/useAsync";
import { getProviders } from "@/providers";
import type { Game } from "@/core/types";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { DEMO_GAMES } from "@/core/demo/games";
import { demoStorageAnalysis } from "@/core/demo/storage";

export function GamingCard() {
  const navigate = useNavigationStore((s) => s.navigate);
  const selectGame = useNavigationStore((s) => s.selectGame);
  const { data: games } = useAsync<readonly Game[]>(
    () => getProviders().steam.getGames(),
    [],
  );
  const lastPlayed = [...(games ?? [])]
    .filter((g) => g.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0];
  const details = lastPlayed
    ? DEMO_GAMES.find((g) => g.id === lastPlayed.id)
    : undefined;

  return (
    <QuickCard
      title="Gaming"
      icon={<Gamepad2 size={15} />}
      accent="#e6a15e"
      onClick={() => {
        navigate("gaming");
        if (lastPlayed) selectGame(lastPlayed.id);
      }}
    >
      {lastPlayed ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide2 text-white/35">
            Last Played
          </p>
          <p className="mt-1 text-lg font-semibold text-white/95">
            {lastPlayed.title}
          </p>
          {details && (
            <div className="mt-3 flex items-center gap-2">
              <Trophy size={13} className="text-ember" />
              <span className="font-mono text-sm text-white/70">
                {details.achievements.unlocked} / {details.achievements.total}
              </span>
              <span className="text-xs text-white/35">achievements</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-white/40">No recent games</p>
      )}
    </QuickCard>
  );
}

export function CommunicationsCard() {
  const navigate = useNavigationStore((s) => s.navigate);
  const { data: summary } = useAsync(
    () => getProviders().email.getSummary(Date.now() - 3 * 24 * 3600 * 1000),
    [],
  );

  return (
    <QuickCard
      title="Communications"
      icon={<Mail size={15} />}
      accent="#9f8cff"
      onClick={() => navigate("communications")}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-semibold text-white/95">
          {summary?.unread ?? "—"}
        </span>
        <span className="text-sm text-white/40">unread</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {summary && summary.important > 0 && (
          <Badge tone="attention">{summary.important} important</Badge>
        )}
        {summary && summary.newsletters > 0 && (
          <Badge tone="neutral">{summary.newsletters} newsletters</Badge>
        )}
        {summary && summary.receipts > 0 && (
          <Badge tone="neutral">{summary.receipts} receipts</Badge>
        )}
      </div>
    </QuickCard>
  );
}

export function StorageCard() {
  const navigate = useNavigationStore((s) => s.navigate);
  const setTab = useNavigationStore((s) => s.setSystemTab);
  const analysis = demoStorageAnalysis("C:\\");
  const usedPct = (analysis.usedBytes / analysis.totalBytes) * 100;

  return (
    <QuickCard
      title="Storage"
      icon={<HardDrive size={15} />}
      accent="#5ee6a1"
      onClick={() => {
        navigate("system");
        setTab("storage");
      }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold text-white/95">
          {formatBytes(analysis.usedBytes, 1)}
        </span>
        <span className="text-sm text-white/40">
          / {formatBytes(analysis.totalBytes, 0)}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-status-nominal/70 to-status-nominal"
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-white/40">~34 GB potentially reclaimable</p>
    </QuickCard>
  );
}

export function MediaCard() {
  const navigate = useNavigationStore((s) => s.navigate);
  return (
    <QuickCard
      title="Media"
      icon={<Play size={15} />}
      accent="#5ed0e6"
      onClick={() => navigate("media")}
    >
      <p className="text-sm text-white/70">Six-player workspace</p>
      <p className="mt-1 text-xs text-white/35">
        Private library · content hidden on Home
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="aspect-video rounded-sm border border-white/[0.06] bg-white/[0.03]"
          />
        ))}
      </div>
    </QuickCard>
  );
}

const RECENT_ACTIVITY = [
  { icon: Gamepad2, text: "Played Baldur's Gate 3", time: Date.now() - 3600 * 1000 },
  { icon: Trophy, text: "Unlocked ‘The Throne’ in We Were Here Too", time: Date.now() - 6 * 3600 * 1000 },
  { icon: HardDrive, text: "Storage analysis completed", time: Date.now() - 26 * 3600 * 1000 },
  { icon: Activity, text: "Entered Gaming Mode", time: Date.now() - 2 * 24 * 3600 * 1000 },
];

export function RecentActivityCard() {
  return (
    <QuickCard title="Recent Activity" icon={<Activity size={15} />}>
      <ul className="space-y-2.5">
        {RECENT_ACTIVITY.map((a, i) => {
          const Icon = a.icon;
          return (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span className="text-accent/60">
                <Icon size={14} />
              </span>
              <span className="flex-1 truncate text-white/70">{a.text}</span>
              <span className="shrink-0 text-xs text-white/30">
                {formatRelativeTime(a.time)}
              </span>
            </li>
          );
        })}
      </ul>
    </QuickCard>
  );
}
