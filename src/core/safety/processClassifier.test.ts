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

describe("path-aware classification", () => {
  const S = String.fromCharCode(92);
  const w = (...parts: string[]) => parts.join(S);
  it("treats executables inside the Windows directory as protected Windows components", () => {
    expect(classifyProcess("SearchHost.exe", null, w("C:", "Windows", "SystemApps", "Microsoft.Windows.Search_cw5n1h2txyewy", "SearchHost.exe"))).not.toBe("user-application");
    expect(classifyProcess("wermgr.exe", null, w("C:", "Windows", "System32", "wermgr.exe"))).toBe("system-critical");
  });
  it("recognizes installed applications by location, even with an unknown publisher", () => {
    expect(classifyProcess("Devin.exe", null, w("C:", "Users", "j", "AppData", "Local", "Programs", "Devin", "Devin.exe"))).toBe("user-application");
    expect(classifyProcess("EpicGamesLauncher.exe", null, w("C:", "Program Files (x86)", "Epic Games", "Launcher", "Portal", "Binaries", "Win64", "EpicGamesLauncher.exe"))).toBe("user-application");
    expect(classifyProcess("msedgewebview2.exe", null, w("C:", "Program Files (x86)", "Microsoft", "EdgeWebView", "Application", "140.0", "msedgewebview2.exe"))).toBe("user-application");
  });
  it("keeps security and driver vendors protected regardless of location", () => {
    expect(classifyProcess("mbam.exe", null, w("C:", "Program Files", "Malwarebytes", "Anti-Malware", "mbam.exe"))).toBe("security");
    expect(classifyProcess("NVDisplay.Container.exe", null, w("C:", "Program Files", "NVIDIA Corporation", "Display.NvContainer", "NVDisplay.Container.exe"))).toBe("driver");
  });
  it("still returns unknown without a usable path or publisher", () => {
    expect(classifyProcess("mystery.exe", null, null)).toBe("unknown");
    expect(classifyProcess("mystery.exe", null, w("D:", "tools", "mystery.exe"))).toBe("unknown");
  });
});
