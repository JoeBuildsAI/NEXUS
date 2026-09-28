import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./BrowserTile";

describe("browser surface url policy", () => {
  it("accepts only web pages, upgrades http, strips nothing else, rejects credentials and schemes", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("http://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeUrl("https://user:pw@example.com")).toBeNull();
    expect(normalizeUrl("file:///C:/Windows")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("tauri://localhost")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  it("SECURITY: never frames NEXUS's own origins, loopback or private-network hosts", () => {
    for (const u of ["http://tauri.localhost/", "https://ipc.localhost/plugin", "http://asset.localhost/C%3A%5C", "localhost:1420", "127.0.0.1", "https://[::1]/", "192.168.1.1", "10.0.0.5", "172.16.3.4", "169.254.1.1", "router", "https://[fe80::1]/"]) {
      expect(normalizeUrl(u), u).toBeNull();
    }
    expect(normalizeUrl("172.32.0.1")).toBe("https://172.32.0.1/");
    expect(normalizeUrl("www.youtube.com/watch?v=x")).toBe("https://www.youtube.com/watch?v=x");
  });
});
