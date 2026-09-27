import type { GameDetails, MediaItem } from "@/core/types";
import { DEMO_GAMES } from "./games";
import { DEMO_MEDIA } from "./media";
import { generatedPalette } from "@/core/steam/artwork";

/**
 * Deterministic synthetic data for the developer simulation lab: large
 * libraries and hostile titles, so layout, virtualization and search can be
 * stressed without real integrations. Never used outside dev builds.
 */

const WORDS = ["Ashen", "Vector", "Hollow", "Nova", "Iron", "Signal", "Drift", "Halcyon", "Ember", "Meridian", "Cinder", "Orbit", "Quiet", "Sable", "Verge", "Lumen", "Rift", "Static", "Vale", "Zenith"];
const SUFFIX = ["Protocol", "Frontier", "Legacy", "Reckoning", "Odyssey", "Origins", "Requiem", "Ascension", "Horizon", "Chronicles", "Descent", "Genesis", "Remastered", "Definitive Edition", "II", "III", "IV", "Zero", "Online", "Ultimate"];
const EXTREME_TITLES = [
  "The Extraordinarily Long Title of a Game That Refuses to Fit Anywhere: Director's Cut — Complete Collector's Anniversary Edition",
  "ゼルダの伝説 ティアーズ オブ ザ キングダム",
  "Ведьмак 3: Дикая Охота — Издание «Игра года»",
  "🎮 Emoji Quest 🚀🔥 Deluxe ✨",
  "S.T.A.L.K.E.R. 2: Heart of Chornobyl",
  "ÆTHER // ÜBER-DRIVE (ß-Test)",
  "a",
  "                    ",
  "﷽﷽﷽ Wide Glyphs ﷽﷽﷽",
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function syntheticGames(count: number, extreme: boolean): GameDetails[] {
  const r = rng(42);
  const out: GameDetails[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const base = DEMO_GAMES[i % DEMO_GAMES.length]!;
    const title = extreme && i < EXTREME_TITLES.length ? EXTREME_TITLES[i]! : `${WORDS[Math.floor(r() * WORDS.length)]} ${SUFFIX[Math.floor(r() * SUFFIX.length)]} ${i + 1}`;
    const total = r() < 0.15 ? 0 : Math.floor(10 + r() * 60);
    const unlocked = total ? Math.floor(r() * (total + 1)) : 0;
    const pal = generatedPalette(title);
    const played = r() < 0.7;
    out.push({
      ...base,
      id: `syn-${i}`,
      steamAppId: 900000 + i,
      title: title.trim() || `Untitled ${i}`,
      installed: r() < 0.55,
      playtimeMinutes: played ? Math.floor(r() * 30000) : 0,
      lastPlayed: played ? now - Math.floor(r() * 400) * 86400_000 : null,
      installSizeBytes: Math.floor(r() * 120) * 1024 ** 3,
      coverUrl: null,
      heroUrl: null,
      coverColor: pal.cover,
      heroColor: pal.hero,
      achievements: {
        gameId: `syn-${i}`,
        total,
        unlocked,
        status: total ? "ok" : "no-achievements",
        achievements: Array.from({ length: total }, (_, k) => ({ id: `syn-${i}-a${k}`, name: `Achievement ${k + 1}`, description: "Synthetic", unlocked: k < unlocked, unlockedAt: k < unlocked ? now - k * 3600_000 : null, globalPercent: Math.round(5 + r() * 90), iconUrl: null, hidden: false })),
      },
    });
  }
  return out;
}

export function syntheticMedia(count: number, extreme: boolean): MediaItem[] {
  const r = rng(7);
  const out: MediaItem[] = [];
  const folders = ["Recordings", "Recordings\\2025", "Recordings\\2026", "Clips", "Clips\\Highlights", "Archive", "Archive\\Old"];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const base = DEMO_MEDIA[i % DEMO_MEDIA.length]!;
    const title = extreme && i < EXTREME_TITLES.length ? EXTREME_TITLES[i]! : `Session ${String(i + 1).padStart(5, "0")} — ${WORDS[Math.floor(r() * WORDS.length)]}`;
    out.push({
      ...base,
      id: `synm-${i}`,
      title: title.trim() || `Clip ${i}`,
      folder: folders[Math.floor(r() * folders.length)]!,
      durationSeconds: Math.floor(60 + r() * 7000),
      sizeBytes: Math.floor(r() * 6) * 1024 ** 3,
      addedAt: now - Math.floor(r() * 700) * 86400_000,
      favorite: r() < 0.05,
      collectionId: null,
      thumbnailUrl: null,
      thumbnailColor: generatedPalette(title).cover,
      available: r() > 0.02,
    });
  }
  return out;
}
