/**
 * Media wall visual audit with synthetic fixture videos (non-private).
 *   node scripts/gen-fixtures.mjs   (once)
 *   node scripts/media-audit.mjs [WxH]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [w, h] = (process.argv[2] ?? "1920x1080").split("x").map(Number);
const out = new URL("./.shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.split("\n")[0]}`));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_CONNECTION|React DevTools|Autoplay/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
await page.addInitScript(() => {
  localStorage.setItem("nexus-settings", JSON.stringify({ version: 3, state: { profile: { name: "Joseph", onboardingComplete: true }, startup: { startupAnimation: false }, appearance: { reducedMotion: true } } }));
  localStorage.removeItem("nexus-media-workspace");
});
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.evaluate(() => window.__nexusDev.getState().set({ syntheticVideos: true }));
const shot = async (name, ms = 900) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${out}/media-${name}-${w}.png` }); console.log("captured", name); };
const media = () => page.evaluate(() => window.__nexusMedia);

await page.locator('nav button[aria-label="Media"]').click();
await page.waitForTimeout(700);
await shot("empty");

// Add players through the store (deterministic), pick fixture items 0..5 by their ids.
const ids = await page.evaluate(async () => {
  const items = await window.__nexusProviders.media.getItems();
  return items.slice(0, 6).map((i) => i.id);
});
const add = async (i, opts) => { await page.evaluate(([id, o]) => window.__nexusMedia.getState().addToWall(id, o), [ids[i], opts ?? {}]); await page.waitForTimeout(400); };
const clear = async () => page.evaluate(() => window.__nexusMedia.getState().clearAll());

await add(0); await page.evaluate(() => window.__nexusMedia.getState().playAll()); await shot("1-landscape", 1800);
await clear(); await add(2); await shot("1-portrait", 1500);
await clear(); await add(0); await add(2); await page.evaluate(() => window.__nexusMedia.getState().playAll()); await shot("2-mixed", 1800);
await add(1); await shot("3", 1500);
await add(3); await shot("4", 1500);
await add(4); await shot("5", 1500);
await add(5); await page.evaluate(() => window.__nexusMedia.getState().playAll()); await shot("6", 2000);
await page.evaluate(() => window.__nexusMedia.getState().setPrimary(0)); await shot("6-primary", 1500);
await page.evaluate(() => { const s = window.__nexusMedia.getState(); s.setFocusIndex(0); s.setMode("focus"); }); await shot("focus", 1500);
await page.evaluate(() => { const s = window.__nexusMedia.getState(); s.setMode("auto"); s.setPrimary(null); });

// A–B loop on player 0 with controls visible (hover)
await page.evaluate(() => { const s = window.__nexusMedia.getState(); s.setSegment(0, 4, 9, 24); s.setActiveIndex(0); });
await page.hover('[data-player="0"]');
await shot("ab-loop", 1200);
// Loop stability: sample currentTime for 6s; it must stay within [A-0.5, B+0.5]
const samples = await page.evaluate(async () => {
  const v = document.querySelector('[data-player="0"] video');
  const out = [];
  for (let i = 0; i < 24; i++) { await new Promise((r) => setTimeout(r, 250)); out.push(v.currentTime); }
  return out;
});
const outOfRange = samples.filter((t) => t < 3.5 || t > 9.6);
console.log("A–B samples", samples.map((t) => t.toFixed(2)).join(" "), outOfRange.length ? `OUT OF RANGE: ${outOfRange.length}` : "stable");

// Privacy curtain on restore: reload with the workspace persisted
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.evaluate(() => window.__nexusDev.getState().set({ syntheticVideos: true }));
await page.locator('nav button[aria-label="Media"]').click();
await shot("restore-curtain", 900);

await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
if (outOfRange.length) process.exit(2);
console.log("no page errors");
