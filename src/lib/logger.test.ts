import { describe, expect, it } from "vitest";
import { createLogger, formatRecentLog, getLogBuffer, redact } from "./logger";

const BS = String.fromCharCode(92);
const win = (...parts: string[]) => parts.join(BS);

describe("logger redaction", () => {
  it("strips secret-shaped keys and Windows paths from structured data", () => {
    const out = redact({ apiKey: "ABC", token: "t", path: win("X:", "Private", "video.mp4"), count: 3, nested: { steamId: "765", file: win("C:", "Users", "j", "Videos", "a.mkv") } })!;
    expect(out.apiKey).toBe("[redacted]");
    expect(out.token).toBe("[redacted]");
    expect(out.path).toBe("<path>");
    expect(out.count).toBe(3);
    expect((out.nested as Record<string, unknown>).steamId).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).file).toBe("<path>");
  });

  it("redacts paths embedded in messages and formats the recent log", () => {
    const log = createLogger("test");
    log.warn(`failed on ${win("D:", "Media", "secret clip.mp4")} and again`, { error: `open ${win("C:", "x", "y.mkv")}` });
    const last = getLogBuffer().at(-1)!;
    expect(last.message).not.toContain("secret clip");
    expect(last.message).toContain("<path>");
    expect(formatRecentLog(5)).toMatch(/WARN\s+\[test\]/);
    expect(formatRecentLog(5)).not.toContain("y.mkv");
  });
});
