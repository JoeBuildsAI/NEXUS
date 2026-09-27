import { useEffect, useRef } from "react";
import { getProviders } from "@/providers";
import { useSettingsStore } from "@/state/settingsStore";
import { useModeStore } from "@/state/modeStore";
import type { MediaItem } from "@/core/types";

const CONCURRENCY = 2;

/**
 * Requests local thumbnails for the given (visible) items, a couple at a time,
 * only when the setting is on and no game session is running. Results land in
 * the media library store; items re-render with `thumbnailUrl`.
 */
export function useThumbnails(items: readonly MediaItem[]) {
  const enabled = useSettingsStore((s) => s.media.thumbnails);
  const gameRunning = useModeStore((s) => s.gameRunning);
  const queueRef = useRef<Set<string>>(new Set());
  const activeRef = useRef(0);

  useEffect(() => {
    if (!enabled || gameRunning) return;
    const provider = getProviders().media;
    if (!provider.ensureThumbnail) return;
    let cancelled = false;
    const inflight = queueRef.current;
    const pending = items.filter((i) => i.rootId && i.thumbnailUrl == null && i.available !== false && !inflight.has(i.id)).map((i) => i.id);
    for (const id of pending) inflight.add(id);
    const queue = [...pending];
    const pump = async () => {
      while (!cancelled && queue.length && activeRef.current < CONCURRENCY) {
        const id = queue.shift()!;
        activeRef.current++;
        void provider.ensureThumbnail!(id).finally(() => {
          activeRef.current--;
          inflight.delete(id);
          if (!cancelled) void pump();
        });
      }
    };
    void pump();
    return () => {
      cancelled = true;
      for (const id of queue) inflight.delete(id);
    };
  }, [items, enabled, gameRunning]);
}
