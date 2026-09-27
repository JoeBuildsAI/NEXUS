import { describe, expect, it } from "vitest";
import { classifyProcess, isManageable } from "./processClassifier";

describe("classifyProcess", () => {
  it("classifies core Windows processes as system-critical", () => {
    for (const name of ["System", "csrss.exe", "lsass.exe", "explorer.exe", "svchost.exe"]) {
      expect(classifyProcess(name, "Microsoft")).toBe("system-critical");
    }
  });

  it("classifies security software as security", () => {
    expect(classifyProcess("MsMpEng.exe", "Microsoft Defender")).toBe("security");
  });

  it("classifies GPU/driver processes as driver", () => {
    expect(classifyProcess("nvcontainer.exe", "NVIDIA")).toBe("driver");
  });

  it("classifies peripheral vendor software as hardware", () => {
    expect(classifyProcess("RazerCentral.exe", "Razer")).toBe("hardware");
  });

  it("classifies well-known apps as user-application", () => {
    expect(classifyProcess("steam.exe", "Valve")).toBe("user-application");
    expect(classifyProcess("chrome.exe", "Google")).toBe("user-application");
  });

  it("falls back to unknown for unrecognized, publisher-less processes", () => {
    expect(classifyProcess("svc_helper_x.exe", null)).toBe("unknown");
    expect(classifyProcess("", null)).toBe("unknown");
  });

  it("SAFETY: never marks unknown or system-critical as manageable", () => {
    expect(isManageable("unknown")).toBe(false);
    expect(isManageable("system-critical")).toBe(false);
    expect(isManageable("driver")).toBe(false);
    expect(isManageable("security")).toBe(false);
    expect(isManageable("hardware")).toBe(false);
  });

  it("only user-application and optional are manageable", () => {
    expect(isManageable("user-application")).toBe(true);
    expect(isManageable("optional")).toBe(true);
  });
});
