import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import { usePrivacyStore } from "@/state/privacyStore";
import { Button } from "@/components/ui";

/**
 * Full-screen privacy veil. Rendered above everything. The activation itself is
 * synchronous (media already paused, navigation moved); this is only the visual
 * cover, which is why it renders instantly and animation is purely decorative.
 */
export function PrivacyVeil() {
  const active = usePrivacyStore((s) => s.active);
  const deactivate = usePrivacyStore((s) => s.deactivate);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-void-950"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="flex flex-col items-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
              <Lock size={26} className="text-white/50" />
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-cinematic text-white/40">
                Privacy Mode
              </p>
              <p className="mt-2 text-sm text-white/30">
                Workspace hidden. Content is paused.
              </p>
            </div>
            <Button variant="outline" onClick={deactivate}>
              Resume
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
