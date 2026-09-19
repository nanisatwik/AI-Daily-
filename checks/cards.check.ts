/**
 * The share cards can still find their type.
 *
 * `ImageResponse` does not inherit `next/font`. It takes font data, and its
 * reference is explicit that only ttf, otf and woff are understood — while
 * next/font caches Google Fonts as woff2. So the two faces the cards are set
 * in are committed under assets/fonts, and if either goes missing, or is
 * swapped for the woff2 that is lying around in .next, the cards fall back to
 * a default sans and a 1925 newspaper starts sharing itself in Helvetica.
 *
 * The build does catch a missing file — `readFile` throws — but it throws at
 * module scope inside an image route, which is a confusing place to read a
 * stack trace from. This says it plainly instead.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The repository root, so this runs on any machine and on a CI runner. */
const REPO = fileURLToPath(new URL("..", import.meta.url));

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => {
  if (!c) fails.push(`${n} — ${d}`);
};

/** The faces the cards name, and the licence each one travels with. */
const FACES = [
  ["UnifrakturMaguntia-Book.ttf", "OFL-UnifrakturMaguntia.txt"],
  ["LibreCaslonDisplay-Regular.ttf", "OFL-LibreCaslonDisplay.txt"],
];

for (const [font, licence] of FACES) {
  const path = `${REPO}assets/fonts/${font}`;
  ok(`present.${font}`, existsSync(path), "the card cannot be set without it");
  if (!existsSync(path)) continue;

  /*
   * The first four bytes. A TrueType file opens 0x00010000 and an OpenType one
   * opens "OTTO"; woff2 opens "wOF2" and is the thing that must not be here,
   * because it is what next/font leaves lying about and is the obvious wrong
   * file to reach for.
   */
  const head = readFileSync(path).subarray(0, 4);
  const magic = head.toString("hex");
  const tag = head.toString("latin1");
  ok(
    `format.${font}`,
    magic === "00010000" || tag === "OTTO" || tag === "wOFF",
    `starts with ${tag === "wOF2" ? "wOF2 — that is woff2, which ImageResponse cannot read" : magic}`
  );

  /*
   * The Open Font Licence permits redistribution and requires the licence
   * travel with the font. Committing the face and dropping the licence is the
   * one way this becomes a legal problem rather than a technical one.
   */
  ok(
    `licence.${font}`,
    existsSync(`${REPO}assets/fonts/${licence}`),
    "OFL requires the licence be distributed with the font"
  );
}

/* -- and the routes that use them still exist -------------------------- */
for (const route of [
  "app/opengraph-image.tsx",
  "app/story/[id]/opengraph-image.tsx",
]) {
  const path = `${REPO}${route}`;
  ok(`route.${route}`, existsSync(path));
  if (!existsSync(path)) continue;
  const src = readFileSync(path, "utf8");
  ok(
    `route.${route}.usesTheFaces`,
    src.includes("UnifrakturMaguntia") && src.includes("LibreCaslonDisplay"),
    "a card that names neither face is set in the default sans"
  );
  ok(
    `route.${route}.declaresSize`,
    /export const size = \{ width: 1200, height: 630 \}/.test(src),
    "1200x630 is what a large summary card expects"
  );
}

/*
 * The story card reads the archive, not today's edition. A card built from
 * lib/digest.ts would unfurl for a day and then go blank — a quieter version
 * of the 404 the archive work was done to remove.
 */
{
  const src = readFileSync(`${REPO}app/story/[id]/opengraph-image.tsx`, "utf8");
  ok(
    "story.readsTheArchive",
    src.includes("getArchivedStory"),
    "the card must resolve any column ever printed, not only this morning's"
  );
  ok(
    "story.boundsTheBuild",
    src.includes("getPrerenderedStoryIds"),
    "without a window the build renders a card for every id, and that grows by 54 a morning"
  );
}

console.log(
  fails.length
    ? `CARD CHECKS FAILED (${fails.length}):\n  ${fails.join("\n  ")}`
    : `ALL CARD CHECKS PASSED — ${FACES.length} faces committed with their licences`
);
process.exitCode = fails.length ? 1 : 0;
