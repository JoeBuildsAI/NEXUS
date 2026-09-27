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
    expect(classifyProcess("chrome.exe", "Google")).toBe("user-application");
    expect(classifyProcess("Discord.exe", null, "C:\\Users\\u\\AppData\\Local\\Discord\\app-1.0\\Discord.exe")).toBe("user-application");
  });

  it("real gaming PC: platforms, anti-cheat, hardware, input, security and Windows packages stay protected", () => {
    const cases: [string, string | null, string][] = [
      ["steam.exe", null, "platform"],
      ["steamwebhelper.exe", "C:\\Program Files (x86)\\Steam\\bin\\cef\\cef.win7x64\\steamwebhelper.exe", "platform"],
      ["gamingservices.exe", null, "platform"],
      ["XboxPcApp.exe", "C:\\Program Files\\WindowsApps\\Microsoft.GamingApp_2609.1001.16.0_x64__8wekyb3d8bbwe\\XboxPcApp.exe", "platform"],
      ["vgtray.exe", "C:\\Program Files\\Riot Vanguard\\vgtray.exe", "platform"],
      ["vgc.exe", null, "platform"],
      ["RiotClientServices.exe", "C:\\Riot Games\\Riot Client\\RiotClientServices.exe", "platform"],
      ["MicrosoftSecurityApp.exe", "C:\\Program Files\\WindowsApps\\Microsoft.6365217CE6EB4_102_x64__8wekyb3d8bbwe\\MicrosoftSecurityApp\\MicrosoftSecurityApp.exe", "security"],
      ["GameInputRedistService.exe", "C:\\Program Files\\Microsoft GameInput\\x64\\GameInputRedistService.exe", "hardware"],
      ["ArmouryCrate.exe", "C:\\Program Files\\WindowsApps\\B9ECED6F.ArmouryCrate_6.5.14.0_x64__qmba6cd70vzyy\\ArmouryCrate.exe", "hardware"],
      ["asus_framework.exe", "C:\\Program Files (x86)\\ASUS\\ArmouryDevice\\asus_framework.exe", "hardware"],
      ["LGMonitorAppManager.exe", "C:\\Program Files\\WindowsApps\\LGElectronics.LGMonitorApp_1.2606.1601.0_x86__cfnzzhwkr8z5w\\LGMonitorAppManager\\LGMonitorAppManager.exe", "hardware"],
      ["NahimicService.exe", null, "hardware"],
      ["ROGLiveService.exe", null, "hardware"],
      ["lghub_agent.exe", "C:\\Program Files\\LGHUB\\lghub_agent.exe", "hardware"],
      ["msedgewebview2.exe", "C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application\\153.0\\msedgewebview2.exe", "system-critical"],
      ["WidgetBoard.exe", "C:\\Program Files\\WindowsApps\\MicrosoftWindows.Client.WebExperience_526.0_x64__cw5n1h2txyewy\\WidgetBoard.exe", "system-critical"],
      ["StartMenuExperienceHost.exe", "C:\\WINDOWS\\SystemApps\\Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy\\StartMenuExperienceHost.exe", "system-critical"],
      ["audiodg.exe", null, "system-critical"],
    ];
    for (const [name, path, expected] of cases) {
      const cls = classifyProcess(name, null, path);
      expect(cls, name).toBe(expected);
      expect(isManageable(cls), name).toBe(false);
    }
  });

  it("a Steam game's own executable is not labeled as the platform", () => {
    expect(classifyProcess("SomeGame.exe", null, "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Some Game\\SomeGame.exe")).not.toBe("platform");
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
  });
  it("SAFETY: the shared WebView2 runtime is never manageable (closing it by name would close NEXUS itself)", () => {
    const cls = classifyProcess("msedgewebview2.exe", null, w("C:", "Program Files (x86)", "Microsoft", "EdgeWebView", "Application", "140.0", "msedgewebview2.exe"));
    expect(isManageable(cls)).toBe(false);
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
