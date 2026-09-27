import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useConfirmStore } from "@/state/confirmStore";
import { Button } from "./Button";
import { Panel } from "./Panel";

/** Global confirmation dialog. Mounted once at the app root. */
export function ConfirmDialog() {
  const { request, resolve } = useConfirmStore();

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-void-950/70 backdrop-blur-sm"
            onClick={() => resolve(false)}
          />
          <motion.div
            initial={{ scale: 0.94, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-md"
          >
            <Panel strong className="p-6">
              <div className="flex items-start gap-4">
                {request.danger && (
                  <span className="mt-0.5 text-status-critical">
                    <AlertTriangle size={22} />
                  </span>
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-white/95">
                    {request.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    {request.message}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => resolve(false)}>
                  {request.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={request.danger ? "danger" : "primary"}
                  onClick={() => resolve(true)}
                >
                  {request.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </Panel>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
