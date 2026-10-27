import { Film, FolderOpen } from "lucide-react";
import { isDesktop, native } from "@/core/native";
import { usePlayer } from "@/state/player";

export async function pickAndOpenVideo() {
  const p = await native.pickVideo();
  if (p) await usePlayer.getState().openFile(p);
}

export function EmptyState() {
  const openFolder = usePlayer((s) => s.openFolder);
  const loading = usePlayer((s) => s.loading);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="text-[13px] font-semibold tracking-[0.5em] text-white/80">NEXUS</p>
        <p className="mt-3 text-[15px] text-white/45">Open a video. Loop any moment. Browse the folder it lives in.</p>
      </div>
      {isDesktop ? (
        <div className="flex gap-3">
          <button onClick={() => void pickAndOpenVideo()} disabled={loading} className="flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-[13px] font-medium text-black transition-colors hover:bg-white/85 disabled:opacity-50">
            <Film size={16} /> Open video
          </button>
          <button onClick={async () => { const p = await native.pickFolder(); if (p) void openFolder(p); }} disabled={loading} className="flex items-center gap-2 rounded-md bg-white/[0.08] px-5 py-2.5 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[0.14] disabled:opacity-50">
            <FolderOpen size={16} /> Open folder
          </button>
        </div>
      ) : (
        <p className="text-[13px] text-white/40">Run the desktop app (npm run tauri:dev) to open local videos.</p>
      )}
      <p className="text-[12px] text-white/30">or drop a video anywhere · Ctrl+O</p>
    </div>
  );
}
