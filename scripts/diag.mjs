import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message, "\n", e.stack?.split("\n").slice(0, 8).join("\n")));
page.on("console", (m) => { if (m.type() === "error") console.log(`CONSOLE[${m.type()}]:`, m.text().slice(0, 900)); });
await page.addInitScript(() => {
  localStorage.setItem("nexus-settings", JSON.stringify({ version: 2, state: { profile: { name: "Joseph", onboardingComplete: true }, startup: { launchOnLogin: false, startMinimized: false, startupAnimation: false } } }));
});
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const nav = async (label) => { await page.locator(`nav button[aria-label="${label}"]`).click(); await page.waitForTimeout(900); };
await nav("System");
await page.getByRole("button", { name: /Storage/ }).click(); await page.waitForTimeout(900);
await nav("Comms");
await page.waitForTimeout(1500);
console.log("body text:", (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n+/g, " | "));
await browser.close();
