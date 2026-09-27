/**
 * Communications visual + chaos audit (demo inbox, synthetic mailbox when requested).
 *   node scripts/comms-audit.mjs [WxH] [--stress]
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const [w, h] = (args.find((a) => /^\d+x\d+$/.test(a)) ?? "1920x1080").split("x").map(Number);
const stress = args.includes("--stress");
const out = new URL("./.shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.split("\n")[0]}`));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_CONNECTION|React DevTools/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
await page.addInitScript(() => {
  localStorage.setItem("nexus-settings", JSON.stringify({ version: 3, state: { profile: { name: "Joseph", onboardingComplete: true }, startup: { startupAnimation: false }, appearance: { reducedMotion: true } } }));
  localStorage.removeItem("nexus-email-rules");
  localStorage.removeItem("nexus-routing-rules");
});
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const tag = stress ? "-stress" : "";
const shot = async (name, ms = 800) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${out}/comms-${name}${tag}-${w}.png` }); console.log("captured", name); };
const sim = (patch) => page.evaluate((p) => window.__nexusDev.getState().set(p), patch);
if (stress) await sim({ emailLibrarySize: 100000, hugeThread: true });

await page.locator('nav button[aria-label="Communications"]').click();
await page.waitForTimeout(stress ? 3500 : 900);
const t0 = Date.now();
await shot("inbox");
const surf = async (name) => { await page.getByRole("button", { name, exact: true }).first().click(); await page.waitForTimeout(700); };

// Keyboard: j moves selection
await page.keyboard.press("j"); await page.keyboard.press("j"); await shot("inbox-keyboard", 400);
// Views
await page.getByRole("button", { name: "Receipts", exact: true }).click(); await shot("view-receipts", 500);
await page.getByRole("button", { name: "Newsletters", exact: true }).click(); await shot("view-newsletters", 500);
// Filters + search
await page.getByRole("button", { name: /^Filters/ }).click(); await shot("filters", 300);
const ts = Date.now();
await page.getByLabel("Search mail").fill("steam"); await page.waitForTimeout(300);
console.log("local search latency ~", Date.now() - ts, "ms (incl. 300ms settle)");
await shot("search", 300);
await page.getByLabel("Search mail").fill("");
await page.getByRole("button", { name: "All mail", exact: true }).click();
// Reading pane: why? + create rule
await page.getByRole("button", { name: "why?" }).first().click().catch(() => {}); await shot("why", 300);
await page.getByRole("button", { name: /Create rule/ }).first().click().catch(() => {}); await shot("rule-composer", 600);
// Surfaces
await surf("Digest"); await shot("today");
await surf("Health");
const th = Date.now();
await page.getByRole("button", { name: "Analyze" }).click(); await page.waitForTimeout(400);
console.log("health analysis ~", Date.now() - th - 400, "ms");
await shot("health");
await page.getByRole("button", { name: "Review cleanup" }).click().catch(() => {}); await shot("cleanup-review", 500);
await page.getByRole("button", { name: "Approve all" }).click().catch(() => {}); await page.getByRole("button", { name: /confirm$/ }).click().catch(() => {}); await shot("cleanup-confirm", 400);
await surf("Subscriptions"); await shot("subscriptions");
await page.getByRole("button", { name: "Select all" }).click(); await page.getByRole("button", { name: /Unsubscribe…/ }).click(); await shot("unsubscribe-ledger", 500);
await surf("Rules"); await shot("rules");
// Cleanup view
await surf("Inbox"); await page.getByRole("button", { name: "Cleanup", exact: true }).click(); await shot("cleanup-view", 600);

// Chaos states
for (const failure of ["auth", "rate-limit", "server"]) {
  await sim({ emailFailure: failure }); await page.waitForTimeout(700); await shot(`chaos-${failure}`, 300);
}
await sim({ emailFailure: "none", emailConnected: false }); await page.waitForTimeout(700); await shot("offline", 300);
await sim({ emailConnected: true, emailPartialFailure: true, emailLibrarySize: 5000, hugeThread: false });
await page.waitForTimeout(1500);
await surf("Inbox"); await page.getByRole("button", { name: "Cleanup", exact: true }).click(); await page.waitForTimeout(600);
await page.getByRole("button", { name: "7 days", exact: true }).click(); await page.waitForTimeout(300);
await page.getByRole("button", { name: "Approve all" }).click(); await page.getByRole("button", { name: /confirm$/ }).click(); await page.waitForTimeout(300);
await shot("cleanup-confirm-large", 200);
await page.getByRole("button", { name: /^Archive [0-9]/ }).click(); await page.waitForTimeout(2500);
await shot("cleanup-report-partial", 300);
console.log("total run", Math.round((Date.now() - t0) / 1000), "s");
await browser.close();
if (errors.length) { console.log("ERRORS:\n" + errors.join("\n")); process.exit(1); }
console.log("no page errors");
