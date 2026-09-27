/**
 * Structured local logger.
 *
 * PRIVACY: Never pass email bodies, media filenames, credentials, or API keys to
 * the logger. The `redact` helper strips obvious secret-shaped values as a second
 * line of defense, but callers remain responsible for not logging sensitive data.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly timestamp: number;
  readonly data?: Record<string, unknown>;
}

const SECRET_KEYS = /(pass|token|secret|key|credential|authorization|cookie)/i;

function redact(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

const BUFFER_LIMIT = 500;
const buffer: LogEntry[] = [];

function emit(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    scope,
    message,
    timestamp: Date.now(),
    data: redact(data),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();

  const fn =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${scope}] ${message}`, entry.data ?? "");
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => emit("debug", scope, msg, data),
    info: (msg: string, data?: Record<string, unknown>) => emit("info", scope, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => emit("warn", scope, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => emit("error", scope, msg, data),
  };
}

/** Snapshot of the in-memory log buffer (for a future diagnostics export). */
export function getLogBuffer(): readonly LogEntry[] {
  return [...buffer];
}
