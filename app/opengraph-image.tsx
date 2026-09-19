import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDigest } from "@/lib/digest";

/**
 * The card a link to the paper unfurls into.
 *
 * Every page has declared `twitter:card = summary_large_image` since the
 * metadata work, and supplied no image — which is the weakest state available:
 * the card reserves a large slot and shows nothing at all. A link to a
 * newspaper should look like the newspaper.
 *
 * WHY THE FONTS ARE COMMITTED RATHER THAN REUSED
 *
 * `ImageResponse` does not inherit `next/font`. It takes font *data*, and its
 * reference is explicit that only ttf, otf and woff are understood — while
 * next/font caches Google Fonts as woff2, so there is nothing in .next to
 * borrow. Without supplied data the card renders in a default sans, which on a
 * 1925 broadsheet is not a small loss: the nameplate IS the brand.
 *
 * So two faces are committed under assets/fonts, taken from the upstream
 * google/fonts repository with their OFL licences alongside, which that licence
 * permits and requires. Both are the static cut rather than the variable one —
 * satori, which renders these, treats a variable font as its default instance,
 * and a blackletter nameplate is not something to leave to chance.
 *
 * Libre Franklin, the paper's furniture face, is published only as a variable
 * file. Rather than gamble on it the card is set entirely in Caslon and
 * blackletter, which is what the sheet's own masthead does anyway.
 */

export const alt = "The AI Daily — one edition a day, deduplicated and set in type";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONTS = join(process.cwd(), "assets", "fonts");
const [mast, display] = await Promise.all([
  readFile(join(FONTS, "UnifrakturMaguntia-Book.ttf")),
  readFile(join(FONTS, "LibreCaslonDisplay-Regular.ttf")),
]);

/** The paper's own tokens. Day edition — a share card has no night. */
const PAPER = "#e7d9bb";
const INK = "#2b1f12";
const INK_SOFT = "#5c4830";
const RULE = "#a68f68";
const ACCENT = "#8b2e1f";

export default async function Image() {
  const digest = getDigest();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: PAPER,
          color: INK,
          padding: "56px 72px",
        }}
      >
        {/* The heavy rule that opens a broadsheet. Two borders, as on the page. */}
        <div style={{ display: "flex", width: "100%", height: 6, background: INK }} />
        <div
          style={{
            display: "flex",
            width: "100%",
            height: 2,
            background: INK,
            marginTop: 5,
          }}
        />

        <div
          style={{
            display: "flex",
            fontFamily: "Mast",
            fontSize: 132,
            lineHeight: 1,
            marginTop: 44,
          }}
        >
          The AI Daily
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "Display",
            fontSize: 30,
            color: INK_SOFT,
            marginTop: 30,
            textAlign: "center",
          }}
        >
          Everything that mattered in artificial intelligence this morning
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            height: 1,
            background: RULE,
            marginTop: 44,
          }}
        />

        {/*
          The three figures the paper leads with, which are also the only
          claim no rival can print: the wire read, and what survived it.
        */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: 26,
            marginTop: 34,
            fontFamily: "Display",
            fontSize: 30,
            color: INK_SOFT,
          }}
        >
          <span style={{ color: ACCENT }}>{digest.totalItems.toLocaleString("en-GB")}</span>
          <span>items read</span>
          <span style={{ color: RULE }}>·</span>
          <span style={{ color: ACCENT }}>{digest.stories.length}</span>
          <span>columns printed</span>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            width: "100%",
            justifyContent: "space-between",
            fontFamily: "Display",
            fontSize: 22,
            color: INK_SOFT,
          }}
        >
          <span>No. {digest.edition}</span>
          <span>Two cent edition</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Mast", data: mast, style: "normal", weight: 400 },
        { name: "Display", data: display, style: "normal", weight: 400 },
      ],
    }
  );
}
