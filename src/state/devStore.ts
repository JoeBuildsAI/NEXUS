import { create } from "zustand";

/**
 * Development-only simulation switches. Mock providers read these so the full
 * UI (offline states, pressure states, live events) can be exercised on the dev
 * laptop without real integrations. Not persisted; hidden in production builds.
 */
export interface DevSimulation {
  steamConnected: boolean;
  mediaConnected: boolean;
  emailConnected: boolean;
  telemetryAvailable: boolean;
  storagePressure: boolean;
  highCpu: boolean;
  highRam: boolean;
}

interface DevState extends DevSimulation {
  set: (patch: Partial<DevSimulation>) => void;
  /** Incrementing counters used to trigger one-shot demo events. */
  achievementPulse: number;
  emailPulse: number;
  triggerAchievement: () => void;
  triggerEmail: () => void;
}

export const useDevStore = create<DevState>((set) => ({
  steamConnected: true,
  mediaConnected: true,
  emailConnected: true,
  telemetryAvailable: true,
  storagePressure: false,
  highCpu: false,
  highRam: false,
  achievementPulse: 0,
  emailPulse: 0,
  set: (patch) => set(patch),
  triggerAchievement: () => set((s) => ({ achievementPulse: s.achievementPulse + 1 })),
  triggerEmail: () => set((s) => ({ emailPulse: s.emailPulse + 1 })),
}));

export const isDevBuild = import.meta.env.DEV;
