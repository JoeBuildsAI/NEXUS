import { Lock } from "lucide-react";
import { usePrivacyStore } from "@/state/privacyStore";
import { Button } from "@/components/ui";

/**
 * Privacy veil. Deliberately NOT animated on entry: the instant the store
 * flips, this opaque black layer is painted over everything in the same frame.
 * (Playback is already paused and navigation has already left Media.)
 */
export function PrivacyVeil() {
  const active = usePrivacyStore((s) => s.active);
  const deactivate = usePrivacyStore((s) => s.deactivate);
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-black" role="dialog" aria-label="Privacy mode">
      <Lock size={18} className="text-white/35" strokeWidth={1.6} />
      <p className="mt-6 text-micro tracking-cinematic text-white/45">Privacy mode</p>
      <p className="mt-2 text-sm text-white/25">Workspace hidden. Playback paused.</p>
      <Button variant="outline" size="sm" className="mt-8" onClick={deactivate} autoFocus>Resume</Button>
    </div>
  );
}
