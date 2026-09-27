/** Storage analyzer domain models. Cleanup follows DISCOVER→PROPOSE→APPROVE→EXECUTE. */

export type StorageCategory =
  | "games"
  | "applications"
  | "documents"
  | "downloads"
  | "media"
  | "system"
  | "temporary"
  | "other";

export interface StorageCategoryUsage {
  readonly category: StorageCategory;
  readonly bytes: number;
  readonly itemCount: number;
}

export interface StorageAnalysis {
  readonly drive: string;
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly freeBytes: number;
  readonly categories: readonly StorageCategoryUsage[];
  readonly analyzedAt: number;
}

export type CleanupRisk = "safe" | "review" | "destructive";

/** A discovered cleanup candidate. Nothing is deleted until explicitly approved. */
export interface CleanupCandidate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly bytes: number;
  readonly risk: CleanupRisk;
  readonly category: StorageCategory;
  /** Whether this candidate has been approved by the user for execution. */
  readonly approved: boolean;
}

export type CleanupStage = "discover" | "propose" | "approve" | "execute";

export interface CleanupPlan {
  readonly stage: CleanupStage;
  readonly candidates: readonly CleanupCandidate[];
  readonly reclaimableBytes: number;
}
