import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getArchivedStory, getPrerenderedStoryIds } from "@/lib/archive";
import { formatEditionDate } from "@/lib/digest";

/**
 * A shared column, set as a clipping from the paper it came out of.
 *
 * See app/opengraph-image.tsx for why the faces are committed rather than
 * borrowed from next/font: ImageResponse takes font data and understands only
 * ttf, otf and woff, while next/font caches woff2.
 *
 * Read through lib/archive.ts rather than lib/digest.ts, so a link to any of
 * the 237 columns the paper has printed unfurls — not only the 54 on the press
 * this morning. A card that worked for a day and then went blank would be a
 * quieter version of the 404 the archive work was done to fix.
 */

export const alt = "A column from The AI Daily";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The same window the story pages prerender.
 *
 * Without this the build would render a card for every id the archive holds,
 * and the count grows by fifty-four every morning. Sharing an older column
 * still works — the route generates it on request and it is cached from then
 * on, exactly as the page itself is.
 */
export function generateStaticParams() {
  return getPrerenderedStoryIds().map((id) => ({ id }));
}

const FONTS = join(process.cwd(), "assets", "fonts");
const [mast, display] = await Promise.all([
  readFile(join(FONTS, "UnifrakturMaguntia-Book.ttf")),
  readFile(join(FONTS, "LibreCaslonDisplay-Regular.ttf")),
]);

const PAPER = "#e7d9bb";
const INK = "#2b1f12";
const INK_SOFT = "#5c4830";
const INK_FAINT = "#8a7454";
const RULE = "#a68f68";
const ACCENT = "#8b2e1f";

/**
 * A headline set the way the page sets it: stepped down as it grows.
 *
 * Wire headlines run far longer than a sub-editor's, and a fixed size turns
 * one of them into six lines of banner type inside a 630px card. The same
 * judgement `leadSize` makes in components/stories.tsx, at card scale.
 */
function headlineSize(headline: string): number {
  const n = headline.length;
  if (n <= 40) return 76;
  if (n <= 70) return 62;
  if (n <= 100) return 52;
  return 44;
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = getArchivedStory(id);

  const headline = found?.story.headline ?? "The AI Daily";
  const section = found?.story.section ?? "";
  const outlets = found?.story.sources.length ?? 0;
  /*
   * The standfirst, trimmed. `Story.deck` is already a hard 240-character
   * slice of the publisher's own, and about half of them land mid-sentence —
   * the same reason the spoken bulletin cuts back to the last full stop. On a
   * card there is no voice to stammer, but a sentence that stops dead still
   * reads as a fault, so it is cut at the last one that finished.
   */
  const raw = found?.story.deck ?? "";
  const lastStop = raw.lastIndexOf(". ");
  const deck =
    raw.length > 150 && lastStop > 60 ? raw.slice(0, lastStop + 1) : raw;
  const printed = found ? formatEditionDate(found.date) : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          color: INK,
          padding: "48px 68px 44px",
        }}
      >
        {/* The nameplate, small, the way a clipping carries its masthead. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <span style={{ display: "flex", fontFamily: "Mast", fontSize: 40 }}>
            The AI Daily
          </span>
          <span
            style={{
              display: "flex",
              fontFamily: "Display",
              fontSize: 21,
              color: INK_FAINT,
            }}
          >
            {printed}
          </span>
        </div>

        <div style={{ display: "flex", width: "100%", height: 4, background: INK, marginTop: 14 }} />
        <div style={{ display: "flex", width: "100%", height: 1, background: INK, marginTop: 4 }} />

        {section ? (
          <div
            style={{
              display: "flex",
              fontFamily: "Display",
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: ACCENT,
              marginTop: 34,
            }}
          >
            {section}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            fontFamily: "Display",
            fontSize: headlineSize(headline),
            lineHeight: 1.06,
            marginTop: 16,
            // Four lines at the smallest step still clears the rule below.
            maxHeight: 220,
            overflow: "hidden",
          }}
        >
          {headline}
        </div>

        {deck ? (
          <div
            style={{
              display: "flex",
              fontFamily: "Display",
              fontSize: 27,
              lineHeight: 1.36,
              color: INK_SOFT,
              marginTop: 24,
              maxHeight: 150,
              overflow: "hidden",
            }}
          >
            {deck}
          </div>
        ) : null}

        <div style={{ display: "flex", marginTop: "auto", flexDirection: "column" }}>
          <div style={{ display: "flex", width: "100%", height: 1, background: RULE }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 18,
              fontFamily: "Display",
              fontSize: 22,
              color: INK_SOFT,
            }}
          >
            {/*
              Tally marks, drawn rather than imported: one stroke per outlet
              that carried it independently, which is the paper's own way of
              showing corroboration and the reason the number is worth putting
              on a card at all.
            */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
                {Array.from({ length: Math.min(outlets, 10) }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      width: 3,
                      height: 22,
                      background: ACCENT,
                    }}
                  />
                ))}
              </div>
              <span>
                {outlets === 1 ? "1 outlet" : `${outlets} outlets`}
              </span>
            </div>
            <span style={{ color: INK_FAINT }}>Two cent edition</span>
          </div>
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
