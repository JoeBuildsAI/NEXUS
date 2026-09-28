import { describe, expect, it } from "vitest";
import { groupProcesses } from "./processGroups";
import type { ProcessInfo } from "@/core/types";

const p = (pid: number, name: string, cls: ProcessInfo["classification"], cpu = 1, mem = 100): ProcessInfo => ({ pid, name, cpuPercent: cpu, memoryBytes: mem, classification: cls, publisher: null, path: null, managed: false });

describe("process grouping", () => {
  it("one row per executable with summed load", () => {
    const g = groupProcesses([p(1, "chrome.exe", "user-application", 1.2, 100), p(2, "Chrome.exe", "user-application", 0.4, 50), p(3, "dwm.exe", "system-critical")]);
    expect(g).toHaveLength(2);
    const chrome = g.find((x) => x.name.toLowerCase() === "chrome.exe")!;
    expect(chrome).toMatchObject({ count: 2, cpuPercent: 1.6, memoryBytes: 150, pids: [1, 2] });
  });

  it("SAFETY: a group takes the most protective class of its instances", () => {
    const g = groupProcesses([p(1, "helper.exe", "user-application"), p(2, "helper.exe", "platform")]);
    expect(g[0]!.classification).toBe("platform");
    expect(groupProcesses([p(1, "x.exe", "optional"), p(2, "x.exe", "unknown")])[0]!.classification).toBe("unknown");
  });
});
