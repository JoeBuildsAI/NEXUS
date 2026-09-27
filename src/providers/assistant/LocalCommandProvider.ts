import type { AssistantMatch, AssistantProvider } from "./AssistantProvider";
import type { ActionId } from "@/core/actions/types";
import type { AppEntry, Game } from "@/core/types";
import { fuzzyScore } from "@/lib/fuzzy";

interface Rule {
  readonly actionId: ActionId;
  readonly phrases: readonly string[];
  readonly args?: Record<string, string>;
  readonly label: string;
  readonly hint?: string;
  readonly group: AssistantMatch["group"];
}

const R = (
  actionId: ActionId,
  label: string,
  phrases: string[],
  group: AssistantMatch["group"],
  args?: Record<string, string>,
  hint?: string,
): Rule => ({ actionId, label, phrases, group, args, hint });

const RULES: Rule[] = [
  // Navigation
  R("navigate", "Open Home", ["home", "go home", "dashboard", "command center"], "navigate", { screen: "home" }),
  R("navigate", "Open Gaming", ["gaming", "games", "open games", "go to gaming", "game hub", "library"], "navigate", { screen: "gaming" }),
  R("navigate", "Open Media", ["media", "videos", "workspace", "open media", "players"], "navigate", { screen: "media" }),
  R("navigate", "Open System", ["system", "system health", "telemetry", "performance", "health"], "navigate", { screen: "system" }),
  R("open-today", "Today", ["today", "home", "my day", "what's my day", "whats my day", "what am i doing today", "agenda today"], "life"),
  R("open-calendar", "Calendar", ["calendar", "open calendar", "schedule"], "life", { view: "day" }),
  R("open-calendar", "Tomorrow", ["tomorrow", "tomorrow's calendar", "what's tomorrow"], "life", { view: "day", dayOffset: "1" }),
  R("open-calendar", "This week", ["week", "this week", "weekly", "week view", "what's this week", "weekly planning"], "life", { view: "week" }),
  R("open-calendar", "Month", ["month", "this month", "month view"], "life", { view: "month" }),
  R("open-calendar", "Year", ["year", "year view"], "life", { view: "year" }),
  R("open-calendar", "Agenda", ["agenda", "upcoming events", "what's coming up"], "life", { view: "agenda" }),
  R("open-life", "Life", ["life", "open life", "life overview"], "life", { section: "overview" }),
  R("open-life", "Routines", ["routines", "my routines", "morning routine", "evening routine", "skincare", "personal care", "hygiene"], "life", { section: "routines" }),
  R("open-life", "Fitness", ["fitness", "gym", "workouts", "training", "push workout", "pull workout", "leg day", "workout history"], "life", { section: "fitness" }),
  R("open-life", "Nutrition", ["nutrition", "macros", "calories", "food library", "nutrition targets"], "life", { section: "nutrition" }),
  R("open-life", "Meals", ["meals", "meal plan", "meal planner", "what am i eating", "plan meals"], "life", { section: "meals" }),
  R("open-life", "Groceries", ["groceries", "grocery list", "shopping list", "what do i need to buy", "pantry"], "life", { section: "groceries" }),
  R("open-life", "Tasks", ["tasks", "todo", "to-do", "my tasks", "task inbox"], "life", { section: "tasks" }),
  R("start-workout", "Start workout", ["start workout", "start training", "begin workout", "start today's workout"], "life"),
  R("life-query", "Protein today", ["protein today", "how much protein", "protein"], "life", { metric: "protein" }),
  R("life-query", "Calories today", ["calories today", "how many calories", "kcal today"], "life", { metric: "calories" }),
  R("life-query", "What's for dinner", ["dinner", "what's for dinner", "whats for dinner", "what am i eating tonight", "tonight's dinner"], "life", { metric: "dinner" }),
  R("life-query", "What's for lunch", ["lunch", "what's for lunch"], "life", { metric: "lunch" }),
  R("life-query", "What's for breakfast", ["breakfast", "what's for breakfast"], "life", { metric: "breakfast" }),
  R("life-query", "Groceries still needed", ["what groceries do i still need", "groceries left", "still need to buy"], "life", { metric: "groceries" }),
  R("life-query", "Unfinished routines", ["unfinished routines", "routine items", "what routines are left", "routines left"], "life", { metric: "routines" }),
  R("life-query", "Today's workout", ["what's my workout", "whats my workout", "today's workout", "workout today"], "life", { metric: "workout" }),
  R("life-query", "Tomorrow at a glance", ["what's on tomorrow", "tomorrow's plan", "calendar tomorrow"], "life", { metric: "tomorrow" }),
  R("navigate", "Open Communications", ["communications", "comms", "email", "inbox", "mail", "messages"], "navigate", { screen: "communications" }),
  R("open-settings", "Open Settings", ["settings", "preferences", "options", "config"], "navigate", { section: "general" }),
  // Settings sections
  R("open-settings", "Settings · Appearance", ["appearance", "theme", "environment", "background", "look"], "settings", { section: "appearance" }),
  R("open-settings", "Settings · Privacy", ["privacy settings", "hotkey", "privacy hotkey"], "settings", { section: "privacy" }),
  R("open-settings", "Settings · Startup", ["startup settings", "launch on login", "autostart"], "settings", { section: "startup" }),
  R("open-settings", "Settings · Gaming", ["gaming settings", "allowlist", "approved apps"], "settings", { section: "gaming" }),
  R("open-settings", "Settings · Media", ["media settings", "authorized folders"], "settings", { section: "media" }),
  R("open-settings", "Settings · System", ["system settings", "safety", "process management"], "settings", { section: "system" }),
  R("open-settings", "Settings · Integrations", ["integrations", "steam integration", "connect steam"], "settings", { section: "integrations" }),
  R("open-settings", "Settings · AI", ["ai settings", "assistant settings"], "settings", { section: "ai" }),
  R("open-settings", "Settings · Shortcuts", ["shortcuts", "keyboard shortcuts", "keybinds"], "settings", { section: "shortcuts" }),
  // System
  R("open-storage", "Show Storage", ["storage", "show storage", "disk", "drives", "disk usage", "space"], "system"),
  R("analyze-storage", "Analyze Storage", ["analyze storage", "scan storage", "clean up", "cleanup", "reclaim space"], "system"),
  R("show-processes", "Show Running Processes", ["processes", "show processes", "running processes", "tasks", "task manager", "background apps"], "system"),
  R("system-query", "CPU status", ["cpu", "cpu usage", "processor"], "system", { metric: "cpu" }),
  R("system-query", "Memory status", ["memory", "ram", "memory usage"], "system", { metric: "memory" }),
  R("system-query", "GPU status", ["gpu", "graphics"], "system", { metric: "gpu" }),
  R("system-query", "Network status", ["network", "internet", "bandwidth"], "system", { metric: "network" }),
  R("system-query", "Uptime", ["uptime", "how long"], "system", { metric: "uptime" }),
  R("show-hardware", "Show Hardware", ["hardware", "specs", "my pc", "graphics card", "video card", "vram"], "system"),
  R("show-startup", "Show Startup Apps", ["startup", "startup apps", "boot apps", "run at startup"], "system"),
  R("open-diagnostics", "Open Diagnostics", ["diagnostics", "debug", "logs", "copy diagnostics"], "system"),
  // Settings search — individual settings resolve to their section
  R("open-settings", "Settings · Launch on login", ["launch on login", "launch on startup", "start with windows", "autostart nexus", "run at login"], "settings", { section: "general" }, "General"),
  R("open-settings", "Settings · Close button", ["close button", "minimize to tray", "exit on close", "tray behavior"], "settings", { section: "general" }, "General"),
  R("open-settings", "Settings · Clock format", ["clock", "12 hour", "24 hour", "time format"], "settings", { section: "general" }, "General"),
  R("open-settings", "Settings · Backup", ["export config", "import config", "backup", "restore settings"], "settings", { section: "general" }, "General"),
  R("open-settings", "Settings · Reduced motion", ["reduced motion", "animations", "motion", "disable animations"], "settings", { section: "appearance" }, "Appearance"),
  R("open-settings", "Settings · Privacy hotkey", ["change privacy hotkey", "privacy shortcut", "panic key"], "settings", { section: "privacy" }, "Privacy"),
  R("open-settings", "Settings · Thumbnails", ["thumbnails", "local thumbnails", "video thumbnails"], "settings", { section: "media" }, "Media"),
  R("open-settings", "Settings · Media locations", ["add folder", "authorize folder", "media folder", "media location", "media root"], "settings", { section: "media" }, "Media"),
  R("open-settings", "Settings · Primary GPU", ["primary gpu", "preferred gpu", "which gpu"], "settings", { section: "system" }, "System"),
  R("open-settings", "Settings · Activity history", ["activity history", "clear activity", "history"], "settings", { section: "system" }, "System"),
  R("open-settings", "Settings · Steam", ["steam settings", "steam api", "steam key", "api key", "steamid", "achievement sync"], "settings", { section: "integrations" }, "Integrations"),
  R("open-settings", "Settings · Email accounts", ["connect outlook", "connect gmail", "email account", "outlook", "gmail"], "settings", { section: "integrations" }, "Integrations"),
  // Modes
  R("enter-mode", "Enter Gaming Mode", ["gaming mode", "enter gaming mode", "start gaming mode", "game mode"], "mode", { mode: "gaming" }),
  R("enter-mode", "Enter Media Mode", ["media mode", "enter media mode"], "mode", { mode: "media" }),
  R("enter-mode", "Enter Work Mode", ["work mode", "enter work mode", "work"], "mode", { mode: "work" }),
  R("enter-mode", "Enter Focus Mode", ["focus mode", "enter focus mode", "focus", "do not disturb"], "mode", { mode: "focus" }),
  R("exit-mode", "Return to Normal Mode", ["normal mode", "return to normal", "exit mode", "normal", "leave mode"], "mode", { mode: "normal" }),
  // Media
  R("pause-media", "Pause All Media", ["pause", "pause media", "pause all", "stop playback", "stop"], "media"),
  R("play-media", "Play All Media", ["play all", "resume media", "play media"], "media"),
  R("mute-media", "Mute All Media", ["mute", "mute all", "silence"], "media"),
  R("privacy-mode", "Activate Privacy Mode", ["privacy", "privacy mode", "panic", "hide", "hide everything"], "media"),
  R("clear-workspace", "Clear Media Workspace", ["clear workspace", "unload players", "clear players"], "media"),
  // Mail — destructive intents navigate to review workflows, never execute.
  R("open-mail", "Unread mail", ["unread mail", "unread", "unread messages", "new mail"], "mail", { surface: "inbox", view: "all" }, "Inbox · unread"),
  R("open-mail", "Important mail", ["important mail", "priority mail", "priority", "urgent mail"], "mail", { surface: "inbox", view: "important" }),
  R("open-mail", "Today's receipts", ["receipts", "today's receipts", "todays receipts", "show receipts", "invoices"], "mail", { surface: "inbox", view: "receipts" }),
  R("open-mail", "Purchases & orders", ["purchases", "orders", "my orders", "shipping"], "mail", { surface: "inbox", view: "purchases" }),
  R("open-mail", "Travel mail", ["travel", "itinerary", "flights", "bookings"], "mail", { surface: "inbox", view: "travel" }),
  R("open-mail", "Financial mail", ["financial", "statements", "bank mail", "bills"], "mail", { surface: "inbox", view: "financial" }),
  R("open-mail", "Newsletters", ["newsletters", "show newsletters", "digests"], "mail", { surface: "inbox", view: "newsletters" }),
  R("open-mail", "Promotions", ["promotions", "promos", "deals mail", "marketing"], "mail", { surface: "inbox", view: "promotions" }),
  R("open-mail", "Notifications", ["notifications mail", "notification emails", "alerts mail"], "mail", { surface: "inbox", view: "notifications" }),
  R("open-mail", "Subscriptions", ["subscriptions", "subscription manager", "manage subscriptions", "unsubscribe", "newsletters manager"], "mail", { surface: "subscriptions" }, "Review first"),
  R("open-mail", "Inbox Health", ["inbox health", "email health", "mail health", "analyze inbox", "how much mail"], "mail", { surface: "health" }),
  R("open-mail", "Cleanup inbox", ["cleanup inbox", "clean inbox", "clean up email", "delete newsletters", "archive old mail", "bulk delete"], "mail", { surface: "inbox", view: "cleanup" }, "Review first"),
  R("open-mail", "Email rules", ["email rules", "mail rules", "routing rules", "filters", "gmail filters", "outlook rules"], "mail", { surface: "rules" }),
  R("open-mail", "Mail digest", ["today's mail", "what mattered today", "daily summary", "mail summary", "mail digest", "digest"], "mail", { surface: "summary" }),
  R("refresh-mail", "Refresh Gmail", ["refresh gmail", "sync gmail", "check gmail"], "mail", { provider: "gmail" }),
  R("refresh-mail", "Refresh Outlook", ["refresh outlook", "sync outlook", "check outlook"], "mail", { provider: "outlook" }),
  R("refresh-mail", "Refresh mail", ["refresh mail", "sync mail", "check mail", "refresh email", "check email"], "mail"),
  // Environment
  R("set-environment", "Environment · NEXUS", ["nexus environment", "nexus theme"], "settings", { environment: "nexus" }),
  R("set-environment", "Environment · Void", ["void", "void environment"], "settings", { environment: "void" }),
  R("set-environment", "Environment · Aurora", ["aurora", "aurora environment"], "settings", { environment: "aurora" }),
  R("set-environment", "Environment · Neural", ["neural", "neural environment"], "settings", { environment: "neural" }),
  R("set-environment", "Environment · Minimal", ["minimal", "minimal environment"], "settings", { environment: "minimal" }),
];

