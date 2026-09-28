import type { ProcessClass, ProcessInfo } from "@/core/types";

export type ProcessGroup = ProcessInfo & { readonly count: number; readonly pids: readonly number[] };

/** Most protective first: a group is only as manageable as its least manageable instance. */
const PROTECTION: ProcessClass[] = ["system-critical", "security", "driver", "platform", "hardware", "unknown", "optional", "user-application"];

/**
 * One row per executable name (Gaming Mode preferences are per name, and a
 * browser can run dozens of instances). CPU and memory are summed; the class
 * is the most protective class among the instances.
 */
export function groupProcesses(list: readonly ProcessInfo[]): ProcessGroup[] {
  const groups = new Map<string, ProcessGroup>();
  for (const p of list) {
    const key = p.name.toLowerCase();
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...p, count: 1, pids: [p.pid] });
      continue;
    }
    const cls = PROTECTION.indexOf(p.classification) < PROTECTION.indexOf(g.classification) ? p.classification : g.classification;
    groups.set(key, {
      ...g,
      classification: cls,
      cpuPercent: Math.round((g.cpuPercent + p.cpuPercent) * 10) / 10,
      memoryBytes: g.memoryBytes + p.memoryBytes,
      path: g.path ?? p.path,
      count: g.count + 1,
      pids: [...g.pids, p.pid],
    });
  }
  return [...groups.values()];
}
