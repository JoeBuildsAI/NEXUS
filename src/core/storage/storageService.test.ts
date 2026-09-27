import { describe, expect, it } from "vitest";
import {
  assertScanAllowed,
  buildPlan,
  eligibleDrivesForScan,
  validateExecution,
} from "./storageService";
import type { CleanupCandidate, DriveInfo } from "@/core/types";

const fixed: DriveInfo = {
  mountPoint: "C:\\",
  label: "System",
  kind: "fixed",
  totalBytes: 1000,
  freeBytes: 400,
  fileSystem: "NTFS",
  eligibleForScan: true,
};
const removable: DriveInfo = {
  mountPoint: "X:\\",
  label: "USB",
  kind: "removable",
  totalBytes: 2000,
  freeBytes: 1000,
  fileSystem: "exFAT",
  eligibleForScan: false,
};
const network: DriveInfo = { ...fixed, mountPoint: "Z:\\", kind: "network" };

describe("storage safety", () => {
  it("excludes removable drives from automatic scanning by default", () => {
    const eligible = eligibleDrivesForScan([fixed, removable, network]);
    expect(eligible.map((d) => d.mountPoint)).toEqual(["C:\\"]);
  });

  it("includes a removable drive only after explicit opt-in", () => {
    const eligible = eligibleDrivesForScan([fixed, removable], ["X:\\"]);
    expect(eligible.map((d) => d.mountPoint)).toContain("X:\\");
  });

  it("throws when scanning a removable drive without opt-in", () => {
    expect(() => assertScanAllowed(removable)).toThrow(/removable/i);
    expect(() => assertScanAllowed(removable, ["X:\\"])).not.toThrow();
  });

  it("refuses to scan network drives", () => {
    expect(() => assertScanAllowed(network)).toThrow(/network/i);
  });
});

describe("cleanup plan (DISCOVER→PROPOSE→APPROVE→EXECUTE)", () => {
  const candidates: CleanupCandidate[] = [
    { id: "a", label: "Temp", description: "", bytes: 100, risk: "safe", category: "temporary", approved: false },
    { id: "b", label: "Dumps", description: "", bytes: 50, risk: "safe", category: "temporary", approved: true },
  ];

  it("only counts approved candidates toward reclaimable space", () => {
    const plan = buildPlan(candidates);
    expect(plan.reclaimableBytes).toBe(50);
    expect(plan.stage).toBe("approve");
  });

  it("blocks execution when nothing is approved", () => {
    const plan = buildPlan(candidates.map((c) => ({ ...c, approved: false })));
    expect(validateExecution(plan)).toHaveLength(1);
  });

  it("permits execution when at least one candidate is approved", () => {
    const plan = buildPlan(candidates);
    expect(validateExecution(plan)).toHaveLength(0);
  });
});
