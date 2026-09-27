import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Minus } from "lucide-react";
import { getProviders } from "@/providers";
import { native } from "@/providers/system/nativeBridge";
import { useMediaLibraryStore } from "@/state/mediaLibraryStore";
import { config } from "@/core/config";
import { cn } from "@/lib/utils";

export interface ScanLine {
  id: string;
  label: string;
  state: "pending" | "ok" | "none";
  detail: string;
}

/**
 * Controlled environment discovery for first run. Local detection only:
 * Windows/hardware via the native layer, Steam via registry + manifests, media
 * from previously authorized roots (never scans drives), email not configured.
 */
export function useEnvironmentScan(active: boolean): { lines: ScanLine[]; done: boolean } {
  const [lines, setLines] = useState<ScanLine[]>([
    { id: "windows", label: "Windows", state: "pending", detail: "" },
    { id: "steam", label: "Steam", state: "pending", detail: "" },
    { id: "gpu", label: "GPU", state: "pending", detail: "" },
    { id: "media", label: "Media", state: "pending", detail: "" },
    { id: "email", label: "Email", state: "pending", detail: "" },
  ]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const set = (id: string, patch: Partial<ScanLine>) => !cancelled && setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    (async () => {
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const hw = await native.hardware();
      await delay(350);
      set("windows", hw ? { state: "ok", detail: `${hw.osName} ${hw.osVersion}`.trim() } : { state: config.isTauri ? "none" : "ok", detail: config.isTauri ? "Could not read version" : "Browser preview" });

      await delay(300);
      try {
        const s = await getProviders().steam.getStatus?.();
        if (s?.detected) set("steam", { state: "ok", detail: `${s.installedGames} installed game${s.installedGames === 1 ? "" : "s"} · ${s.libraries} librar${s.libraries === 1 ? "y" : "ies"}` });
        else set("steam", { state: "none", detail: config.demoMode ? "Not detected · demo library available" : "Not detected" });
      } catch {
        set("steam", { state: "none", detail: "Not detected" });
      }

      await delay(300);
      const gpu = hw?.gpus[0];
      set("gpu", gpu?.name ? { state: "ok", detail: `${gpu.name}${gpu.vramTotalMb ? ` · ${Math.round(gpu.vramTotalMb / 1024)} GB` : ""}` } : { state: "none", detail: config.isTauri ? "No adapter reported" : "Unavailable in preview" });

      await delay(300);
      const roots = useMediaLibraryStore.getState().roots;
      set("media", roots.length ? { state: "ok", detail: `${roots.length} authorized location${roots.length === 1 ? "" : "s"}` } : { state: "none", detail: "Not configured" });

      await delay(250);
      set("email", { state: "none", detail: "Not configured" });
      if (!cancelled) setDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return { lines, done };
}

export function EnvironmentScanList({ lines }: { lines: ScanLine[] }) {
  return (
    <div className="mx-auto w-full max-w-sm space-y-3 text-left">
      {lines.map((l, i) => (
        <motion.div key={l.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-3">
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border", l.state === "ok" ? "border-status-nominal/50 bg-status-nominal/10 text-status-nominal" : l.state === "none" ? "border-white/10 text-white/30" : "border-white/20 text-white/50")}>
            {l.state === "pending" ? <Loader2 size={12} className="animate-spin" /> : l.state === "ok" ? <Check size={12} /> : <Minus size={12} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white/85">{l.label}</p>
            <p className="truncate text-xs text-white/40">{l.state === "pending" ? "Detecting…" : l.detail}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
