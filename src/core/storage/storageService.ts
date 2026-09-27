import type { CleanupCandidate, CleanupPlan, DriveInfo } from "@/core/types";

/**
 * Storage safety rules, enforced in the service layer (not just the UI).
 *
 * RULE 1: NEXUS must NEVER automatically scan removable drives. Only fixed
 * internal drives are eligible for automatic scanning/cleanup. Removable drives
 * require explicit per-drive opt-in.
 *
 * RULE 2: Cleanup always follows DISCOVER → PROPOSE → APPROVE → EXECUTE. There is
 * no path from discovery straight to deletion; execution requires that every
 * candidate be individually approved, and destructive candidates require it too.
 */

/** Drives eligible for automatic scanning: fixed only, unless explicitly opted in. */
export function eligibleDrivesForScan(
  drives: readonly DriveInfo[],
  optedInRemovable: readonly string[] = [],
): DriveInfo[] {
  return drives.filter(
    (d) =>
      d.kind === "fixed" ||
      (d.kind === "removable" && optedInRemovable.includes(d.mountPoint)),
  );
}

/** Guard: throw if a scan is attempted against a non-eligible removable drive. */
export function assertScanAllowed(
  drive: DriveInfo,
  optedInRemovable: readonly string[] = [],
): void {
  if (drive.kind === "removable" && !optedInRemovable.includes(drive.mountPoint)) {
    throw new Error(
      `Refusing to scan removable drive ${drive.mountPoint} without explicit opt-in.`,
    );
  }
  if (drive.kind === "network") {
    throw new Error(`Refusing to scan network drive ${drive.mountPoint}.`);
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
  // Destructive candidates must be explicitly approved (they are, if in the
  // approved set) AND surfaced for confirmation by the caller.
  return errors;
}
