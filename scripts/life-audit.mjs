// LIFE audit: Today / Calendar (5 views) / Life sections with sample data, at a given resolution.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const res = process.argv[2] ?? "1920x1080";
const [W, H] = res.split("x").map(Number);
const out = "scripts/.shots"; mkdirSync(out, { recursive: true });
const errors = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_/.test(m.text())) errors.push(m.text()); });
await page.addInitScript(() => {
  localStorage.setItem("nexus-settings", JSON.stringify({ state: { profile: { name: "Joseph", onboardingComplete: true, subtitle: "", clockFormat: "12h" } }, version: 0 }));
  for (const k of Object.keys(localStorage)) if (k.startsWith("nexus-life")) localStorage.removeItem(k);
});
await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const shot = async (name, wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${out}/life-${name}-${W}.png` }); console.log("captured", name); };
const nav = (label) => page.locator(`nav button[aria-label="${label}"]`).click();
await shot("today-empty");
await nav("Life"); await shot("life-empty");
await page.getByRole("button", { name: "Load sample data" }).click(); await page.waitForTimeout(800);
await shot("life-overview");
for (const s of ["Week", "Routines", "Fitness", "Nutrition", "Meals", "Groceries", "Tasks"]) { await page.getByRole("button", { name: s, exact: true }).first().click(); await shot(`life-${s.toLowerCase()}`, 500); }
// groceries build
await page.getByRole("button", { name: "Groceries", exact: true }).first().click(); await page.waitForTimeout(300);
await page.getByRole("button", { name: /Build from meal plan|Rebuild from plan/ }).click(); await shot("life-groceries-built", 700);
// fitness session
await page.getByRole("button", { name: "Fitness", exact: true }).first().click(); await page.waitForTimeout(300);
const start = page.getByRole("button", { name: "Start workout" });
if (await start.count()) { await start.click(); } else { await page.getByRole("button", { name: "Start", exact: true }).first().click(); }
await page.waitForTimeout(500);
await page.getByLabel("Set 1 reps").first().fill("9"); await page.getByRole("button", { name: "Complete", exact: true }).first().click();
await shot("life-workout-active", 600);
await page.getByRole("button", { name: "Finish workout" }).click(); await page.waitForTimeout(500);
await page.getByRole("button", { name: "history", exact: true }).click(); await shot("life-fitness-history", 500);
// routine completion
await page.getByRole("button", { name: "Routines", exact: true }).first().click(); await page.waitForTimeout(300);
await page.getByRole("button", { name: "Complete all" }).first().click(); await shot("life-routine-complete", 400);
// today with data
await nav("Today"); await shot("today", 800);
// calendar views
await nav("Calendar");
for (const v of ["Day", "Week", "Month", "Year", "Agenda"]) { await page.getByRole("button", { name: v, exact: true }).click(); await shot(`calendar-${v.toLowerCase()}`, 500); }
await page.getByRole("button", { name: "Day", exact: true }).click(); await page.getByRole("button", { name: "New", exact: true }).click(); await shot("calendar-editor", 400);
await page.keyboard.press("Escape");
// persistence: reload → sample data must still be there (memory repo persists to localStorage)
await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(1200);
await nav("Life"); await page.waitForTimeout(500);
const persisted = await page.getByText("sample data").count();
console.log("persisted after reload:", persisted > 0);
if (!persisted) errors.push("life data did not persist across reload");
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no page errors");
await browser.close();
