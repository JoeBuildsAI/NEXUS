import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui";
import { getProviders } from "@/providers";
import type { XboxInventory } from "@/providers/xbox/XboxGameProvider";
import { useLibraryStore } from "@/state/libraryStore";
import { config } from "@/core/config";

/** Xbox / Microsoft Store PC games: local discovery status and truthful capabilities. */
export function XboxPanel() {
  const [inv, setInv] = useState<XboxInventory | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (force = false) => { setBusy(true); setInv(await getProviders().xbox.inventory(force)); setBusy(false); };
  useEffect(() => { void load(); }, []);
  if (!config.isTauri) {
    return (
      <div className="py-5">
        <p className="flex items-center gap-2 text-[15px] text-white/85"><Gamepad2 size={15} className="text-white/40" /> Xbox · Microsoft Store</p>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">Xbox PC games are discovered in the desktop build from their local install manifests.</p>
      </div>
    );
  }
  return (
    <div className="py-5">
      <div className="flex items-baseline justify-between gap-6">
        <p className="flex items-center gap-2 text-[15px] text-white/85"><Gamepad2 size={15} className="text-white/40" /> Xbox · Microsoft Store</p>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load(true).then(() => useLibraryStore.getState().load({ force: true }))}>Rescan</Button>
      </div>
      <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/40">
        {inv == null ? "Checking…" : `${inv.xboxAppInstalled ? "Xbox app installed" : "Xbox app not detected"} · ${inv.roots.length ? `${inv.roots.length} install root${inv.roots.length === 1 ? "" : "s"}` : "no XboxGames folder on any drive"} · ${inv.games.length} game${inv.games.length === 1 ? "" : "s"} discovered`}
      </p>
      {inv && inv.roots.length > 0 && <p className="mt-1 font-mono text-[11.5px] text-white/30" data-selectable="true">{inv.roots.join("  ")}</p>}
      <p className="mt-3 text-[12.5px] text-white/35">Discovery, launch and artwork come from the games' own manifests on this PC. {inv?.capabilities.reason ?? "Playtime and achievements are unavailable without Xbox Live access."}</p>
    </div>
  );
}
