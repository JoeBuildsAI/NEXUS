/**
 * Generates synthetic, non-private test videos (WebM/VP8) with a burned-in
 * timecode for loop/layout testing. Output: scripts/.fixtures/*.webm (gitignored).
 *   node scripts/gen-fixtures.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), ".fixtures");
mkdirSync(out, { recursive: true });

const SPECS = [
  { name: "landscape-a", w: 640, h: 360, seconds: 24, hue: 205 },
  { name: "landscape-b", w: 640, h: 360, seconds: 18, hue: 30 },
  { name: "portrait", w: 360, h: 640, seconds: 20, hue: 300 },
  { name: "square", w: 480, h: 480, seconds: 16, hue: 120 },
  { name: "ultrawide", w: 840, h: 360, seconds: 22, hue: 0 },
  { name: "landscape-c", w: 640, h: 360, seconds: 30, hue: 260 },
];

// Small bundled demo clips (shipped in public/demo so the demo wall is truthfully playable offline).
const DEMO_OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "demo");
mkdirSync(DEMO_OUT, { recursive: true });
const DEMO_SPECS = [
  { name: "coastal", w: 320, h: 180, seconds: 8, hue: 205 },
  { name: "studio", w: 320, h: 180, seconds: 8, hue: 340 },
  { name: "trail", w: 180, h: 320, seconds: 8, hue: 140 },
  { name: "city", w: 240, h: 240, seconds: 8, hue: 45 },
  { name: "interview", w: 420, h: 180, seconds: 8, hue: 265 },
  { name: "workshop", w: 320, h: 180, seconds: 8, hue: 185 },
];

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto("about:blank");

for (const spec of [...SPECS.map((s) => ({ ...s, dir: out, bitrate: 1_200_000 })), ...DEMO_SPECS.map((s) => ({ ...s, dir: DEMO_OUT, bitrate: 220_000 }))]) {
  const file = path.join(spec.dir, `${spec.name}.webm`);
  if (existsSync(file)) { console.log("exists", spec.name); continue; }
  const b64 = await page.evaluate(async ({ w, h, seconds, hue, name, bitrate }) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8", videoBitsPerSecond: bitrate });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => (rec.onstop = res));
    rec.start(250);
    const start = performance.now();
    await new Promise((resolve) => {
      const frame = () => {
        const t = (performance.now() - start) / 1000;
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, `hsl(${hue}, 45%, 12%)`);
        g.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 28%)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        // moving marker so motion is visible in thumbnails
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        const x = ((t * 60) % (w + 40)) - 20;
        ctx.fillRect(x, h * 0.72, 20, 6);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = `${Math.round(Math.min(w, h) / 6)}px monospace`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const mm = String(Math.floor(t / 60)).padStart(2, "0"), ss = String(Math.floor(t % 60)).padStart(2, "0"), ms = String(Math.floor((t % 1) * 10));
        ctx.fillText(`${mm}:${ss}.${ms}`, w / 2, h / 2);
        ctx.font = `${Math.round(Math.min(w, h) / 14)}px sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillText(`${name} · ${w}×${h}`, w / 2, h * 0.62);
        if (t < seconds) requestAnimationFrame(frame); else resolve();
      };
      frame();
    });
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: "video/webm" });
    const buf = await blob.arrayBuffer();
    let bin = ""; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, spec);
  writeFileSync(file, Buffer.from(b64, "base64"));
  console.log("wrote", spec.name, Math.round(Buffer.byteLength(b64, "base64") / 1024), "KB");
}
await browser.close();
