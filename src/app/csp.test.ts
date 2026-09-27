import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import tauriConf from "../../src-tauri/tauri.conf.json?raw";

const directives = (csp: string) => Object.fromEntries(csp.split(";").map((d) => d.trim().split(/\s+/)).filter((p) => p[0]).map(([k, ...v]) => [k!, v]));

const metaCsp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(indexHtml)![1]!;
const tauriCsp = (JSON.parse(tauriConf) as { app: { security: { csp: string } } }).app.security.csp;

/**
 * Both policies apply in the WebView (the stricter wins). On Windows, Tauri
 * serves `convertFileSrc` URLs from http://asset.localhost — a meta policy
 * without it silently blocked local Steam artwork and local media playback.
 */
describe("Content Security Policy", () => {
  it.each(["img-src", "media-src"])("%s allows the Windows asset origin in both policies", (d) => {
    for (const csp of [metaCsp, tauriCsp]) expect(directives(csp)[d]).toContain("http://asset.localhost");
  });

  it("remote frames never get script-capable local origins or IPC", () => {
    for (const csp of [metaCsp, tauriCsp]) {
      const p = directives(csp);
      expect(p["frame-src"]).toEqual(["https:"]);
      expect(p["default-src"]).toEqual(["'self'"]);
      expect(p["script-src"]).toBeUndefined();
    }
  });
});
