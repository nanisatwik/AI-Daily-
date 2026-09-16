import { StyleSheet } from "react-native";
import { ink, type } from "./tokens";

/**
 * The type classes from `app/globals.css`, as stylesheets.
 *
 * One deliberate departure: body copy is set ragged right, where the web app
 * justifies it. The web app can justify because it also sets `hyphens: auto`,
 * and CSS gives it a hyphenation dictionary; React Native has no hyphenation at
 * all. Justifying a 335pt phone column without it opens rivers of white space
 * between words — three or four to a line in Caslon, which is worse than an
 * uneven right edge. Broadsheets justified because they had both a hyphenating
 * compositor and a wide measure. We have neither, so we keep the rag.
 */
export const t = StyleSheet.create({
  /** Section labels and buttons: Franklin, letterspaced, caps. */
  kicker: {
    fontFamily: type.labelBold,
    fontSize: 11,
    letterSpacing: 1.65,
    textTransform: "uppercase",
    color: ink.ink,
  },

  /** Datelines, source counts, anything in the margins. */
  meta: {
    fontFamily: type.label,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: ink.faint,
  },

  /** Smaller headlines take the text cut, bold. Size is set per use. */
  headline: {
    fontFamily: type.bodyBold,
    color: ink.ink,
  },

  /** Large headlines take the display cut, uppercase, no synthetic weight. */
  headlineCaps: {
    fontFamily: type.display,
    textTransform: "uppercase",
    letterSpacing: 0.2,
    color: ink.ink,
  },

  /** The standfirst under a headline. */
  deck: {
    fontFamily: type.bodyItalic,
    color: ink.soft,
    fontSize: 16,
    lineHeight: 23,
  },

  /** Running text. */
  prose: {
    fontFamily: type.body,
    color: ink.ink,
    fontSize: 16.5,
    lineHeight: 27.5,
  },
});

/**
 * Wire headlines run far longer than a sub-editor's would, and a fixed size
 * turns them into six lines of banner type. Step the scale down as they grow,
 * the way a compositor fits a headline to its column.
 *
 * The web app does this with `clamp()` against the viewport. Here the measure
 * is the phone's width, which barely varies, so the length of the headline is
 * the only input worth having and the breakpoints are the web app's own.
 */
export function leadSize(headline: string): { fontSize: number; lineHeight: number } {
  const n = headline.length;
  const size = n <= 38 ? 40 : n <= 62 ? 33 : n <= 88 ? 27 : 23;
  // 1.03 is the web app's line-height for display caps; capitals have no
  // descenders to clear, so anything looser reads as a gap rather than leading.
  return { fontSize: size, lineHeight: Math.round(size * 1.06) };
}
