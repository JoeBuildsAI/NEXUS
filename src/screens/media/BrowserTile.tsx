import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Maximize2, RotateCw, Star, X } from "lucide-react";
import type { Tile } from "@/core/media/layout";
import type { PlayerSlot } from "@/core/types";
import { useMediaStore } from "@/state/mediaStore";
import { openExternal } from "@/lib/openExternal";
import { cn } from "@/lib/utils";

/**
 * BROWSER media surface — an isolated, sandboxed iframe on the wall.
 * The page is untrusted: it never receives Tauri IPC (remote origins are not
 * in any capability), cannot escape the sandbox, gets no referrer, and cannot
 * reach files, media authorization, mail or process control. Sites that
 * refuse embedding stay blank; NEXUS says so and offers to open them
 * externally instead of working around it.
 */
export function BrowserTile({ slot, tile, isPrimary, isActive, onActivate }: { slot: PlayerSlot; tile: Tile; isPrimary: boolean; isActive: boolean; onActivate: (i: number) => void }) {
  const { setBrowserUrl, setBrowserAspect, clearSlot, setPrimary, setMode, setFocusIndex } = useMediaStore();
  const url = slot.browser?.url ?? "";
  const [draft, setDraft] = useState(url);
  const [history, setHistory] = useState<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] });
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => { setDraft(url); setLoaded(false); }, [url]);

  const go = (next: string, record = true) => {
    const clean = normalizeUrl(next);
    if (!clean) return;
    if (record && url && clean !== url) setHistory((h) => ({ back: [...h.back, url].slice(-30), fwd: [] }));
    setBrowserUrl(slot.index, clean);
  };
  const back = () => { const prev = history.back.at(-1); if (!prev) return; setHistory((h) => ({ back: h.back.slice(0, -1), fwd: [url, ...h.fwd] })); setBrowserUrl(slot.index, prev); };
  const fwd = () => { const next = history.fwd[0]; if (!next) return; setHistory((h) => ({ back: [...h.back, url], fwd: h.fwd.slice(1) })); setBrowserUrl(slot.index, next); };
  const compact = tile.width < 420;
  const host = (() => { try { return new URL(url).host; } catch { return ""; } })();

  return (
    <div
      className={cn("absolute overflow-hidden bg-black", isActive ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]")}
      style={{ left: tile.x, top: tile.y, width: tile.width, height: tile.height }}
      onMouseDown={() => onActivate(slot.index)}
      data-player={slot.index}
      data-surface="browser"
    >
      <div className="flex h-9 items-center gap-2 bg-black/90 px-2">
        <Globe size={12} className="shrink-0 text-white/35" />
        <button onClick={back} disabled={!history.back.length} className="text-white/45 hover:text-white disabled:opacity-25" aria-label="Back"><ArrowLeft size={13} /></button>
        <button onClick={fwd} disabled={!history.fwd.length} className="text-white/45 hover:text-white disabled:opacity-25" aria-label="Forward"><ArrowRight size={13} /></button>
        <button onClick={() => { setLoaded(false); setNonce((n) => n + 1); }} className="text-white/45 hover:text-white" aria-label="Reload"><RotateCw size={12} /></button>
        <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} placeholder="https://" spellCheck={false} aria-label="Address" className="h-6 w-full rounded-sm bg-white/[0.05] px-2 font-mono text-[11.5px] text-white/85 placeholder:text-white/25 focus:bg-white/[0.09] focus:outline-none" />
        </form>
        {!compact && (
          <select value={String(slot.browser?.aspect ?? 16 / 9)} onChange={(e) => setBrowserAspect(slot.index, Number(e.target.value))} className="bg-transparent font-mono text-[10.5px] text-white/45 [color-scheme:dark] focus:outline-none" aria-label="Aspect ratio">
            <option value={String(16 / 9)}>16:9</option>
            <option value={String(4 / 3)}>4:3</option>
            <option value="1">1:1</option>
            <option value={String(9 / 16)}>9:16</option>
            <option value={String(21 / 9)}>21:9</option>
          </select>
        )}
        <button onClick={() => void openExternal(url)} disabled={!url} className="text-white/45 hover:text-white disabled:opacity-25" aria-label="Open in your browser" title="Open in your browser"><ExternalLink size={12} /></button>
        <button onClick={() => setPrimary(isPrimary ? null : slot.index)} className={cn("hover:text-white", isPrimary ? "text-white" : "text-white/45")} aria-label="Primary" title="Primary"><Star size={12} className={isPrimary ? "fill-white" : ""} /></button>
        <button onClick={() => { setFocusIndex(slot.index); setMode("focus"); }} className="text-white/45 hover:text-white" aria-label="Focus" title="Focus"><Maximize2 size={12} /></button>
        <button onClick={() => clearSlot(slot.index)} className="text-white/45 hover:text-white" aria-label="Remove surface"><X size={13} /></button>
      </div>
      <div className="relative h-[calc(100%-36px)] w-full bg-[#050505]">
        {url ? (
          <>
            <iframe
              key={`${url}#${nonce}`}
              ref={frame}
              src={url}
              title={host || "Browser surface"}
              sandbox="allow-scripts allow-same-origin allow-forms"
              referrerPolicy="no-referrer"
              allow="autoplay; fullscreen"
              className="h-full w-full border-0 bg-white"
              onLoad={() => setLoaded(true)}
            />
            {!loaded && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#050505]"><span className="text-micro text-white/35">Loading {host}</span></div>}
            {loaded && <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-white/0 transition-colors group-hover:text-white/25">Blank? The site refuses embedding — use ↗ to open it in your browser.</p>}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-micro text-white/35">Browser surface</p>
            <p className="max-w-xs text-[12.5px] leading-relaxed text-white/40">Enter an address above. Pages run isolated — no access to your files, media, mail or NEXUS itself. Sites decide whether they allow embedding; NEXUS never works around that, and audio follows the page's own controls.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** https only; strips credentials; rejects anything that is not a web page. */
export function normalizeUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (u.protocol === "http:") u.protocol = "https:";
    return u.toString();
  } catch {
    return null;
  }
}
