/**
 * App icons, drawn from the newspaper's own palette.
 *
 * Pure geometry, no webfont: the masthead's blackletter is unreadable at 48px
 * and the generator has no access to it anyway. A folded sheet with column
 * rules and one accent line reads as a newspaper at every size.
 *
 *   node services/icons/generate.ts
 */

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "public", "icons");

const PAPER = "#e7d9bb";
const INK = "#2b1f12";
const ACCENT = "#8b2e1f";
const RULE = "#a68f68";

/**
 * `bleed` fills the whole square for maskable icons, which Android crops to
 * a circle; the safe zone is the middle 80%.
 */
function sheet(size: number, bleed: boolean): string {
  const pad = bleed ? size * 0.14 : size * 0.06;
  const w = size - pad * 2;
  const h = size - pad * 2;
  const x = pad;
  const y = pad;

  // Column rules, skipping the band where the masthead sits.
  const rules: string[] = [];
  const top = y + h * 0.34;
  const gap = h * 0.082;
  for (let i = 0; i < 7; i++) {
    const ry = top + i * gap;
    if (ry > y + h - pad * 0.5) break;
    const short = i % 3 === 2;
    rules.push(
      `<rect x="${x + w * 0.14}" y="${ry}" width="${w * (short ? 0.44 : 0.72)}" height="${Math.max(size * 0.016, 1)}" fill="${RULE}" opacity="0.75"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bleed ? INK : "none"}"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK}" stroke-width="${size * 0.026}"/>
  <rect x="${x + w * 0.14}" y="${y + h * 0.14}" width="${w * 0.72}" height="${size * 0.022}" fill="${INK}"/>
  <rect x="${x + w * 0.14}" y="${y + h * 0.21}" width="${w * 0.72}" height="${size * 0.055}" fill="${INK}"/>
  <rect x="${x + w * 0.14}" y="${y + h * 0.285}" width="${w * 0.3}" height="${size * 0.02}" fill="${ACCENT}"/>
  ${rules.join("\n  ")}
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, bleed: false },
  { file: "icon-512.png", size: 512, bleed: false },
  { file: "icon-maskable-192.png", size: 192, bleed: true },
  { file: "icon-maskable-512.png", size: 512, bleed: true },
  // iOS ignores the manifest and uses this one; it must not be transparent.
  { file: "apple-touch-icon.png", size: 180, bleed: true },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const t of TARGETS) {
    const svg = sheet(t.size, t.bleed);
    await sharp(Buffer.from(svg)).png().toFile(join(OUT, t.file));
    console.log(`  ${t.file.padEnd(26)} ${t.size}x${t.size}${t.bleed ? "  maskable" : ""}`);
  }

  // Keep the source around so the icon can be re-cut at other sizes.
  await writeFile(join(OUT, "icon.svg"), sheet(512, false), "utf8");
  console.log(`\nWrote ${TARGETS.length + 1} files to public/icons`);
}

/** Only when this file is the thing node was asked to run; see checks/services.check.ts. */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Icon generation failed:", err);
    process.exit(1);
  });
}
