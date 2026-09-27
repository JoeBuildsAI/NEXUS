import type { AssistantMatch, AssistantProvider } from "./AssistantProvider";
import type { ActionId } from "@/core/actions/types";
import { DEMO_GAMES } from "@/core/demo/games";

interface Rule {
  readonly actionId: ActionId;
  readonly phrases: readonly string[];
  readonly args?: Record<string, string>;
  readonly label: string;
}

const SCREEN_RULES: Rule[] = [
  { actionId: "navigate", phrases: ["home", "go home", "dashboard", "command center"], args: { screen: "home" }, label: "Open Home" },
  { actionId: "navigate", phrases: ["gaming", "games", "open games", "go to gaming", "game hub"], args: { screen: "gaming" }, label: "Open Gaming" },
  { actionId: "navigate", phrases: ["media", "videos", "workspace", "open media"], args: { screen: "media" }, label: "Open Media" },
  { actionId: "navigate", phrases: ["system", "system health", "telemetry", "performance"], args: { screen: "system" }, label: "Open System" },
  { actionId: "navigate", phrases: ["communications", "comms", "email", "inbox", "mail", "messages"], args: { screen: "communications" }, label: "Open Communications" },
  { actionId: "navigate", phrases: ["settings", "preferences", "options", "config"], args: { screen: "settings" }, label: "Open Settings" },
  { actionId: "open-storage", phrases: ["storage", "show storage", "disk", "drives", "disk usage"], label: "Show Storage" },
  { actionId: "analyze-storage", phrases: ["analyze storage", "scan storage", "clean up", "cleanup", "reclaim space"], label: "Analyze Storage" },
  { actionId: "show-processes", phrases: ["processes", "show processes", "running processes", "tasks", "task manager"], label: "Show Running Processes" },
];

const MODE_RULES: Rule[] = [
  { actionId: "enter-mode", phrases: ["gaming mode", "enter gaming mode", "start gaming mode"], args: { mode: "gaming" }, label: "Enter Gaming Mode" },
  { actionId: "enter-mode", phrases: ["media mode", "enter media mode"], args: { mode: "media" }, label: "Enter Media Mode" },
  { actionId: "enter-mode", phrases: ["work mode", "enter work mode"], args: { mode: "work" }, label: "Enter Work Mode" },
  { actionId: "enter-mode", phrases: ["focus mode", "enter focus mode"], args: { mode: "focus" }, label: "Enter Focus Mode" },
  { actionId: "exit-mode", phrases: ["normal mode", "return to normal", "exit mode", "normal"], args: { mode: "normal" }, label: "Return to Normal Mode" },
];

const MEDIA_RULES: Rule[] = [
  { actionId: "pause-media", phrases: ["pause", "pause media", "pause all", "stop playback"], label: "Pause All Media" },
  { actionId: "mute-media", phrases: ["mute", "mute all", "silence"], label: "Mute All Media" },
  { actionId: "privacy-mode", phrases: ["privacy", "privacy mode", "panic", "hide"], label: "Activate Privacy Mode" },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Levenshtein-free lightweight similarity: token overlap ratio. */
function similarity(a: string, b: string): number {
  const at = new Set(a.split(" "));
  const bt = new Set(b.split(" "));
  let common = 0;
  for (const t of at) if (bt.has(t)) common++;
  return common / Math.max(at.size, bt.size);
}

/**
 * Deterministic natural-ish command parser. Maps input to registered actions
 * with no external calls. The app already "feels" like an assistant while
 * remaining fully local and predictable.
 */
export class LocalCommandProvider implements AssistantProvider {
  readonly id = "local-command";

  private rules: Rule[] = [...SCREEN_RULES, ...MODE_RULES, ...MEDIA_RULES];

  async interpret(input: string): Promise<readonly AssistantMatch[]> {
    const q = normalize(input);
    if (!q) return [];
    const matches: AssistantMatch[] = [];

    // 1. Game launch: "open <game>", "play <game>", or a title substring.
    for (const g of DEMO_GAMES) {
      const title = normalize(g.title);
      const launchy = q.startsWith("open ") || q.startsWith("play ") || q.startsWith("launch ");
      if (q.includes(title) || (launchy && title.includes(q.replace(/^(open|play|launch)\s+/, "")))) {
        matches.push({
          actionId: "launch-game",
          args: { gameId: g.id },
          confidence: q.includes(title) ? 0.95 : 0.8,
          label: `Launch ${g.title}`,
        });
      }
    }

    // 2. Rule-based exact and fuzzy matching.
    for (const rule of this.rules) {
      let best = 0;
      for (const phrase of rule.phrases) {
        if (q === phrase) best = Math.max(best, 1);
        else if (q.includes(phrase) || phrase.includes(q)) best = Math.max(best, 0.85);
        else best = Math.max(best, similarity(q, phrase) * 0.7);
      }
      if (best >= 0.5) {
        matches.push({
          actionId: rule.actionId,
          args: rule.args ?? {},
          confidence: best,
          label: rule.label,
        });
      }
    }

    // Dedupe by action+args keeping the highest confidence, then sort.
    const byKey = new Map<string, AssistantMatch>();
    for (const m of matches) {
      const key = `${m.actionId}:${JSON.stringify(m.args)}`;
      const existing = byKey.get(key);
      if (!existing || m.confidence > existing.confidence) byKey.set(key, m);
    }
    return [...byKey.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
  }
}
