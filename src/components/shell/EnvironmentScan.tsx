import { motion } from "framer-motion";
import { Check, Loader2, Minus } from "lucide-react";
import type { ScanLine } from "@/hooks/useEnvironmentScan";
import { cn } from "@/lib/utils";

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
