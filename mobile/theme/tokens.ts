/**
 * The press's ink and paper, transcribed from the web app's `app/globals.css`.
 *
 * These values are the product, not a theme — the owner's position is that the
 * look is the thing being sold. So they are copied exactly rather than
 * approximated, and if the web app's `:root` block changes these have to change
 * with it. There is no shared package to import from: the web app is a Next
 * build with its own dependency tree, and reaching across to it would couple
 * this project's bundler to that one for six colours.
 *
 * The night palette is deliberately absent. The web app has one; this does not
 * yet, and half a dark mode — furniture that flips, SVG tallies that do not —
 * would look broken rather than unfinished.
 */

export const ink = {
  /** Body text, rules, the nameplate. */
  ink: "#2b1f12",
  /** Decks and secondary copy. */
  soft: "#5c4830",
  /** Metadata: datelines, source counts, section labels. */
  faint: "#8a7454",
  /** Hairlines between stories. Lighter than ink, on purpose. */
  rule: "#a68f68",
  /** The second colour a 1925 press could run: tally marks, kickers, initials. */
  accent: "#8b2e1f",
} as const;

export const paper = {
  /** The sheet. */
  base: "#e7d9bb",
  /** The stack of pages under it, and anything recessed. */
  deep: "#dcc9a4",
} as const;

/**
 * Opacity of the grain tile laid over the paper.
 *
 * The web app uses 0.16 with `mix-blend-mode: multiply`. React Native has no
 * blend modes, so the tile is pre-multiplied — pure ink with a noise alpha —
 * and composited normally. Straight alpha darkens harder than multiply does at
 * the same figure, so this is tuned down by eye rather than copied across.
 */
export const GRAIN_OPACITY = 0.1;

export const type = {
  mast: "UnifrakturMaguntia_400Regular",
  /** Display cut. Large headlines only; it has no bold and needs none. */
  display: "LibreCaslonDisplay_400Regular",
  body: "LibreCaslonText_400Regular",
  bodyItalic: "LibreCaslonText_400Regular_Italic",
  /** Text cut, bold. What smaller headlines are set in, as in a real paper. */
  bodyBold: "LibreCaslonText_700Bold",
  label: "LibreFranklin_500Medium",
  labelBold: "LibreFranklin_600SemiBold",
} as const;

/** The column measure: the page's horizontal margin, in points. */
export const GUTTER = 20;
