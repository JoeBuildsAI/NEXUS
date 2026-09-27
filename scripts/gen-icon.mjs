// Generates a 1024x1024 PNG app icon for NEXUS (no external deps), then
// `npx tauri icon scripts/.icon/source.png` produces every platform size.
//
// The mark: near-black rounded square, a hairline inner edge, and the NEXUS "N"
// reduced to three strokes — two white stems, one diagonal at 55% — matching
// src/components/shell/NexusMark.tsx. Monochrome, geometric, legible at 16px.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const S = 1024;
const buf = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const da = buf[i + 3] / 255;
  const sa = a / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / outA);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / outA);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

// Rounded-square background with anti-aliased corners (Windows-style radius).
const R = 224;
function insideRounded(x, y) {
  const px = Math.min(Math.max(x, R), S - 1 - R);
  const py = Math.min(Math.max(y, R), S - 1 - R);
  const d = Math.hypot(x - px, y - py);
  return Math.max(0, Math.min(1, R - d + 0.5));
}
const cx = S / 2;
const cy = S / 2;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const cov = insideRounded(x, y);
    if (cov <= 0) continue;
    // Very subtle top-light: #0f0f11 at top → #050506 at bottom.
    const t = y / S;
    const v = Math.round(15 * (1 - t) + 5 * t);
    const glow = Math.max(0, 1 - Math.hypot(x - cx, y - cy * 0.6) / (S * 0.75)) * 6;
    set(x, y, v + glow, v + glow, v + glow + 2, Math.round(255 * cov));
  }
}
// Hairline inner edge (1.5px, ~7% white) just inside the rounded boundary.
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const px = Math.min(Math.max(x, R), S - 1 - R);
    const py = Math.min(Math.max(y, R), S - 1 - R);
    const d = Math.hypot(x - px, y - py);
    const edge = Math.abs(d - (R - 14));
    if (edge < 2) set(x, y, 255, 255, 255, Math.round(18 * (1 - edge / 2)));
  }
}

// Anti-aliased thick line with round caps.
function line(x0, y0, x1, y1, thick, r, g, b, a) {
  const minX = Math.floor(Math.min(x0, x1) - thick - 2), maxX = Math.ceil(Math.max(x0, x1) + thick + 2);
  const minY = Math.floor(Math.min(y0, y1) - thick - 2), maxY = Math.ceil(Math.max(y0, y1) + thick + 2);
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      const d = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
      const cov = Math.max(0, Math.min(1, thick - d + 0.5));
      if (cov > 0) set(x, y, r, g, b, Math.round(a * cov));
    }
  }
}

// The N: stems at 31% / 69%, from 30% to 70% height. Stroke ≈ 5.5% of size.
const th = 28;
const top = 318;
const bot = 706;
const lx = 336;
const rx = 688;
line(lx, top, rx, bot, th, 255, 255, 255, 140); // diagonal (55%)
line(lx, bot, lx, top, th, 255, 255, 255, 250); // left stem
line(rx, bot, rx, top, th, 255, 255, 255, 250); // right stem

// Encode PNG
function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);

mkdirSync("scripts/.icon", { recursive: true });
writeFileSync("scripts/.icon/source.png", png);
console.log("Wrote scripts/.icon/source.png", png.length, "bytes");
