import type { MediaItem } from "@/core/types";

/**
 * Overlay thumbnails generated after the item list was loaded. Items keep their
 * own URL when the store has none; a stored null (no frame available) keeps the
 * placeholder. Unchanged items keep their identity.
 */
export function withThumbnails(items: readonly MediaItem[], thumbs: Readonly<Record<string, string | null>>): readonly MediaItem[] {
  return items.map((i) => {
    const url = thumbs[i.id];
    return url && url !== i.thumbnailUrl ? { ...i, thumbnailUrl: url } : i;
  });
}
