import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reveal-on-activity controls that fade after a period of pointer inactivity.
 * Used by the immersive video wall: moving the mouse (or touching a control)
 * reveals the overlay; after `hideAfterMs` of stillness it fades away again.
 * When `active` is false the controls are always visible (normal mode).
 */
export function useAutoHideControls(active: boolean, hideAfterMs = 2600) {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef(false);

  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const reveal = useCallback(() => {
    setVisible(true);
    clear();
    if (!active || holdRef.current) return;
    timer.current = setTimeout(() => setVisible(false), hideAfterMs);
  }, [active, hideAfterMs]);

  /** Keep controls up while the pointer is over them (or a menu is open). */
  const hold = useCallback((on: boolean) => {
    holdRef.current = on;
    if (on) { setVisible(true); clear(); }
    else reveal();
  }, [reveal]);

  useEffect(() => {
    if (!active) { setVisible(true); clear(); return; }
    reveal();
    return clear;
  }, [active, reveal]);

  return { visible: active ? visible : true, reveal, hold };
}
