import type { ProcessClass } from "@/core/types";

type Tone = "neutral" | "accent" | "nominal" | "attention" | "warning" | "critical";

export const PROCESS_CLASS_META: Record<
  ProcessClass,
  { label: string; tone: Tone; protected: boolean }
> = {
  "system-critical": { label: "System Critical", tone: "critical", protected: true },
  driver: { label: "Driver", tone: "warning", protected: true },
  security: { label: "Security", tone: "critical", protected: true },
  hardware: { label: "Hardware", tone: "attention", protected: true },
  "user-application": { label: "Application", tone: "accent", protected: false },
  optional: { label: "Optional", tone: "neutral", protected: false },
  unknown: { label: "Unknown", tone: "warning", protected: true },
};
