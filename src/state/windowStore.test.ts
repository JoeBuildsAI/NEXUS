import { describe, expect, it } from "vitest";
import { telemetryInterval } from "./windowStore";

describe("telemetry cadence", () => {
  it("polls fast only on System while NEXUS is in front", () => {
    expect(telemetryInterval({ active: true, gameRunning: false, gamingMode: false, screen: "system" })).toBe(1500);
    expect(telemetryInterval({ active: true, gameRunning: false, gamingMode: false, screen: "home" })).toBe(5000);
    expect(telemetryInterval({ active: false, gameRunning: false, gamingMode: false, screen: "system" })).toBe(10_000);
  });
  it("a running game or Gaming Mode always slows polling", () => {
    expect(telemetryInterval({ active: true, gameRunning: true, gamingMode: false, screen: "system" })).toBe(6000);
    expect(telemetryInterval({ active: true, gameRunning: false, gamingMode: true, screen: "system" })).toBe(6000);
  });
});
