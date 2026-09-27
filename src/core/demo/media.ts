import type { MediaCollection, MediaItem } from "@/core/types";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

/**
 * Demo media library. Uses public sample videos so the six-player workspace is
 * fully functional on the dev laptop. Real media is loaded via authorized roots
 * through the LocalMediaProvider and is never shipped in the repo.
 */
const SAMPLE_SOURCES = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
];

const COLORS = ["#2a3d5c", "#5c2a3d", "#2a5c46", "#5c522a", "#452a5c", "#2a545c", "#5c2a2a", "#3d5c2a"];

const TITLES = [
  "Coastal Drone Footage",
  "Studio Session — Take 3",
  "Mountain Trail 4K",
  "City Timelapse",
  "Interview Master",
  "Workshop B-Roll",
  "Concert Multicam A",
  "Concert Multicam B",
  "Aerial Reel",
  "Product Shoot Raw",
  "Rehearsal Full",
  "Highlight Cut",
];

export const DEMO_COLLECTIONS: readonly MediaCollection[] = [
  { id: "col-recent", name: "Recent Imports", itemCount: 5 },
  { id: "col-projects", name: "Active Projects", itemCount: 4 },
  { id: "col-archive", name: "Archive", itemCount: 3 },
];

export const DEMO_MEDIA: readonly MediaItem[] = TITLES.map((title, i) => ({
  id: `media-${i}`,
  title,
  durationSeconds: 60 + ((i * 37) % 540),
  src: SAMPLE_SOURCES[i % SAMPLE_SOURCES.length]!,
  thumbnailColor: COLORS[i % COLORS.length]!,
  thumbnailUrl: null,
  addedAt: now - i * 2 * day,
  collectionId:
    i < 5 ? "col-recent" : i < 9 ? "col-projects" : "col-archive",
  favorite: i % 4 === 0,
  // All demo media is treated as private to exercise privacy behavior.
  private: true,
}));
