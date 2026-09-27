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
  /** Stress: synthesize a large Steam library (0 = demo set only). */
  steamLibrarySize: 0 | 500 | 1000;
  /** Stress: synthesize a large media index (0 = demo set only). */
  mediaLibrarySize: 0 | 1000 | 10000;
  /** Steam profile private: achievements unavailable but library fine. */
  steamPrivateProfile: boolean;
  /** Providers throw non-offline exceptions (chaos test). */
  providerExceptions: boolean;
  /** Extreme text: very long / Unicode / emoji titles. */
  extremeText: boolean;
  /** Demo media plays local synthetic fixture videos (dev only). */
  syntheticVideos: boolean;
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
  steamLibrarySize: 0,
  mediaLibrarySize: 0,
  steamPrivateProfile: false,
  providerExceptions: false,
  extremeText: false,
  syntheticVideos: false,
  achievementPulse: 0,
  emailPulse: 0,
  set: (patch) => set(patch),
  triggerAchievement: () => set((s) => ({ achievementPulse: s.achievementPulse + 1 })),
  triggerEmail: () => set((s) => ({ emailPulse: s.emailPulse + 1 })),
}));

export const isDevBuild = import.meta.env.DEV;
