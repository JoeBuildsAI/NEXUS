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
});
