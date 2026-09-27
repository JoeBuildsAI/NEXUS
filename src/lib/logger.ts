/**
 * Structured local logger.
 *
 * PRIVACY: Never pass email bodies, media filenames, credentials, or API keys to
 * the logger. `redact` strips secret-shaped keys and Windows paths as a second
 * line of defense, but callers remain responsible for not logging sensitive data.
 *
 * Levels: production builds print warn/error only; dev prints everything.
 * The in-memory ring buffer feeds the sanitized diagnostics export.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly timestamp: number;
  readonly data?: Record<string, unknown>;
}

const SECRET_KEYS = /(pass|token|secret|key|credential|authorization|cookie|steamid|address|email)/i;
const WIN_PATH = /(?:[A-Za-z]:|\\\\)[^\s"'<>|]*\\[^\s"'<>|]*/g;
const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let consoleLevel: LogLevel = import.meta.env.DEV ? "debug" : "warn";

/** Adjust console verbosity at runtime (developer panel); the buffer always records everything. */
export function setConsoleLevel(level: LogLevel) {
  consoleLevel = level;
}

export function redactValue(v: unknown): unknown {
  if (typeof v === "string") return v.replace(WIN_PATH, "<path>");
  if (Array.isArray(v)) return v.length > 20 ? `[${v.length} items]` : v.map(redactValue);
  if (v && typeof v === "object") return redact(v as Record<string, unknown>);
  return v;
}

export function redact(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redactValue(v);
  }
  return out;
}

const BUFFER_LIMIT = 500;
const buffer: LogEntry[] = [];

function emit(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    scope,
    message: message.replace(WIN_PATH, "<path>"),
    timestamp: Date.now(),
    data: redact(data),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();

  if (LEVEL_RANK[level] < LEVEL_RANK[consoleLevel]) return;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${scope}] ${entry.message}`, entry.data ?? "");
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => emit("debug", scope, msg, data),
    info: (msg: string, data?: Record<string, unknown>) => emit("info", scope, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => emit("warn", scope, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => emit("error", scope, msg, data),
  };
}

/** Snapshot of the in-memory log buffer (already redacted at write time). */
export function getLogBuffer(): readonly LogEntry[] {
  return [...buffer];
}

/** Recent log lines as text for the diagnostics export. */
export function formatRecentLog(limit = 120): string {
  return buffer
    .slice(-limit)
    .map((e) => `${new Date(e.timestamp).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.scope}] ${e.message}${e.data && Object.keys(e.data).length ? " " + JSON.stringify(e.data) : ""}`)
    .join("\n");
}
