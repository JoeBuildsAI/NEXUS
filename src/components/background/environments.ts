import type { EnvironmentPreset } from "@/state/settingsStore";
import type { OperatingMode } from "@/core/types";

export interface EnvironmentSpec {
  readonly label: string;
  readonly description: string;
  /** Base radial gradient stops (top glow → base). All presets resolve to black. */
  readonly base: readonly [string, string, string];
  /** Light field colors (rgba, very low alpha). */
  readonly lights: readonly string[];
  readonly particleColor: readonly [number, number, number];
  /** Baseline particle density multiplier. */
  readonly density: number;
  /** Baseline drift speed multiplier. */
  readonly speed: number;
  readonly grid: boolean;
  readonly noise: boolean;
}

/**
 * BLACK IS THE INTERFACE. Every preset bottoms out at #000; light fields are
 * faint enough that content — not the background — carries the composition.
 */
export const ENVIRONMENTS: Record<EnvironmentPreset, EnvironmentSpec> = {
  nexus: {
    label: "NEXUS",
    description: "Near-black with a cool, barely-there platinum haze. The signature.",
    base: ["rgba(26,30,36,0.55)", "rgba(4,4,5,0.95)", "#000000"],
    lights: ["rgba(140,160,180,0.05)", "rgba(90,100,130,0.045)", "rgba(60,80,100,0.035)"],
    particleColor: [200, 210, 220],
    density: 0.7,
    speed: 0.8,
    grid: true,
    noise: true,
  },
  void: {
    label: "VOID",
    description: "Absolute black. No haze, no grid. Content alone.",
    base: ["rgba(8,8,9,0.6)", "rgba(2,2,2,0.98)", "#000000"],
    lights: ["rgba(40,40,46,0.04)"],
    particleColor: [190, 190, 200],
    density: 0.25,
    speed: 0.5,
    grid: false,
    noise: true,
  },
  aurora: {
    label: "AURORA",
    description: "Slow, deep drifts of teal and violet — very low key.",
    base: ["rgba(18,40,44,0.5)", "rgba(4,5,8,0.95)", "#000000"],
    lights: ["rgba(64,190,170,0.06)", "rgba(120,80,200,0.055)", "rgba(50,150,110,0.04)", "rgba(80,120,220,0.04)"],
    particleColor: [170, 220, 210],
    density: 0.7,
    speed: 1.1,
    grid: false,
    noise: true,
  },
  neural: {
    label: "NEURAL",
    description: "Faint nodes and links — instrumentation at rest.",
    base: ["rgba(24,26,40,0.5)", "rgba(4,4,8,0.95)", "#000000"],
    lights: ["rgba(110,110,200,0.05)", "rgba(80,140,220,0.04)"],
    particleColor: [190, 190, 230],
    density: 0.95,
    speed: 0.7,
    grid: true,
    noise: false,
  },
  minimal: {
    label: "MINIMAL",
    description: "Clean gradient. No particles, no grid.",
    base: ["rgba(14,16,20,0.55)", "rgba(4,4,5,0.97)", "#000000"],
    lights: ["rgba(90,110,130,0.035)"],
    particleColor: [200, 205, 210],
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
  gaming: { energy: 1.4, brightness: 1.15, tint: "rgba(217,160,102,0.025)" },
  focus: { energy: 0.4, brightness: 0.5, tint: null },
  // Media: the environment nearly disappears; content is the light source.
  media: { energy: 0.3, brightness: 0.12, tint: "rgba(0,0,0,0.45)" },
  work: { energy: 0.75, brightness: 0.8, tint: null },
};
