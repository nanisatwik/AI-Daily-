/**
 * Generates every image the app ships: the paper grain tile, the launcher
 * icons, and the splash mark.
 *
 * Written against node:zlib rather than a raster library on purpose. The
 * artwork is rules, bars and tally strokes — geometry a hundred lines of
 * scanline code can draw exactly — and pulling in an image toolchain to do it
 * would add a build dependency, and a licence to audit, to a project whose
 * whole premise is that it costs nothing and has no pipeline.
 *
 * Run with `npm run assets`. The output is committed, so a checkout builds
 * without ever running this.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

/* ------------------------------------------------------------------ *
 * The tokens, copied from app/globals.css
 * ------------------------------------------------------------------ */

const PAPER = [0xe7, 0xd9, 0xbb];
const INK = [0x2b, 0x1f, 0x12];
const ACCENT = [0x8b, 0x2e, 0x1f];

/* ------------------------------------------------------------------ *
 * A very small RGBA canvas
 * ------------------------------------------------------------------ */

function canvas(width, height, fill) {
  const px = new Uint8Array(width * height * 4);
  if (fill) {
    const [r, g, b, a = 255] = fill;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  return { width, height, px };
}

/** Source-over composite of one pixel, so overlapping strokes blend correctly. */
function blend(c, x, y, [r, g, b], coverage) {
  if (coverage <= 0) return;
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 4;
  const a = Math.min(1, coverage);
  const dstA = c.px[i + 3] / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  // Premultiplied mix, then back to straight alpha — compositing a stroke onto
  // a transparent canvas (the monochrome icon does exactly this) goes muddy
  // otherwise, because the destination colour under alpha 0 is meaningless.
  for (let k = 0; k < 3; k++) {
    const src = [r, g, b][k];
    c.px[i + k] = Math.round((src * a + c.px[i + k] * dstA * (1 - a)) / outA);
  }
  c.px[i + 3] = Math.round(outA * 255);
}

function rect(c, x, y, w, h, color) {
  // Sub-pixel edges are covered proportionally, so a 1.5px rule at 3x density
  // does not snap to 1px or 2px and make the furniture uneven.
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + w);
  const y1 = Math.ceil(y + h);
  for (let py = y0; py < y1; py++) {
    const cy = Math.min(py + 1, y + h) - Math.max(py, y);
    if (cy <= 0) continue;
    for (let px = x0; px < x1; px++) {
      const cx = Math.min(px + 1, x + w) - Math.max(px, x);
      if (cx <= 0) continue;
      blend(c, px, py, color, cx * cy);
    }
  }
}

/** Anti-aliased thick line, by coverage from the distance to the segment. */
function line(c, ax, ay, bx, by, width, color) {
  const half = width / 2;
  const minX = Math.floor(Math.min(ax, bx) - half - 1);
  const maxX = Math.ceil(Math.max(ax, bx) + half + 1);
  const minY = Math.floor(Math.min(ay, by) - half - 1);
  const maxY = Math.ceil(Math.max(ay, by) + half + 1);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
      const nx = ax + t * dx - cx;
      const ny = ay + t * dy - cy;
      const dist = Math.sqrt(nx * nx + ny * ny);
      blend(c, px, py, color, half + 0.5 - dist);
    }
  }
}

/* ------------------------------------------------------------------ *
 * PNG encoding
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.width, 0);
  ihdr.writeUInt32BE(c.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Filter type 1 (Sub) predicts each byte from the one four bytes back. The
  // artwork is flat colour fields, so most rows compress to almost nothing.
  const stride = c.width * 4;
  const raw = Buffer.alloc((stride + 1) * c.height);
  for (let y = 0; y < c.height; y++) {
    const o = y * (stride + 1);
    raw[o] = 1;
    for (let x = 0; x < stride; x++) {
      const cur = c.px[y * stride + x];
      const left = x >= 4 ? c.px[y * stride + x - 4] : 0;
      raw[o + 1 + x] = (cur - left) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function write(name, c) {
  mkdirSync(ASSETS, { recursive: true });
  const png = encodePng(c);
  writeFileSync(join(ASSETS, name), png);
  console.log(`${name.padEnd(30)} ${c.width}x${c.height}  ${(png.length / 1024).toFixed(1)} KB`);
}

/* ------------------------------------------------------------------ *
 * The grain tile
 * ------------------------------------------------------------------ */

/**
 * A seeded generator, so the committed tile is identical on every machine and
 * a re-run does not show up as a diff.
 */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

/**
 * Paper grain, as one tile the compositor repeats.
 *
 * The web app rasterises an feTurbulence tile and multiplies it over the page.
 * React Native has no blend modes, so the multiply is baked in instead: every
 * pixel is ink, and only the alpha varies. Laid over the paper at low opacity
 * that darkens each pixel by a random amount, which is what multiplying by a
 * greyscale noise field does.
 *
 * Two frequencies, because one does not look like paper. Per-pixel noise alone
 * reads as television static; the low-frequency lattice underneath gives the
 * uneven blotching of a sheet with actual fibre in it. The lattice wraps at the
 * tile edge or the repeat would print a visible grid down the page.
 */