const LAUNCH_VERBS = /^(open|launch|start|run|play)\s+/;
const SHOW_VERBS = /^(show|view|go to|details for|info on)\s+/;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Searchable LIFE metadata (titles only — never notes, never email or media). */
export interface LifeIndexEntry {
  kind: "task" | "routine" | "exercise" | "workout" | "food" | "meal" | "event";
  id: string;
  title: string;
  hint?: string;
  /** Events: the day to open. */
  day?: string;
}

export interface CommandContext {
  getApps: () => Promise<readonly AppEntry[]>;
  getGames: () => Promise<readonly Game[]>;
  getLifeIndex?: () => readonly LifeIndexEntry[];
}

/**
 * Deterministic natural-ish command parser. Maps input to registered actions
 * with no external calls. Supports navigation, app launching, game lookup,
 * mode switching, system queries, settings navigation and media controls.
 *
 * SECURITY: only ever emits registered action ids with structured args.
 * Apps/games are referenced by opaque ids from providers — never by path.
 */
export class LocalCommandProvider implements AssistantProvider {
  readonly id = "local-command";
  constructor(private ctx?: CommandContext) {}

  async interpret(input: string): Promise<readonly AssistantMatch[]> {
    const q = normalize(input);
    if (!q) return [];
    const matches: AssistantMatch[] = [];
    const stripped = q.replace(LAUNCH_VERBS, "").replace(SHOW_VERBS, "");
    const wantsLaunch = LAUNCH_VERBS.test(q);
    const wantsShow = SHOW_VERBS.test(q);
    const achievementsQuery = /achievements?$/.test(q);

    // Games — launch / show / achievements.
    const games = (await this.ctx?.getGames().catch(() => [])) ?? [];
    for (const g of games) {
      const target = stripped.replace(/\s*achievements?$/, "");
      const score = fuzzyScore(target, g.title);
      if (score < 0.6) continue;
      if (achievementsQuery || wantsShow) {
        matches.push({ actionId: "show-game", args: { gameId: g.id }, confidence: score, label: `${g.title} — ${achievementsQuery ? "achievements" : "details"}`, group: "game", hint: g.installed ? "Installed" : "Not installed" });
      } else {
        matches.push({ actionId: "launch-game", args: { gameId: g.id }, confidence: score * (wantsLaunch ? 1 : 0.97), label: `Play ${g.title}`, group: "game", hint: g.installed ? "Steam" : "Not installed" });
        matches.push({ actionId: "show-game", args: { gameId: g.id }, confidence: score * 0.9, label: `${g.title} — details`, group: "game" });
      }
    }

    // Applications — launch.
    const apps = (await this.ctx?.getApps().catch(() => [])) ?? [];
    for (const a of apps) {
      const score = fuzzyScore(stripped, a.name);
      if (score < 0.6) continue;
      // Discovery quality nudges ranking: a Start Menu app beats a system32 helper with the same name score.
      const quality = a.rank != null ? 0.94 + (a.rank / 100) * 0.06 : 1;
      matches.push({
        actionId: "launch-app",
        args: { appId: a.id },
        confidence: score * (wantsLaunch ? 1 : 0.9) * quality,
        label: `Launch ${a.name}`,
        group: "app",
        hint: a.source === "builtin" ? "Windows" : a.source === "mock" ? "Demo" : a.source === "app-paths" ? "Registered" : "Installed",
      });
    }

    // LIFE search: tasks, routines, exercises, workouts, foods, meals, events by title.
    const SECTION: Record<LifeIndexEntry["kind"], string> = { task: "tasks", routine: "routines", exercise: "fitness", workout: "fitness", food: "nutrition", meal: "meals", event: "calendar" };
    for (const e of this.ctx?.getLifeIndex?.() ?? []) {
      const score = fuzzyScore(stripped, e.title);
      if (score < 0.62) continue;
      if (e.kind === "event") matches.push({ actionId: "open-calendar", args: { view: "day", day: e.day ?? "" }, confidence: score * 0.95, label: e.title, group: "life", hint: e.hint ?? "Event" });
      else if (e.kind === "workout" && wantsLaunch) matches.push({ actionId: "start-workout", args: { name: e.title }, confidence: score * 0.98, label: `Start ${e.title}`, group: "life", hint: "Workout" });
      else matches.push({ actionId: "open-life", args: { section: SECTION[e.kind], id: e.id }, confidence: score * 0.95, label: e.title, group: "life", hint: e.hint ?? e.kind.charAt(0).toUpperCase() + e.kind.slice(1) });
    }

    // "add task X" / "remind me to X" → create a task through the quick-add grammar.
    const task = /^(?:add task|new task|task|todo|remind me to)\s+(.{2,120})$/.exec(q);
    if (task) matches.push({ actionId: "add-task", args: { text: task[1]!.trim() }, confidence: 0.97, label: `Add task “${task[1]!.trim()}”`, group: "life", hint: "Today · tomorrow · 3pm · !high · #tag" });
    const workout = /^(?:start|begin)\s+(.{2,40}?)\s+workout$/.exec(q);
    if (workout) matches.push({ actionId: "start-workout", args: { name: workout[1]!.trim() }, confidence: 0.96, label: `Start ${workout[1]!.trim()} workout`, group: "life" });

    // "messages from X" / "mail from X" / "emails from X" → inbox filtered by sender or search.
    const from = /^(?:messages?|mail|emails?)\s+from\s+(.{2,60})$/.exec(q);
    if (from) {
      const who = from[1]!.trim();
      const isAddress = who.includes("@");
      matches.push({ actionId: "open-mail", args: isAddress ? { surface: "inbox", view: "all", sender: who } : { surface: "inbox", view: "all", query: who }, confidence: 0.95, label: `Messages from ${who}`, group: "mail", hint: isAddress ? "Exact sender" : "Search" });
    }

    // Rules
    for (const rule of RULES) {
      let best = 0;
      for (const phrase of rule.phrases) {
        const s = fuzzyScore(q, phrase);
        best = Math.max(best, s);
        if (phrase.includes(q) && q.length >= 3) best = Math.max(best, 0.86);
      }
      if (best >= 0.6) {
        matches.push({ actionId: rule.actionId, args: rule.args ?? {}, confidence: best, label: rule.label, group: rule.group, hint: rule.hint });
      }
    }

    // Dedupe by action+args keeping the highest confidence, then sort.
    const byKey = new Map<string, AssistantMatch>();
    for (const m of matches) {
      const key = `${m.actionId}:${JSON.stringify(m.args)}`;
      const existing = byKey.get(key);
      if (!existing || m.confidence > existing.confidence) byKey.set(key, m);
    }
    return [...byKey.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 8);
  }
}
