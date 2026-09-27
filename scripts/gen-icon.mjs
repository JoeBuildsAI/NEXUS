// Generates a 1024x1024 PNG app icon for NEXUS (no external deps).
// Deep charcoal background, cyan-steel ring, and a stylized "N".
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const S = 1024;
const buf = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  // simple src-over blend onto existing
  const da = buf[i + 3] / 255;
  const sa = a / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / outA);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / outA);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / outA);
  buf[i + 3] = Math.round(outA * 255);
}

// Background: rounded-rect radial gradient
const cx = S / 2;
const cy = S / 2;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - cx, y - cy) / (S / 2);
    const t = Math.min(1, d);
    const r = Math.round(16 * (1 - t) + 5 * t);
    const g = Math.round(28 * (1 - t) + 7 * t);
    const b = Math.round(38 * (1 - t) + 10 * t);
    set(x, y, r, g, b, 255);
  }
}

// Accent ring
function ring(radius, width, r, g, b, a) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const edge = Math.abs(d - radius);
      if (edge < width) {
        const falloff = 1 - edge / width;
        set(x, y, r, g, b, Math.round(a * falloff));
      }
    }
  }
}
ring(360, 10, 94, 208, 230, 220);
ring(300, 4, 94, 208, 230, 90);

// Draw a bold "N" using thick strokes
function line(x0, y0, x1, y1, thick, r, g, b, a) {
  const steps = Math.round(Math.hypot(x1 - x0, y1 - y0));
  for (let s = 0; s <= steps; s++) {
    const px = x0 + ((x1 - x0) * s) / steps;
    const py = y0 + ((y1 - y0) * s) / steps;
    for (let dy = -thick; dy <= thick; dy++) {
      for (let dx = -thick; dx <= thick; dx++) {
        if (dx * dx + dy * dy <= thick * thick) {
          set(Math.round(px + dx), Math.round(py + dy), r, g, b, a);
        }
      }
    }
  }
}
const th = 34;
const top = 360;
const bot = 664;
const lx = 392;
const rx = 632;
line(lx, bot, lx, top, th, 255, 255, 255, 245); // left vertical
line(rx, bot, rx, top, th, 255, 255, 255, 245); // right vertical
line(lx, top, rx, bot, th, 94, 208, 230, 255); // diagonal accent

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
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// filter type 0 per scanline
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const idat = deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("scripts/.icon", { recursive: true });
writeFileSync("scripts/.icon/source.png", png);
console.log("Wrote scripts/.icon/source.png", png.length, "bytes");
