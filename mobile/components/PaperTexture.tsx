import { useMemo } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { GRAIN_OPACITY } from "../theme/tokens";

const grain = require("../assets/grain.png");

/** The tile's intrinsic size, and the figure `scripts/make-assets.mjs` writes. */
const TILE = 128;

/**
 * Paper grain, as one tile repeated over the sheet.
 *
 * The tile is laid out by hand instead of with `resizeMode="repeat"`. React
 * Native's own type documentation still marks that mode "(iOS only)" in 0.86,
 * and this has to look the same on Android, so relying on it would mean either
 * a platform branch or a texture that silently vanishes on half the installs.
 * A wrapping flex row of fixed-size tiles is laid out by the same engine on
 * both platforms.
 *
 * The cost is a view per tile — around thirty on a phone. They are static: the
 * layer never re-renders, because its only input is the window size, and the
 * one decoded bitmap is shared by every tile. That is the same bargain the web
 * app strikes in `.paper-grain`, which repeats a rasterised tile rather than
 * running a live noise filter over the viewport.
 *
 * Absent from this, and present on the web: the radial vignette. There is no
 * radial gradient in React Native without drawing an SVG over the whole screen
 * every frame, which is precisely the cost the web app's own comments describe
 * paying down. The grain is what reads as paper; the vignette was seasoning.
 */
export default function PaperTexture() {
  const { width, height } = useWindowDimensions();

  const grid = useMemo(() => {
    const across = Math.ceil(width / TILE);
    const down = Math.ceil(height / TILE);
    return {
      across,
      down,
      /*
       * The grid is sized to whole tiles and allowed to overhang the screen.
       *
       * It was previously stretched to the screen's own width and left to wrap,
       * which is wrong wherever the width is not a multiple of the tile: at
       * 375pt only two 128pt tiles fit on a row, so the third wrapped to the
       * next line and left a 119pt column of ungrained paper down the right
       * edge — plainly visible as a vertical seam, because the grain darkens
       * the sheet slightly and that strip stayed light. Giving the row its full
       * `across * TILE` keeps every tile on the row it belongs to; the clipping
       * parent hides the overhang.
       */
      width: across * TILE,
      height: down * TILE,
      tiles: Array.from({ length: across * down }, (_, i) => i),
    };
  }, [width, height]);

  return (
    <View style={styles.clip}>
      <View style={[styles.grid, { width: grid.width, height: grid.height }]}>
        {grid.tiles.map((i) => (
          <Image key={i} source={grain} style={styles.tile} fadeDuration={0} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    // `absoluteFillObject` is gone in React Native 0.86; `absoluteFill` is now
    // the plain object rather than a registered style id, so it spreads.
    ...StyleSheet.absoluteFill,
    // Trims the overhanging row and column. Views clip by default on Android
    // but not on iOS, so this is not redundant.
    overflow: "hidden",
    opacity: GRAIN_OPACITY,
    // A style, not the `pointerEvents` prop: the prop is deprecated in React
    // Native 0.86 and warns on every render. Without it this layer sits over
    // the whole page and swallows every tap.
    pointerEvents: "none",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tile: {
    width: TILE,
    height: TILE,
  },
});
