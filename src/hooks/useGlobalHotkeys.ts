import { useEffect } from "react";
import { useNavigationStore } from "@/state/navigationStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useSettingsStore } from "@/state/settingsStore";
import { config } from "@/core/config";

/**
 * Wires global keyboard shortcuts.
 *  - Ctrl+Space: command palette
 *  - Privacy hotkey (default Ctrl+Shift+`): activate privacy mode
 *
 * In-app listeners work in both browser dev and Tauri. When running under Tauri
 * the privacy hotkey is ALSO registered as an OS-level global shortcut so it
 * fires even when NEXUS is not focused.
 */
export function useGlobalHotkeys() {
  const togglePalette = useNavigationStore((s) => s.toggleCommandPalette);
  const activatePrivacy = usePrivacyStore((s) => s.activate);
  const privacyHotkey = useSettingsStore((s) => s.privacy.hotkey);

  // In-window listeners.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Command palette: Ctrl+Space
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        togglePalette();
        return;
      }
      // Privacy: Ctrl+Shift+Backquote (matches default accelerator)
      if (e.ctrlKey && e.shiftKey && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        activatePrivacy();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [togglePalette, activatePrivacy]);

  // OS-level global shortcut for privacy (Tauri only).
  useEffect(() => {
    if (!config.isTauri) return;
    let unregister: (() => void) | undefined;
    (async () => {
      try {
        const mod = await import("@tauri-apps/plugin-global-shortcut");
        await mod.register(privacyHotkey, () => activatePrivacy());
        unregister = () => void mod.unregister(privacyHotkey);
      } catch (err) {
        console.warn("[hotkeys] global shortcut registration failed", err);
      }
    })();
    return () => unregister?.();
  }, [privacyHotkey, activatePrivacy]);
}
