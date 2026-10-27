import { useEffect, useState } from "react";
import { native } from "@/core/native";
import { usePlayer } from "@/state/player";

/** At most a few Shell thumbnail renders at once so scrolling stays smooth. */
const CONCURRENCY = 3;
const queue: string[] = [];
const inFlight = new Set<string>();
let active = 0;

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const path = queue.shift()!;
    active++;
    native
      .thumbnail(path)
      .then((file) => (file ? native.assetUrl(file) : null))
      .catch(() => null)
      .then((url) => usePlayer.getState().setThumb(path, url))
      .finally(() => {
        active--;
        inFlight.delete(path);
        pump();
      });
  }
}

function request(path: string) {
  if (inFlight.has(path) || path in usePlayer.getState().thumbs) return;
  inFlight.add(path);
  queue.push(path);
  pump();
}

/**
 * Thumbnail URL for a video once its tile scrolls into view. `undefined` while
 * pending, `null` when Windows has no frame for it (placeholder shown).
 */
export function useThumbnail(path: string, node: HTMLElement | null): string | null | undefined {
  const url = usePlayer((s) => s.thumbs[path]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!node || visible) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    }, { rootMargin: "300px" });
    io.observe(node);
    return () => io.disconnect();
  }, [node, visible]);

  useEffect(() => {
    if (visible) request(path);
  }, [visible, path]);

  return url;
}
