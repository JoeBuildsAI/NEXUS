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

describe("storage safety — removable drive guarantee", () => {
  it("only fixed drives are ever eligible for analysis/cleanup", () => {
    const eligible = eligibleDrivesForScan([fixed, removable, network]);
    expect(eligible.map((d) => d.mountPoint)).toEqual(["C:\\"]);
  });

  it("there is no opt-in path: the function accepts no override", () => {
    expect(eligibleDrivesForScan.length).toBe(1);
    expect(assertScanAllowed.length).toBe(1);
  });

  it("throws for removable and network drives", () => {
    expect(() => assertScanAllowed(removable)).toThrow(/removable/i);
    expect(() => assertScanAllowed(network)).toThrow(/network/i);
    expect(() => assertScanAllowed(fixed)).not.toThrow();
  });

  it("media authorization of a removable root grants nothing to storage", async () => {
    // Simulate the user authorizing X:\ for media; storage eligibility must be unchanged.
    const { useMediaLibraryStore } = await import("@/state/mediaLibraryStore");
    useMediaLibraryStore.getState().addRoot({ id: "root-x", path: "X:\\", kind: "removable", authorizedAt: Date.now(), exists: true });
    expect(eligibleDrivesForScan([fixed, removable]).some((d) => d.mountPoint === "X:\\")).toBe(false);
    expect(() => assertScanAllowed(removable)).toThrow();
    useMediaLibraryStore.getState().removeRoot("root-x");
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
