import { describe, expect, it } from "vitest";
import html from "../index.html?raw";
import conf from "../src-tauri/tauri.conf.json";

const metaCsp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
const confCsp = conf.app.security.csp;

describe("content security policy", () => {
  it("index.html and tauri.conf.json carry the same policy", () => {
    expect(metaCsp).toBe(confCsp);
  });

  it("allows local video/thumbnails via the asset protocol and nothing remote", () => {
    expect(confCsp).toMatch(/media-src[^;]*http:\/\/asset\.localhost/);
    expect(confCsp).toMatch(/img-src[^;]*http:\/\/asset\.localhost/);
    expect(confCsp).not.toMatch(/https:/);
    expect(confCsp).not.toMatch(/frame-src/);
  });
});
