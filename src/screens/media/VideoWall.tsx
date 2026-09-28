import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, Keyboard, Library, Link2, Maximize2, Minimize2, Pause, Play, Plus, Save, ShieldOff, Trash2, Volume2, VolumeX, Zap, Globe } from "lucide-react";
import { PlayerTile } from "./PlayerTile";
import { BrowserTile, normalizeUrl } from "./BrowserTile";
import { MediaPicker } from "./MediaPicker";
import { SavedWorkspaces } from "./SavedWorkspaces";
import { useMediaStore, WALL_MODES, SLOT_COUNT } from "@/state/mediaStore";
import { useSettingsStore } from "@/state/settingsStore";
import { usePrivacyStore } from "@/state/privacyStore";
import { useAutoHideControls } from "@/hooks/useAutoHideControls";
import { notify } from "@/state/toastStore";
import { requestConfirm } from "@/state/confirmStore";
import { optimizeLayout, type LayoutResult, type WallMode } from "@/core/media/layout";
import { nextLoopMode } from "@/core/media/loop";
import type { MediaItem } from "@/core/types";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Props {
  items: readonly MediaItem[];
  onOpenLibrary: () => void;
  onAuthorize: () => void;
  realMode: boolean;
}

/**
 * Adaptive video wall. Active players are positioned by the layout optimizer;
 * one quiet master bar; keyboard system for the active player.
 */
