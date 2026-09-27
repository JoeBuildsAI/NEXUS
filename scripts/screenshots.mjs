// Visual audit helper: drives the Vite dev server in headless Edge and captures
// every screen at a given resolution. Usage: node scripts/screenshots.mjs [1920x1080] [--quick]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [w, h] = (process.argv[2] ?? "1920x1080").split("x").map(Number);
const quick = process.argv.includes("--quick");
const out = "scripts/.shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

// Skip boot + onboarding for the audit.
await page.addInitScript(() => {
  const s = JSON.parse(localStorage.getItem("nexus-settings") ?? "{}");
  s.state = { ...(s.state ?? {}), profile: { name: "Joseph", onboardingComplete: true }, startup: { launchOnLogin: false, startMinimized: false, startupAnimation: false } };
  s.version = 2;
  localStorage.setItem("nexus-settings", JSON.stringify(s));
});

await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const shot = async (name, p = page) => {
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/${name}-${w}.png` });
  console.log("captured", name);
};
const nav = async (label) => { await page.locator(`nav button[aria-label="${label}"]`).click(); await page.mouse.move(w - 40, h - 40); await page.waitForTimeout(600); };
const tab = async (name) => { await page.getByRole("tab", { name }).click(); await page.waitForTimeout(500); };
const settingsSection = async (name) => { await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name, exact: true }).click(); await page.waitForTimeout(600); };

await shot("home");
await nav("Gaming"); await shot("gaming");
await page.getByRole("button", { name: "Details" }).click(); await shot("game-detail");
await nav("Media"); await shot("media-empty-wall");
await page.evaluate(async () => { const items = await window.__nexusProviders.media.getItems(); const s = window.__nexusMedia.getState(); for (const it of items.slice(0, 4)) s.addToWall(it.id); });
await page.waitForTimeout(1200); await shot("media-wall-4");
await page.getByRole("button", { name: "Primary", exact: true }).click(); await page.evaluate(() => window.__nexusMedia.getState().setPrimary(0)); await shot("media-wall-primary");
await page.evaluate(() => { const s = window.__nexusMedia.getState(); s.setMode("auto"); s.setPrimary(null); });
await tab("Library"); await shot("media-library");
await tab("Collections"); await shot("media-collections");
await nav("System"); await shot("system");
await tab(/Hardware/); await shot("hardware");
await tab(/Processes/); await shot("processes");
await tab(/Storage/); await shot("storage");
await tab(/Startup/); await shot("startup");
await nav("Communications"); await shot("comms");
await page.locator("[data-message-row]").nth(1).click(); await shot("comms-message");
await page.getByRole("button", { name: "Subscriptions", exact: true }).last().click(); await shot("subscriptions");
await nav("Settings"); await shot("settings-general");
await settingsSection("Appearance"); await shot("settings-appearance");
await settingsSection("Gaming"); await shot("settings-gaming");
await settingsSection("Media"); await shot("settings-media");
await settingsSection("Privacy"); await shot("settings-privacy");
await settingsSection("System"); await page.waitForTimeout(800); await shot("settings-system");
await settingsSection("Integrations"); await page.waitForTimeout(800); await shot("settings-integrations");
await nav("Home");
await page.keyboard.press("Control+Space"); await page.waitForTimeout(400); await shot("palette-idle");
await page.keyboard.type("open dis"); await page.waitForTimeout(400); await shot("palette-query");
await page.keyboard.press("Escape");

if (!quick) {
  // Mode preview → transition → gaming-mode home
  await page.getByRole("button", { name: /normal mode/i }).click(); await page.waitForTimeout(300);
  await page.getByRole("menuitemradio", { name: "Gaming" }).click(); await page.waitForTimeout(500); await shot("mode-preview");
  await page.getByRole("button", { name: /Enter Gaming Mode/ }).click(); await page.waitForTimeout(900); await shot("mode-transition");
  await page.waitForTimeout(3000); await shot("home-gaming-mode");

  // Privacy veil (should be pure black with resume)
  await nav("Media"); await page.keyboard.press("Control+Shift+Backquote"); await page.waitForTimeout(150); await shot("privacy-veil");
  await page.getByRole("button", { name: "Resume" }).click();

  // Empty states via the dev simulation panel: Steam offline, media disconnected, email offline
  await nav("Home");
  await page.keyboard.press("Control+Shift+D"); await page.waitForTimeout(400);
  for (const name of ["Steam connected", "Media drive connected", "Email connected"]) await page.getByRole("switch", { name }).click();
  await page.keyboard.press("Control+Shift+D"); await page.waitForTimeout(300);
  await nav("Gaming"); await shot("empty-steam");
  await nav("Media"); await shot("empty-media");
  await nav("Communications"); await shot("empty-comms");
  await page.keyboard.press("Control+Shift+D"); await page.waitForTimeout(300);
  for (const name of ["Steam connected", "Media drive connected", "Email connected"]) await page.getByRole("switch", { name }).click();
  await page.keyboard.press("Control+Shift+D");

  // Boot + onboarding (fresh profile)
  const p2 = await browser.newPage({ viewport: { width: w, height: h } });
  p2.on("pageerror", (e) => errors.push(`pageerror(onboarding): ${e.message}`));
  await p2.addInitScript(() => localStorage.setItem("nexus-settings", JSON.stringify({ version: 2, state: { profile: { name: "", onboardingComplete: false }, startup: { launchOnLogin: false, startMinimized: false, startupAnimation: true } } })));
  await p2.goto("http://localhost:1420/", { waitUntil: "domcontentloaded" });
  await p2.waitForTimeout(1700); await shot("boot", p2);
  await p2.waitForTimeout(2500); await shot("onboarding", p2);
  await p2.getByRole("button", { name: /Begin/ }).click(); await p2.waitForTimeout(2600); await shot("onboarding-scan", p2);
  await p2.getByRole("button", { name: /^Continue/ }).click(); await p2.waitForTimeout(600); await shot("onboarding-personalize", p2);
  await p2.getByRole("button", { name: /^Continue/ }).click(); await p2.waitForTimeout(700); await shot("onboarding-ready", p2);
}

console.log(errors.length ? `\nERRORS:\n${errors.join("\n")}` : "\nno page errors");
await browser.close();
