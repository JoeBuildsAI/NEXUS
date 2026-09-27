import type { GameDetails, InboxSummary, TelemetrySnapshot, CleanupCandidate } from "@/core/types";
import type { OperatingMode } from "@/core/types";

export type InsightTone = "neutral" | "accent" | "attention" | "warning";

export interface Insight {
  readonly id: string;
  readonly text: string;
  readonly tone: InsightTone;
  /** Optional action the UI can offer. */
  readonly action?: { readonly label: string; readonly actionId: string; readonly args?: Record<string, string> };
  readonly priority: number; // higher first
}

export interface InsightInputs {
  readonly telemetry: TelemetrySnapshot | null;
  readonly games: readonly GameDetails[];
  readonly inbox: InboxSummary | null;
  readonly cleanup: readonly CleanupCandidate[];
  readonly approvedAppCount: number;
  readonly mode: OperatingMode;
  readonly steamConnected: boolean;
  readonly mediaConnected: boolean;
  readonly tracked?: { gameId: string; gameTitle: string; name: string } | null;
  readonly gameSession?: { title: string } | null;
}

const GB = 1024 ** 3;

/**
 * Deterministic, rule-based recommendations. No model, no fake certainty —
 * every sentence is derived from provider data and says what it saw.
 */
export function generateInsights(i: InsightInputs): Insight[] {
  const out: Insight[] = [];
  const t = i.telemetry;

  if (i.gameSession) {
    out.push({ id: "session", text: `Game session active — ${i.gameSession.title}. NEXUS is running with a reduced footprint.`, tone: "accent", priority: 95 });
  }
  if (i.tracked) {
    out.push({
      id: "tracked",
      text: `Tracking “${i.tracked.name}” in ${i.tracked.gameTitle}.`,
      tone: "accent",
      action: { label: "Open", actionId: "show-game", args: { gameId: i.tracked.gameId } },
      priority: 70,
    });
  }

  if (t) {
    const pressured = t.storage.filter((d) => d.kind === "fixed" && d.totalBytes > 0 && d.freeBytes / d.totalBytes < 0.12);
    const reclaimable = i.cleanup.filter((c) => c.risk !== "destructive").reduce((s, c) => s + c.bytes, 0);
    if (pressured.length > 0 || t.health === "storage-pressure") {
      out.push({
        id: "storage-pressure",
        text: `Storage pressure detected. ${(reclaimable / GB).toFixed(0)} GB of temporary data can be reviewed.`,
        tone: "warning",
        action: { label: "Review", actionId: "open-storage" },
        priority: 90,
      });
    } else if (reclaimable > 8 * GB) {
      out.push({
        id: "reclaimable",
        text: `${(reclaimable / GB).toFixed(0)} GB of safe-to-review cleanup candidates are available.`,
        tone: "neutral",
        action: { label: "Review", actionId: "open-storage" },
        priority: 40,
      });
    }
    if (t.memory.usagePercent >= 85) {
      out.push({ id: "mem", text: `Memory usage is high at ${t.memory.usagePercent}%.`, tone: "warning", action: { label: "Processes", actionId: "show-processes" }, priority: 85 });
    }
    if (t.cpu.usagePercent >= 90) {
      out.push({ id: "cpu", text: `CPU is under heavy load at ${t.cpu.usagePercent}%.`, tone: "attention", action: { label: "Processes", actionId: "show-processes" }, priority: 80 });
    }
  }

  // Near-complete games
  for (const g of i.games) {
    const remaining = g.achievements.total - g.achievements.unlocked;
    if (g.achievements.total > 0 && remaining > 0 && remaining <= 3) {
      out.push({
        id: `near-${g.id}`,
        text: `You are ${remaining} achievement${remaining === 1 ? "" : "s"} from completing ${g.title}.`,
        tone: "accent",
        action: { label: "View", actionId: "show-game", args: { gameId: g.id } },
        priority: 60,
      });
    }
  }

  if (i.mode !== "gaming" && i.approvedAppCount > 0) {
    out.push({
      id: "gaming-ready",
      text: `Gaming Mode will close ${i.approvedAppCount} approved background application${i.approvedAppCount === 1 ? "" : "s"}.`,
      tone: "neutral",
      action: { label: "Enter", actionId: "enter-mode", args: { mode: "gaming" } },
      priority: 30,
    });
  }

  if (i.inbox && i.inbox.important > 0) {
    out.push({
      id: "inbox",
      text: `${i.inbox.important} message${i.inbox.important === 1 ? "" : "s"} flagged potentially important since your last check.`,
      tone: "attention",
      action: { label: "Open", actionId: "navigate", args: { screen: "communications" } },
      priority: 55,
    });
  }

  if (!i.steamConnected) {
    out.push({ id: "steam", text: "Steam is not connected. Gaming uses the demo library.", tone: "neutral", action: { label: "Integrations", actionId: "open-settings", args: { section: "integrations" } }, priority: 10 });
  }

  if (out.length === 0) {
    out.push({ id: "nominal", text: "All systems nominal. No action required.", tone: "neutral", priority: 1 });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
