import type { HealthStatus } from "@/core/types";

/** Non-scientific, human-readable health labels + tones for the UI. */
export const HEALTH_META: Record<
  HealthStatus,
  { label: string; tone: "nominal" | "attention" | "warning" | "critical" }
> = {
  nominal: { label: "Nominal", tone: "nominal" },
  attention: { label: "Attention Recommended", tone: "attention" },
  "storage-pressure": { label: "Storage Pressure", tone: "warning" },
  "high-memory": { label: "High Memory Usage", tone: "warning" },
  critical: { label: "Critical", tone: "critical" },
};
