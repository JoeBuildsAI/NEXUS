import type { CleanupCandidate, CleanupPlan, DriveInfo } from "@/core/types";

/**
 * Storage safety rules, enforced in the service layer (not just the UI) and
 * mirrored natively (`storage.rs` refuses removable drives outright).
 *
 * RULE 1: NEXUS NEVER scans or cleans removable or network drives. There is no
 * opt-in. Media authorization is a separate permission domain and grants
 * nothing here.
 *
 * RULE 2: Cleanup always follows DISCOVER → PROPOSE → APPROVE → EXECUTE. There is
 * no path from discovery straight to deletion.
 */

/** Drives eligible for analysis/cleanup: fixed only. */
export function eligibleDrivesForScan(drives: readonly DriveInfo[]): DriveInfo[] {
  return drives.filter((d) => d.kind === "fixed");
}

/** Guard: throw if a scan is attempted against a non-fixed drive. */
export function assertScanAllowed(drive: DriveInfo): void {
  if (drive.kind !== "fixed") {
    throw new Error(`Refusing to scan ${drive.kind} drive ${drive.mountPoint}. Only fixed drives are analyzed.`);
  }
}

export function buildPlan(candidates: readonly CleanupCandidate[]): CleanupPlan {
  const approved = candidates.filter((c) => c.approved);
  return {
    stage: approved.length > 0 ? "approve" : "propose",
    candidates,
    reclaimableBytes: approved.reduce((sum, c) => sum + c.bytes, 0),
  };
}

/**
 * Validate a plan before execution. Returns the list of blocking reasons; an
 * empty array means execution is permitted for the approved candidates.
 */
export function validateExecution(plan: CleanupPlan): string[] {
  const errors: string[] = [];
  const approved = plan.candidates.filter((c) => c.approved);
  if (approved.length === 0) {
    errors.push("No candidates approved for cleanup.");
  }
  return errors;
}
