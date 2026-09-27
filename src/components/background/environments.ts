import type { EnvironmentPreset } from "@/state/settingsStore";
import type { OperatingMode } from "@/core/types";

export interface EnvironmentSpec {
  readonly label: string;
  readonly description: string;
  /** Base radial gradient stops (top glow → base). */
  readonly base: readonly [string, string, string];
  /** Light field blob colors (rgba). */
  readonly lights: readonly string[];
  readonly particleColor: readonly [number, number, number];
  /** Baseline particle density multiplier. */
  readonly density: number;
  /** Baseline drift speed multiplier. */
  readonly speed: number;
  readonly grid: boolean;
  readonly noise: boolean;
}

export const ENVIRONMENTS: Record<EnvironmentPreset, EnvironmentSpec> = {
  nexus: {
    label: "NEXUS",
    description: "Cool steel-cyan depth. The signature environment.",
    base: ["rgba(30,58,74,0.6)", "rgba(10,14,20,0.92)", "#05070a"],
    lights: ["rgba(56,180,207,0.13)", "rgba(94,110,230,0.10)", "rgba(40,120,150,0.08)"],
    particleColor: [150, 210, 230],
    density: 1,
    speed: 1,
    grid: true,
    noise: true,
  },
  void: {
    label: "VOID",
    description: "Near-black. Minimal light, maximum focus on content.",
    base: ["rgba(14,16,22,0.7)", "rgba(6,7,10,0.95)", "#030405"],
    lights: ["rgba(60,70,90,0.08)", "rgba(30,34,44,0.10)"],
    particleColor: [180, 190, 210],
    density: 0.45,
    speed: 0.6,
    grid: false,
    noise: true,
  },
  aurora: {
    label: "AURORA",
    description: "Slow drifting bands of teal, violet and emerald.",
    base: ["rgba(28,70,72,0.55)", "rgba(12,16,26,0.92)", "#05070a"],
    lights: ["rgba(64,220,190,0.14)", "rgba(140,90,230,0.13)", "rgba(60,200,120,0.09)", "rgba(90,140,255,0.10)"],
    particleColor: [170, 230, 220],
    density: 0.9,
    speed: 1.3,
    grid: false,
    noise: true,
  },
  neural: {
    label: "NEURAL",
    description: "Connected nodes and faint synaptic links.",
    base: ["rgba(40,44,74,0.55)", "rgba(10,12,22,0.93)", "#05060c"],
    lights: ["rgba(120,110,255,0.12)", "rgba(80,160,255,0.10)"],
    particleColor: [190, 190, 255],
    density: 1.15,
    speed: 0.8,
    grid: true,
    noise: false,
  },
  minimal: {
    label: "MINIMAL",
    description: "Clean gradient. No particles.",
    base: ["rgba(24,30,40,0.6)", "rgba(10,13,18,0.95)", "#07090d"],
    lights: ["rgba(90,120,150,0.08)"],
    particleColor: [200, 210, 220],
    density: 0,
    speed: 0,
    grid: false,
    noise: false,
  },
};

/** How the active operating mode modulates the environment. */
export interface ModeMood {
  readonly energy: number; // speed multiplier
  readonly brightness: number; // light-field opacity multiplier
  readonly tint: string | null; // optional overlay tint
}

export const MODE_MOOD: Record<OperatingMode, ModeMood> = {
  normal: { energy: 1, brightness: 1, tint: null },
  gaming: { energy: 1.5, brightness: 1.25, tint: "rgba(230,161,94,0.045)" },
  focus: { energy: 0.45, brightness: 0.6, tint: null },
  media: { energy: 0.7, brightness: 0.45, tint: "rgba(0,0,0,0.25)" },
  work: { energy: 0.8, brightness: 0.85, tint: "rgba(120,160,200,0.03)" },
};
