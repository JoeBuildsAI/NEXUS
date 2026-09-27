/**
 * Stress / chaos visual audit against the Vite dev server using the dev
 * simulation lab: large libraries, extreme titles, provider exceptions.
 *   node scripts/stress.mjs [WxH]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [w, h] = (process.argv[2] ?? "1920x1080").split("x").map(Number);
const out = new URL("./.shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.split("\n")[0]}`));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_CONNECTION|Download the React DevTools/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
await page.addInitScript(() => localStorage.setItem("nexus-settings", JSON.stringify({ version: 3, state: { profile: { name: "Joseph", onboardingComplete: true }, startup: { startupAnimation: false }, appearance: { reducedMotion: true } } })));
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${out}/stress-${name}-${w}.png` }); console.log("captured", name); };
const nav = async (label) => { await page.locator(`nav button[aria-label="${label}"]`).click(); await page.waitForTimeout(500); };
const sim = async (patch) => { await page.evaluate((p) => window.__nexusDev.getState().set(p), patch); await page.waitForTimeout(600); };
const resetLibrary = async () => page.evaluate(() => { localStorage.removeItem("nexus-library-cache"); });

// 1. 500-game library + extreme titles
await sim({ steamLibrarySize: 500, extremeText: true });
await resetLibrary();
await nav("Today"); await nav("Play");
await page.waitForTimeout(1500);
await shot("gaming-500-extreme");
await page.getByRole("button", { name: "Name", exact: true }).click(); await page.waitForTimeout(400);
await page.getByLabel("Search library").fill("zenith"); await page.waitForTimeout(500);
await shot("gaming-search");
await page.getByLabel("Search library").fill("");
// open an extreme-title detail via search
await page.getByLabel("Search library").fill("Extraordinarily"); await page.waitForTimeout(600);
await shot("gaming-extreme-grid");
await page.locator('button[aria-label^="The Extraordinarily"]').first().click();
await page.waitForTimeout(900);
await shot("game-detail-extreme");
await page.keyboard.press("Escape");
await page.getByLabel("Search library").fill("");

// 2. Private profile
await sim({ steamPrivateProfile: true });
await resetLibrary();
await nav("Today"); await nav("Play"); await page.waitForTimeout(1200);
await page.locator('button[aria-label^="Baldur"]').first().click().catch(() => {});
await page.waitForTimeout(700);
await shot("game-detail-private");
await page.keyboard.press("Escape");
await sim({ steamPrivateProfile: false, steamLibrarySize: 0, extremeText: false });

// 3. 10k media
await sim({ mediaLibrarySize: 10000, extremeText: true });
await nav("Media");
await page.getByRole("tab", { name: "Library" }).click(); await page.waitForTimeout(1200);
await shot("media-10k");
await page.getByLabel("Search library (local)").fill("session 0999"); await page.waitForTimeout(600);
await shot("media-10k-search");
await sim({ mediaLibrarySize: 0, extremeText: false });

// 4. Provider exceptions (chaos) — every screen must stay up
await sim({ providerExceptions: true });
await nav("Today"); await page.waitForTimeout(900); await shot("chaos-home");
await nav("Play"); await page.waitForTimeout(900); await shot("chaos-gaming");
await nav("Media"); await page.waitForTimeout(900); await shot("chaos-media");
await nav("Communications"); await page.waitForTimeout(900); await shot("chaos-comms");
await sim({ providerExceptions: false });

// 5. Offline everything
await sim({ steamConnected: false, mediaConnected: false, emailConnected: false, telemetryAvailable: false });
await nav("Today"); await page.waitForTimeout(900); await shot("offline-home");
await nav("Communications"); await page.waitForTimeout(900); await shot("offline-comms");
await nav("System"); await page.waitForTimeout(900); await shot("offline-system");

await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("no page errors");
