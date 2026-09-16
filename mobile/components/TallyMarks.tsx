import { memo } from "react";
import Svg, { Line } from "react-native-svg";
import { ink } from "../theme/tokens";

/**
 * The corroboration count, in tally marks.
 *
 * A direct port of `TallyMarks` in the web app's `components/stories.tsx`,
 * geometry and all: four uprights on a 5px pitch with the fifth struck through
 * them diagonally, groups 24px apart. This is not decoration. Independent
 * outlets choosing to cover the same event is the strongest signal the
 * pipeline has that a story mattered, it is what the ranking is built on, and
 * the marks are how the paper shows it. Five outlets has to read as a closed
 * gate of five, and four as four.
 *
 * Where the web app wraps each group of five in a `<g transform="translate()">`,
 * this adds the group's offset into the coordinates. Every transform prop in
 * react-native-svg 15 is deprecated in favour of a `transform` prop with its
 * own shorthand, and the arithmetic is one addition — not worth taking on an
 * API that is mid-migration for.
 */
export const TallyMarks = memo(function TallyMarks({
  count,
  color = ink.accent,
  height = 14,
}: {
  count: number;
  color?: string;
  height?: number;
}) {
  // Counts arrive from a JSON payload; a negative or fractional one would draw
  // a nonsense number of strokes rather than failing visibly.
  const safe = Math.max(0, Math.floor(count));
  const groups = Math.floor(safe / 5);
  const remainder = safe % 5;

  const GROUP_WIDTH = 24;
  const width = groups * GROUP_WIDTH + (remainder > 0 ? remainder * 5 + 3 : 0);
  // A count of zero still reserves a sliver, so a byline with no sources does
  // not shift its text left out of line with every other byline on the page.
  const viewWidth = Math.max(width, 8);

  const uprights: number[] = [];
  const gates: number[] = [];

  for (let g = 0; g < groups; g++) {
    const offset = g * GROUP_WIDTH;
    for (const x of [2, 7, 12, 17]) uprights.push(offset + x);
    gates.push(offset);
  }
  for (let i = 0; i < remainder; i++) {
    uprights.push(groups * GROUP_WIDTH + 2 + i * 5);
  }

  return (
    <Svg
      // The viewBox is 20 units tall; scaling the frame by the same ratio keeps
      // the strokes at the weight the web app draws them, at any height.
      width={(viewWidth * height) / 20}
      height={height}
      viewBox={`0 0 ${viewWidth} 20`}
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
    >
      {uprights.map((x) => (
        <Line key={`u${x}`} x1={x} y1={3} x2={x} y2={17} />
      ))}
      {gates.map((offset) => (
        <Line key={`g${offset}`} x1={offset} y1={16} x2={offset + 19} y2={4} />
      ))}
    </Svg>
  );
});
