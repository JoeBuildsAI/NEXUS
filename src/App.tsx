import { useEffect, useState } from "react";
import { isDesktop, native, VIDEO_EXTENSIONS } from "@/core/native";
import { usePlayer } from "@/state/player";
import { useVideo } from "@/state/video";
import { useShortcuts } from "@/hooks/useShortcuts";
import { TitleBar } from "@/components/TitleBar";
import { Player } from "@/components/Player";
import { FolderPanel } from "@/components/FolderPanel";
import { EmptyState } from "@/components/EmptyState";

const isVideoPath = (p: string) => VIDEO_EXTENSIONS.includes(p.split(".").pop()?.toLowerCase() ?? "");

export function App() {
  const current = usePlayer((s) => s.current);
  const listing = usePlayer((s) => s.listing);
  const panelOpen = usePlayer((s) => s.panelOpen);
  const error = usePlayer((s) => s.error);
  const fullscreen = useVideo((s) => s.fullscreen);
  const [dropping, setDropping] = useState(false);
  useShortcuts();

  // Startup: a file passed by "Open with" wins; otherwise reopen the last video.
  useEffect(() => {
    void (async () => {
      const launched = await native.launchFile().catch(() => null);
      const last = usePlayer.getState().lastFile;
      if (launched) await usePlayer.getState().openFile(launched);
      else if (last && isDesktop && !(await usePlayer.getState().openFile(last))) usePlayer.getState().dismissError();
    })();
  }, []);

  // Drop a video (opens it) or a folder (opens its videos) anywhere on the window.
  useEffect(() => {
    if (!isDesktop) return;
    let off: (() => void) | undefined;
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview().onDragDropEvent((e) => {
        if (e.payload.type === "enter" || e.payload.type === "over") setDropping(true);
        else if (e.payload.type === "leave") setDropping(false);
        else if (e.payload.type === "drop") {
          setDropping(false);
          const path = e.payload.paths[0];
          if (!path) return;
          void (isVideoPath(path) ? usePlayer.getState().openFile(path) : usePlayer.getState().openFolder(path));
        }
      }).then((u) => { off = u; }),
    );
    return () => off?.();
  }, []);

  // Window title follows the playing video (taskbar / Alt+Tab).
  const name = listing?.videos.find((v) => v.path === current)?.name;
  useEffect(() => {
    if (isDesktop) void native.window().then((w) => w.setTitle(name ? `${name} — NEXUS` : "NEXUS")).catch(() => undefined);
  }, [name]);

  return (
    <div className="flex h-full flex-col bg-black">
      {!fullscreen && <TitleBar />}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {current ? <Player /> : <EmptyState />}
          {error && (
            <button onClick={() => usePlayer.getState().dismissError()} className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-red-950/90 px-4 py-2 text-[13px] text-red-100 shadow-lg">
              {error} <span className="ml-2 text-red-200/50">dismiss</span>
            </button>
          )}
        </main>
        {listing && panelOpen && !fullscreen && <FolderPanel />}
      </div>
      {dropping && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-white/30 bg-black/60 text-[15px] text-white/80">
          Drop to play
        </div>
      )}
    </div>
  );
}