export function VideoWall({ items, onOpenLibrary, onAuthorize, realMode }: Props) {
  const store = useMediaStore();
  const { slots, mode, primaryIndex, focusIndex, activeIndex, syncPlayback, defaults, immersive, learnedAspects } = store;
  const controls = useAutoHideControls(immersive);
  const reducedMotion = useSettingsStore((s) => s.appearance.reducedMotion);
  const activatePrivacy = usePrivacyStore((s) => s.activate);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [aspects, setAspects] = useState<Record<number, number>>({});
  const videoEls = useRef<Record<number, HTMLVideoElement | null>>({});
  const prevLayoutId = useRef<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const active = useMemo(() => slots.filter((s) => (s.itemId && itemById.has(s.itemId)) || s.browser), [slots, itemById]);
  const loaded = active.length;
  const anyPlaying = active.some((s) => s.playing);
  const anyMuted = active.some((s) => s.muted);

  // Measure the wall.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setSize({ width: Math.floor(e.contentRect.width), height: Math.floor(e.contentRect.height) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track source aspect ratios from the registered elements (only when they change).
  const register = useCallback((index: number, el: HTMLVideoElement | null) => {
    videoEls.current[index] = el;
    if (!el) return;
    const update = () => {
      if (!el.videoWidth || !el.videoHeight) return;
      const ratio = el.videoWidth / el.videoHeight;
      setAspects((a) => (a[index] === ratio ? a : { ...a, [index]: ratio }));
      // Remember it so portrait/landscape content lays out correctly on re-open (no 16:9 flash).
      const itemId = useMediaStore.getState().slots[index]?.itemId;
      if (itemId) useMediaStore.getState().learnAspect(itemId, ratio);
    };
    el.addEventListener("loadedmetadata", update);
    update();
  }, []);

  const layout: LayoutResult = useMemo(() => {
    const result = optimizeLayout({
      width: size.width,
      height: size.height,
      players: active.map((s) => ({ index: s.index, aspect: s.browser ? s.browser.aspect : aspects[s.index] ?? (s.itemId ? learnedAspects[s.itemId] ?? null : null) })),
      primaryIndex,
      focusIndex: mode === "focus" ? (active.some((s) => s.index === focusIndex) ? focusIndex : active[0]?.index ?? null) : null,
      mode,
      gap: 4,
      minTile: { width: 160, height: 90 },
      previousId: prevLayoutId.current,
      fit: defaults.fit,
    });
    return result;
  }, [size, active, aspects, learnedAspects, primaryIndex, focusIndex, mode, defaults.fit]);
  useEffect(() => { prevLayoutId.current = layout.id; }, [layout.id]);

  // Keyboard system for the active player (Media screen only; never while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useMediaStore.getState();
      const idx = st.activeIndex ?? active[0]?.index ?? null;
      if (idx == null) return;
      const slot = st.slots[idx];
      if (!slot?.itemId) return;
      const v = videoEls.current[idx];
      const key = e.key.toLowerCase();
      let handled = true;
      switch (key) {
        case " ": st.setSlotPlaying(idx, !slot.playing); break;
        case "l": st.setSlotLoop(idx, nextLoopMode(slot.loop, slot.loopA != null && slot.loopB != null)); break;
        case "i": if (e.shiftKey) st.clearSegment(idx); else st.setLoopPoint(idx, "a", v?.currentTime ?? 0, v?.duration && Number.isFinite(v.duration) ? v.duration : null); break;
        case "o": if (e.shiftKey) st.clearSegment(idx); else st.setLoopPoint(idx, "b", v?.currentTime ?? 0, v?.duration && Number.isFinite(v.duration) ? v.duration : null); break;
        case "m": st.setSlotMuted(idx, !slot.muted); break;
        case "f": if (e.shiftKey) st.setMode(st.mode === "focus" ? "auto" : "focus"); else st.setSlotFit(idx, (slot.fit ?? st.defaults.fit) === "smart" ? "fit" : (slot.fit ?? st.defaults.fit) === "fit" ? "fill" : "smart"); if (e.shiftKey) st.setFocusIndex(idx); break;
        case "p": st.setPrimary(st.primaryIndex === idx ? null : idx); break;
        case "arrowleft": if (v) { v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 30 : 5)); } break;
        case "arrowright": if (v) { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + (e.shiftKey ? 30 : 5)); } break;
        case "arrowup": st.setSlotVolume(idx, Math.min(1, slot.volume + 0.1)); break;
        case "arrowdown": st.setSlotVolume(idx, Math.max(0, slot.volume - 0.1)); break;
        case "tab": {
          const order = active.map((s) => s.index);
          const pos = order.indexOf(idx);
          st.setActiveIndex(order[(pos + (e.shiftKey ? -1 : 1) + order.length) % order.length] ?? idx);
          break;
        }
        case "escape": if (st.mode === "focus") st.setMode("auto"); else st.setActiveIndex(null); break;
        case "delete": case "backspace": st.clearSlot(idx); break;
        case "?": setShowKeys((s) => !s); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Immersive: pointer reveals the overlay; Esc reveals it, then exits. Capture
  // phase so it owns Escape here without touching the privacy hotkey (global/native).
  useEffect(() => {
    if (!immersive) return;
    const onMove = () => controls.reveal();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (!controls.visible) controls.reveal();
      else useMediaStore.getState().setImmersive(false);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [immersive, controls]);

  const onClear = () => {
    if (loaded === 0) return;
    requestConfirm({ title: "Clear the wall?", message: "Unloads every player. Your files, presets and saved workspaces are untouched.", confirmLabel: "Clear", danger: true, onConfirm: () => { store.clearAll(); notify.neutral("Wall cleared"); } });
  };
  const addBrowserSurface = () => {
    const input = window.prompt("Web address for the browser surface (https)");
    if (input == null) return;
    const url = normalizeUrl(input);
    if (!url) { notify.warn("Not a web address", "Browser surfaces open https pages only."); return; }
    if (store.addBrowser(url) == null) notify.warn("Wall is full");
  };
  const positions = () => Object.fromEntries(Object.entries(videoEls.current).filter(([, v]) => v).map(([k, v]) => [Number(k), v!.currentTime]));
  const [dropHint, setDropHint] = useState(false);
  // Drag/drop from the library: only NEXUS item ids are accepted. File drops from
  // outside are ignored — authorization never expands because something was dragged in.
  const dragId = (e: React.DragEvent) => (e.dataTransfer.types.includes("application/x-nexus-media") ? e.dataTransfer.getData("application/x-nexus-media") : null);
  const onDragOver = (e: React.DragEvent) => { if (e.dataTransfer.types.includes("application/x-nexus-media")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDropHint(true); } };
  const onDrop = (e: React.DragEvent, replaceIndex?: number) => {
    setDropHint(false);
    const id = dragId(e);
    if (!id || !itemById.has(id)) return; // unknown / external → rejected
    e.preventDefault();
    e.stopPropagation();
    if (replaceIndex != null) { store.setSlotItem(replaceIndex, id); store.setActiveIndex(replaceIndex); return; }
    const added = store.addToWall(id);
    if (added == null) notify.warn("Wall is full", "Drop onto a player to replace it.");
  };

  // Empty wall: calm environment, not six dead rectangles.
  if (loaded === 0) {
    return (
      <div ref={containerRef} data-wall className={cn("flex h-full flex-col transition-colors", dropHint && "bg-white/[0.02]")} onDragOver={onDragOver} onDragLeave={() => setDropHint(false)} onDrop={(e) => onDrop(e)}>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-micro tracking-cinematic text-white/35">Private local workspace</p>
            <p className="mt-4 font-display text-display-md font-semibold uppercase tracking-wide text-white/85">Nothing on the wall</p>
            <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-white/40">Add a video and it takes the whole workspace. Add more and the wall arranges itself around them — up to six at once. You can also drag videos here from the Library.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" onClick={() => setPickerSlot(0)}><Plus size={15} /> Add video</Button>
              <Button variant="ghost" onClick={onOpenLibrary}><Library size={15} /> Library</Button>
              {realMode && <Button variant="ghost" onClick={onAuthorize}><FolderPlus size={15} /> Authorize folder</Button>}
              {store.savedLayouts.length > 0 && <Button variant="ghost" onClick={() => setShowSaved(true)}><Save size={15} /> Restore workspace</Button>}
            </div>
          </div>
        </div>
        {pickerSlot != null && <MediaPicker open items={items} onPick={(item) => { store.addToWall(item.id); setPickerSlot(null); }} onClose={() => setPickerSlot(null)} />}
        {showSaved && <SavedWorkspaces onClose={() => setShowSaved(false)} />}
      </div>
    );
  }

  return (
    <div className={cn("relative flex h-full flex-col", immersive ? "gap-0" : "gap-3")}>
      {/* Master bar — a fading translucent overlay in immersive mode, in-flow otherwise. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          immersive && "absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/85 via-black/45 to-transparent px-4 py-3 transition-opacity duration-300",
          immersive && !controls.visible && "pointer-events-none opacity-0",
        )}
        onMouseEnter={() => immersive && controls.hold(true)}
        onMouseLeave={() => immersive && controls.hold(false)}
      >
        <div className="flex items-center gap-1">
          <Ctl onClick={anyPlaying ? store.pauseAll : store.playAll} label={anyPlaying ? "Pause all" : "Play all"} primary>{anyPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}</Ctl>
          <Ctl onClick={() => store.muteAll(!anyMuted)} label={anyMuted ? "Unmute all" : "Mute all"}>{anyMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}</Ctl>
          <Ctl onClick={store.syncStart} label="Sync start — every player restarts together" disabled={loaded < 2}><Zap size={14} /></Ctl>
          <Ctl onClick={() => store.setSyncPlayback(!syncPlayback)} label="Sync playback (play, pause and seek mirror across players)" active={syncPlayback}><Link2 size={14} /></Ctl>
          <span className="ml-3 font-mono text-[11px] tabular text-white/30">{loaded} / {SLOT_COUNT}{syncPlayback ? " · synced" : ""}{primaryIndex != null ? ` · P${primaryIndex + 1} primary` : ""}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 text-[12.5px]">
            {WALL_MODES.map((m) => (
              <button key={m.id} onClick={() => store.setMode(m.id as WallMode)} className={cn("relative pb-1 transition-colors", mode === m.id ? "text-white" : "text-white/35 hover:text-white/70")}>
                {m.label}
                {mode === m.id && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
              </button>
            ))}
          </div>
          <span className="h-4 w-px bg-white/10" />
          {loaded < SLOT_COUNT && <Ctl onClick={() => setPickerSlot(slots.find((s) => !s.itemId && !s.browser)?.index ?? null)} label="Add video"><Plus size={14} /></Ctl>}
          {loaded < SLOT_COUNT && <Ctl onClick={addBrowserSurface} label="Add browser surface (isolated web page)"><Globe size={14} /></Ctl>}
          <Ctl onClick={() => setShowSaved(true)} label="Saved workspaces"><Save size={14} /></Ctl>
          <Ctl onClick={() => setShowKeys((v) => !v)} label="Keyboard shortcuts (?)" active={showKeys}><Keyboard size={14} /></Ctl>
          <Ctl onClick={() => store.toggleImmersive()} label={immersive ? "Exit immersive (Esc)" : "Immersive — edge to edge"} active={immersive}>{immersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</Ctl>
          <Ctl onClick={onClear} label="Clear wall"><Trash2 size={14} /></Ctl>
          <Ctl onClick={() => activatePrivacy("ui")} label="Privacy (Ctrl+Shift+`)"><ShieldOff size={14} /></Ctl>
        </div>
      </div>

      {/* The wall */}
      <div ref={containerRef} data-wall className={cn("relative min-h-0 flex-1 overflow-hidden bg-black", dropHint && "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]")} onMouseDown={(e) => { if (e.target === e.currentTarget) store.setActiveIndex(null); }} onMouseMove={immersive ? () => controls.reveal() : undefined} onDragOver={onDragOver} onDragLeave={() => setDropHint(false)} onDrop={(e) => onDrop(e)}>
        {size.width > 0 && layout.tiles.map((tile) => {
          const slot = slots[tile.index]!;
          if (slot.browser && !slot.itemId) return <BrowserTile key={slot.index} slot={slot} tile={tile} isPrimary={primaryIndex === slot.index} isActive={activeIndex === slot.index} onActivate={store.setActiveIndex} />;
          const item = itemById.get(slot.itemId!)!;
          return (
            <PlayerTile
              key={slot.index}
              slot={slot}
              item={item}
              tile={tile}
              isPrimary={primaryIndex === slot.index}
              isActive={activeIndex === slot.index}
              fitDefault={defaults.fit}
              reducedMotion={reducedMotion}
              onAssign={setPickerSlot}
              onActivate={store.setActiveIndex}
              register={register}
              onDropItem={(e) => onDrop(e, slot.index)}
            />
          );
        })}
        {showKeys && <KeyHelp onClose={() => setShowKeys(false)} />}
      </div>

      {pickerSlot != null && <MediaPicker open items={items} onPick={(item) => { store.setSlotItem(pickerSlot, item.id); store.setActiveIndex(pickerSlot); setPickerSlot(null); }} onClose={() => setPickerSlot(null)} />}
      {showSaved && <SavedWorkspaces onClose={() => setShowSaved(false)} positions={positions} />}
    </div>
  );
}

