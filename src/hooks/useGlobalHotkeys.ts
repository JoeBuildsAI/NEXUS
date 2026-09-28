import { useEffect, useMemo } from "react";
import { SCREEN_ORDER, useNavigationStore } from "@/state/navigationStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useSettingsStore } from "@/state/settingsStore";
import { useConfirmStore } from "@/state/confirmStore";
import { useModeStore } from "@/state/modeStore";
import { useHotkeyStore } from "@/state/hotkeyStore";
import { notify } from "@/state/toastStore";
import { matchesAccelerator, parseAccelerator } from "@/lib/hotkeys";
import { config } from "@/core/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("hotkeys");

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global keyboard shortcuts.
 *  - Ctrl+Space          command palette (works even while typing)
 *  - privacy accelerator privacy mode (always; configurable)
 *  - Ctrl/Alt+1..6       screens (not while typing)
 *  - Esc                 closes palette / dialogs / preview / detail
 *
 * Under Tauri the privacy hotkey is also registered OS-wide so it fires when a
 * game or player has focus. Registration is verified on every window focus so a
 * collision or a lost registration after sleep is detected and reported.
 */
export function useGlobalHotkeys() {
  const togglePalette = useNavigationStore((s) => s.toggleCommandPalette);
  const activatePrivacy = usePrivacyStore((s) => s.activate);
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const privacyHotkey = useSettingsStore((s) => s.privacy.hotkey);
  const parsedPrivacy = useMemo(() => parseAccelerator(privacyHotkey), [privacyHotkey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "Space") {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (parsedPrivacy && matchesAccelerator(e, parsedPrivacy)) {
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
  }, [togglePalette, activatePrivacy, shortcuts, parsedPrivacy]);

  // OS-level global shortcut for privacy (Tauri only). The native layer owns the
  // registration (it survives WebView reloads) and emits an event; verified on focus.
  useEffect(() => {
    if (!config.isTauri) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    const hk = useHotkeyStore.getState();
    void import("@tauri-apps/api/event").then(({ listen }) => listen("nexus:privacy-hotkey", () => activatePrivacy("hotkey"))).then((u) => { if (disposed) u(); else unlisten = u; });

    const register = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("privacy_hotkey_set", { accelerator: privacyHotkey });
        if (!disposed) hk.set({ registered: true, error: null, accelerator: privacyHotkey });
      } catch (err) {
        const message = String((err as Error)?.message ?? err);
        log.warn("Privacy shortcut registration failed", { accelerator: privacyHotkey, error: message });
        if (!disposed) {
          const wasOk = useHotkeyStore.getState().registered;
          hk.set({ registered: false, error: message, accelerator: privacyHotkey });
          if (wasOk !== false) notify.warn("Privacy hotkey unavailable", "Another app may own this shortcut. Choose a different one in Settings → Privacy.");
        }
      }
    };
    void register();

    // Idempotent natively: re-confirms after sleep or a lost registration.
    const verify = () => void register();
    window.addEventListener("focus", verify);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("focus", verify);
    };
  }, [privacyHotkey, activatePrivacy]);
}
