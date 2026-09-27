import { useEffect } from "react";
import { SCREEN_ORDER, useNavigationStore } from "@/state/navigationStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useConfirmStore } from "@/state/confirmStore";
import { useModeStore } from "@/state/modeStore";
import { config } from "@/core/config";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global keyboard shortcuts.
 *  - Ctrl+Space          command palette (works even while typing)
 *  - Ctrl+Shift+`        privacy mode (always)
 *  - Ctrl/Alt+1..5       screens (not while typing)
 *  - Esc                 closes palette / dialogs / preview
 *
 * Under Tauri the privacy hotkey is also registered OS-wide so it fires when
 * NEXUS is not focused.
 */
export function useGlobalHotkeys() {
  const togglePalette = useNavigationStore((s) => s.toggleCommandPalette);
  const activatePrivacy = usePrivacyStore((s) => s.activate);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const privacyHotkey = useSettingsStore((s) => s.privacy.hotkey);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "Space") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "`" || e.key === "~" || e.code === "Backquote")) {
        e.preventDefault();
        activatePrivacy("hotkey");
        return;
      }
      if (e.key === "Escape") {
        const nav = useNavigationStore.getState();
        const confirm = useConfirmStore.getState();
        const modes = useModeStore.getState();
        const privacy = usePrivacyStore.getState();
        if (nav.commandPaletteOpen) nav.closeCommandPalette();
        else if (confirm.request) confirm.resolve(false);
        else if (modes.preview) modes.cancelPreview();
        else if (privacy.active) privacy.deactivate();
        else if (nav.selectedGameId) nav.selectGame(null);
        return;
      }
      if (!shortcuts.screenShortcutsEnabled || isTypingTarget(e.target)) return;
      const mod = shortcuts.screenPrefix === "ctrl" ? e.ctrlKey && !e.altKey : e.altKey && !e.ctrlKey;
      if (mod && !e.shiftKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        const nav = useNavigationStore.getState();
        if (idx === 5) nav.navigate("settings");
        else {
          const screen = SCREEN_ORDER[idx];
          if (screen) nav.navigate(screen);
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [togglePalette, activatePrivacy, shortcuts]);

  // OS-level global shortcut for privacy (Tauri only).
  useEffect(() => {
    if (!config.isTauri) return;
    let unregister: (() => void) | undefined;
    (async () => {
      try {
        const mod = await import("@tauri-apps/plugin-global-shortcut");
        if (await mod.isRegistered(privacyHotkey)) await mod.unregister(privacyHotkey);
        await mod.register(privacyHotkey, (ev) => {
          if (ev.state === "Pressed") activatePrivacy("hotkey");
        });
        unregister = () => void mod.unregister(privacyHotkey);
      } catch (err) {
        console.warn("[hotkeys] global shortcut registration failed", err);
      }
    })();
    return () => unregister?.();
  }, [privacyHotkey, activatePrivacy]);
}
