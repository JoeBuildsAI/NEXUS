// Visual audit helper: drives the Vite dev server in headless Edge and captures
// every screen at a given resolution. Usage: node scripts/screenshots.mjs [1920x1080]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [w, h] = (process.argv[2] ?? "1920x1080").split("x").map(Number);
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

const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}-${w}.png` });
  console.log("captured", name);
};

await shot("home");
const nav = async (label) => { await page.locator(`nav button[aria-label="${label}"]`).click(); await page.waitForTimeout(600); };

await nav("Gaming"); await shot("gaming");
await page.getByRole("button", { name: "Details" }).click(); await shot("game-detail");
await nav("Media"); await shot("media");
await nav("System"); await shot("system");
await page.getByRole("button", { name: /Processes/ }).click(); await shot("processes");
await page.getByRole("button", { name: /Storage/ }).click(); await shot("storage");
await nav("Comms"); await shot("comms");
await page.getByRole("button", { name: /Subscriptions/ }).click(); await shot("subscriptions");
await nav("System"); await page.getByRole("button", { name: /Hardware/ }).click(); await shot("hardware");
await nav("Settings"); await shot("settings");
await page.getByRole("button", { name: "Appearance" }).click(); await shot("settings-appearance");
await page.getByRole("button", { name: "Integrations" }).click(); await page.waitForTimeout(800); await shot("settings-integrations");
await page.getByRole("main").getByRole("button", { name: "Media", exact: true }).click(); await shot("settings-media");
await page.getByRole("main").getByRole("button", { name: "System", exact: true }).click(); await page.waitForTimeout(800); await shot("settings-system");
await nav("Home");
await page.keyboard.press("Control+Space"); await page.waitForTimeout(400); await shot("palette-idle");
await page.keyboard.type("open dis"); await page.waitForTimeout(400); await shot("palette-query");
await page.keyboard.press("Escape");
// Mode preview
await page.getByRole("button", { name: /Normal Mode/ }).click(); await page.waitForTimeout(300);
await page.locator(".glass-strong button", { hasText: "Gaming" }).click(); await page.waitForTimeout(500); await shot("mode-preview");
await page.getByRole("button", { name: /Enter Gaming Mode/ }).click(); await page.waitForTimeout(900); await shot("mode-transition");
await page.waitForTimeout(2500); await shot("home-gaming-mode");

// Onboarding (fresh profile)
const p2 = await browser.newPage({ viewport: { width: w, height: h } });
await p2.addInitScript(() => localStorage.setItem("nexus-settings", JSON.stringify({ version: 2, state: { profile: { name: "", onboardingComplete: false }, startup: { launchOnLogin: false, startMinimized: false, startupAnimation: false } } })));
await p2.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await p2.waitForTimeout(1500);
await p2.screenshot({ path: `${out}/onboarding-${w}.png` }); console.log("captured onboarding");
await p2.getByRole("button", { name: /Begin/ }).click(); await p2.waitForTimeout(1200);
await p2.getByRole("button", { name: /Continue/ }).click(); await p2.waitForTimeout(600);
await p2.screenshot({ path: `${out}/onboarding-personalize-${w}.png` }); console.log("captured onboarding-personalize");

console.log(errors.length ? `\nERRORS:\n${errors.join("\n")}` : "\nno page errors");
await browser.close();
