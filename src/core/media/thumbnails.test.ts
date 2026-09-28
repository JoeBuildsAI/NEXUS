import { describe, expect, it } from "vitest";
import { withThumbnails } from "./thumbnails";
import type { MediaItem } from "@/core/types";

const item = (id: string, thumbnailUrl: string | null = null) => ({ id, title: id, thumbnailUrl, thumbnailColor: "#111" }) as unknown as MediaItem;

describe("library thumbnail overlay", () => {
  it("applies thumbnails generated after the list was loaded", () => {
    const [a, b, c] = withThumbnails([item("a"), item("b"), item("c", "http://asset.localhost/old.png")], { a: "http://asset.localhost/a.png", b: null });
    expect(a!.thumbnailUrl).toBe("http://asset.localhost/a.png");
    expect(b!.thumbnailUrl).toBeNull(); // no frame available → placeholder stays
    expect(c!.thumbnailUrl).toBe("http://asset.localhost/old.png");
  });

  it("keeps identity for unchanged items", () => {
    const items = [item("a")];
    expect(withThumbnails(items, {})[0]).toBe(items[0]);
  });
});