function grainTile(size = 128) {
  const c = canvas(size, size, [...INK, 0]);
  const rand = rng(0x1925);

  const lattice = 16;
  const cells = size / lattice;
  const grid = Array.from({ length: cells }, () =>
    Array.from({ length: cells }, () => rand())
  );
  const at = (gx, gy) => grid[((gy % cells) + cells) % cells][((gx % cells) + cells) % cells];
  const smooth = (t) => t * t * (3 - 2 * t);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / lattice);
      const gy = Math.floor(y / lattice);
      const fx = smooth((x % lattice) / lattice);
      const fy = smooth((y % lattice) / lattice);
      const top = at(gx, gy) * (1 - fx) + at(gx + 1, gy) * fx;
      const bottom = at(gx, gy + 1) * (1 - fx) + at(gx + 1, gy + 1) * fx;
      const mottle = top * (1 - fy) + bottom * fy;

      // Weighted toward the fine grain; the mottle is a slow bias on top.
      const value = rand() * 0.72 + mottle * 0.28;
      const i = (y * size + x) * 4;
      c.px[i + 3] = Math.round(value * 255);
    }
  }
  return c;
}

/* ------------------------------------------------------------------ *
 * The mark
 * ------------------------------------------------------------------ */

/**
 * Four uprights and a diagonal: five corroborating outlets, counted the way
 * the paper counts them.
 *
 * The tally is the one piece of furniture unique to this product, it survives
 * being shrunk to a home-screen icon, and it needs no text — which matters,
 * because nothing here can set type. An attempt at a blackletter "T" drawn
 * from rectangles would be a worse nameplate than no nameplate at all.
 */
function tally(c, cx, cy, w, h, stroke, color) {
  const gap = w / 3.6;
  // Centre on the uprights, not on `w`. The uprights only occupy 3 gaps of the
  // width and the slash overhangs to the right, so centring the bounding box
  // instead left the whole group sitting visibly left of the page centre.
  const x0 = cx - (3 * gap) / 2;
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * gap;
    line(c, x, cy - h / 2, x, cy + h / 2, stroke, color);
  }
  line(c, x0 - stroke * 0.5, cy + h / 2.35, x0 + 3 * gap + stroke * 0.5, cy - h / 2.35, stroke, color);
}

/**
 * The launcher icon: a broadsheet page, cropped.
 *
 * Squeezing a whole front page into 1024px leaves headline bars a couple of
 * pixels tall, which at 48px on a home screen turn into grey mush. So the icon
 * shows the top of the page only — the rules that frame a nameplate, the tally
 * beneath them — at a scale where every element survives.
 */
function iconArt(size, { bleed = true, inkOnly = false } = {}) {
  const ground = inkOnly ? [...INK, 0] : PAPER;
  const c = canvas(size, size, ground);
  const u = size / 100;
  const ink = inkOnly ? INK : INK;
  const accent = inkOnly ? INK : ACCENT;

  // Padding: the adaptive-icon foreground is masked and may be scaled up, so
  // its content has to sit inside the safe circle rather than near the edge.
  const pad = bleed ? 13 * u : 24 * u;
  const left = pad;
  const right = size - pad;

  // The double rule over a nameplate: heavy over light, as in .rule-double.
  rect(c, left, pad + 4 * u, right - left, 3.2 * u, ink);
  rect(c, left, pad + 10 * u, right - left, 1.1 * u, ink);

  // The nameplate itself, as a solid block of ink. Reversed-out type is beyond
  // this script, and a filled slug reads as a masthead at any size.
  rect(c, left, pad + 15 * u, right - left, 13 * u, ink);

  // The rule under the nameplate, then the tally in accent.
  rect(c, left, pad + 32 * u, right - left, 1.6 * u, ink);

  // The tally sits in the well between the nameplate rule and the foot rules.
  // Sized to clear both: the uprights crossing a rule read as a misprint.
  const spanW = right - left;
  tally(c, size / 2, pad + 47 * u, spanW * 0.58, spanW * 0.29, 3.1 * u, accent);

  // Two column rules at the foot, so the mark reads as a printed page and not
  // just a diagram of a tally.
  rect(c, left, size - pad - 11 * u, spanW * 0.44, 1.4 * u, ink);
  rect(c, left + spanW * 0.56, size - pad - 11 * u, spanW * 0.44, 1.4 * u, ink);
  rect(c, left, size - pad - 5 * u, spanW, 2.6 * u, ink);

  return c;
}

/** The splash: the tally alone, centred, on bare paper. */
function splashArt(size) {
  const c = canvas(size, size, [...PAPER, 0]);
  const u = size / 100;
  rect(c, 8 * u, 26 * u, 84 * u, 2.8 * u, INK);
  rect(c, 8 * u, 31 * u, 84 * u, 1 * u, INK);
  tally(c, size / 2, 52 * u, 56 * u, 30 * u, 2.9 * u, ACCENT);
  rect(c, 8 * u, 70 * u, 84 * u, 1 * u, INK);
  rect(c, 8 * u, 72.5 * u, 84 * u, 2.8 * u, INK);
  return c;
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

write("grain.png", grainTile(128));
write("icon.png", iconArt(1024));
write("android-icon-foreground.png", iconArt(1024, { bleed: false }));
write("android-icon-monochrome.png", iconArt(1024, { bleed: false, inkOnly: true }));
write("android-icon-background.png", canvas(1024, 1024, PAPER));
write("splash-icon.png", splashArt(512));
write("favicon.png", iconArt(64));
