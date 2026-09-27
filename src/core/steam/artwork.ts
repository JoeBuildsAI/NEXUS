/**
 * Artwork strategy for Steam games.
 *  1. Steam's local library cache (offline, no network) when the native layer
 *     reports it — served through the asset protocol.
 *  2. Steam's public CDN (legitimate, unauthenticated static assets); the
 *     WebView caches these on disk.
 *  3. Generated fallback artwork from the title (always available).
 * Nothing is committed to the repo and rendering never blocks on artwork.
 */
export interface ArtworkSet {
  cover: string | null;
  hero: string | null;
  header: string | null;
  icon: string | null;
}

const CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps";

export function steamCdnArtwork(appId: number): ArtworkSet {
  return {
    cover: `${CDN}/${appId}/library_600x900.jpg`,
    hero: `${CDN}/${appId}/library_hero.jpg`,
    header: `${CDN}/${appId}/header.jpg`,
    icon: null,
  };
}

/** Deterministic palette from a title so fallback art is stable per game. */
export function generatedPalette(title: string): { cover: string; hero: string } {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const cover = `hsl(${hue} 32% 30%)`;
  const hero = `hsl(${(hue + 18) % 360} 40% 12%)`;
  return { cover, hero };
}

export function mergeArtwork(local: Partial<ArtworkSet>, cdn: ArtworkSet): ArtworkSet {
  return {
    cover: local.cover ?? cdn.cover,
    hero: local.hero ?? cdn.hero,
    header: local.header ?? cdn.header,
    icon: local.icon ?? cdn.icon,
  };
}