function Ctl({ children, onClick, label, disabled, active, primary }: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean; active?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cn("flex h-8 w-8 items-center justify-center rounded-sm transition-colors disabled:opacity-30", primary ? "bg-white/90 text-black hover:bg-white" : active ? "text-white" : "text-white/50 hover:bg-white/[0.06] hover:text-white")}>
      {children}
    </button>
  );
}

const KEYS: [string, string][] = [
  ["Space", "Play / pause"], ["L", "Cycle loop: off · full · A–B"], ["I / O", "Set loop in / out at playhead"], ["Shift+I / O", "Clear segment"],
  ["F", "Cycle fit: smart · fit · fill"], ["Shift+F", "Focus the active player"], ["P", "Toggle primary"], ["M", "Mute"],
  ["← / →", "Seek 5 s (Shift: 30 s)"], ["↑ / ↓", "Volume"], ["Tab", "Next player"], ["Delete", "Remove player"], ["Esc", "Leave focus / deselect"],
];

function KeyHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="glass-strong absolute right-3 top-3 z-20 w-80 rounded-md p-4" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <p className="text-micro text-white/45">Keyboard · active player</p>
        <button onClick={onClose} className="text-white/35 hover:text-white" aria-label="Close">×</button>
      </div>
      <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-1.5 text-[12.5px]">
        {KEYS.map(([k, v]) => (<><dt key={`${k}-k`} className="font-mono text-[11px] text-white/70">{k}</dt><dd key={`${k}-v`} className="text-white/50">{v}</dd></>))}
      </dl>
      <p className="mt-3 text-[11px] text-white/30">Click a player to make it active. Ctrl+Space and the privacy hotkey are never affected.</p>
    </div>
  );
}
