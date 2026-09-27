import { useEffect, useState } from "react";
import { native, type HardwareInventory } from "@/providers/system/nativeBridge";

let cache: HardwareInventory | null | undefined;
let inflight: Promise<HardwareInventory | null> | null = null;

/** Cached hardware inventory (desktop only; null in browser preview). */
export function useHardware(): HardwareInventory | null {
  const [hw, setHw] = useState<HardwareInventory | null>(cache ?? null);
  useEffect(() => {
    if (cache !== undefined) return;
    inflight ??= native.hardware().then((v) => {
      cache = v;
      return v;
    });
    let cancelled = false;
    void inflight.then((v) => !cancelled && setHw(v));
    return () => {
      cancelled = true;
    };
  }, []);
  return hw;
}
