/**
 * Page-curl geometry.
 *
 * A turning sheet is not a plane that rotates. It leaves the flat page at a
 * fold line, wraps a half-cylinder whose radius is the paper's stiffness, and
 * carries on flat again on the way back — so the portion still on the table,
 * the portion in the bend, and the portion already lifted all sit at different
 * angles at the same moment. That is what this computes.
 *
 *            lifted, flat, face-down
 *        <───────────────────────  ___
 *                                ╱     ╲   ← the bend (radius R)
 *   ────────────────────────────┘       │
 *      flat page, still down        fold x = c
 *
 * Arc length is preserved, so the sheet never stretches: the free edge lands
 * exactly under the reader's hand.
 */

export type CurlSegment = {
  /** CSS transform placing this strip on the bend. */
  transform: string;
  /** Strip width in px. */
  width: number;
  /** 0..1 diffuse lighting — 1 face-on, low when edge-on to the viewer. */
  light: number;
};

export type CurlGeometry = {
  /** Where the sheet leaves the flat plane, at the height it was taken hold of. */
  foldX: number;
  /** Radius of the bend. */
  radius: number;
  /** Arc length consumed by the bend. */
  wrapLen: number;
  /** Length of sheet already lifted flat, beyond the bend. */
  liftedLen: number;
  /** How far off the page the raised sheet floats. */
  liftHeight: number;
  /** Clip for the part of the page still lying flat — a tilted edge, not a box. */
  pageClip: string;
  /** Degrees to rotate the curl rig so the crease leans with the lead corner. */
  rigRotateDeg: number;
  /** Point the rig turns about: on the crease, at the height of the hand. */
  pivot: { x: number; y: number };
  /** Strips approximating the bend. */
  segments: CurlSegment[];
  /** The flat, face-down portion past the bend. */
  lifted: { transform: string; clip: string; light: number };
  /** Soft shadow the raised sheet drops onto the page beneath. */
  shadow: { left: number; width: number; opacity: number };
  /** 0..1 across the whole turn. */
  progress: number;
};

/**
 * How far the crease may lean, as a share of sheet width across the full
 * height. Held to a horizontal offset rather than a fixed angle because these
 * pages are far taller than they are wide — a fixed angle that reads well on a
 * short page slices a tall one in half.
 */
const MAX_LEAN = 0.14;

/**
 * Strips across the bend. These are empty divs — no page content — so they
 * cost almost nothing, and a higher count is what stops the shading on the
 * curve reading as bands rather than a smooth roll.
 */
export const BEND_SEGMENTS = 22;

const smoothstep = (x: number) => x * x * (3 - 2 * x);

export function curlGeometry(
  w: number,
  h: number,
  cursorX: number,
  /** Height at which the sheet was taken hold of; decides which corner leads. */
  grabY = -1
): CurlGeometry | null {
  if (!(w > 0) || !(h > 0)) return null;

  const travel = w - cursorX;
  if (!Number.isFinite(travel) || travel <= 1) return null;

  const progress = Math.min(travel / w, 1);

  // Newsprint is limp but not formless. The bend tightens quickly as the sheet
  // first lifts, then holds a roughly constant radius for the rest of the turn.
  const rMax = w * 0.085;
  const ramp = smoothstep(Math.min(travel / (w * 0.22), 1));
  // The bend can never use more sheet than has actually been pulled, or the
  // paper would stretch and the free edge would lag behind the hand. Early in
  // a turn this is what keeps the lifted corner tight and small.
  const radius = Math.max(
    Math.min(rMax * ramp, travel / Math.PI),
    0.0001
  );

  // Half-cylinder: the bend eats πR of sheet.
  let wrapLen = Math.PI * radius;

  // Place the fold so the free edge finishes under the hand.
  //   freeEdge = c − (w − c − wrapLen) = cursorX  ⇒  c = (cursorX + w − wrapLen)/2
  //
  // Deliberately not clamped at zero: the fold has to be able to run off the
  // left edge, or the bend parks at x=0 and a stub of curl stays on screen
  // after the turn is over.
  const foldX = (cursorX + w - wrapLen) / 2;

  // Near the end of a turn there is less sheet left than the bend would use.
  if (wrapLen > w - foldX) wrapLen = Math.max(w - foldX, 0);
  const liftedLen = Math.max(w - foldX - wrapLen, 0);

  const segments: CurlSegment[] = [];
  const dPhi = Math.PI / BEND_SEGMENTS;
  const segWidth = radius * dPhi;

  for (let i = 0; i < BEND_SEGMENTS; i++) {
    const phi = i * dPhi;
    // Point on the cylinder, tangent to the page at the fold.
    const x = foldX + radius * Math.sin(phi);
    const z = radius * (1 - Math.cos(phi));
    // Negative rotateY tips the strip toward the viewer.
    const deg = (-phi * 180) / Math.PI;

    // Face-on strips catch the light; edge-on ones fall away. The far half is
    // the reverse of the sheet, so it reads very slightly duller.
    const facing = Math.abs(Math.cos(phi));
    const reverse = 1 - 0.12 * (phi / Math.PI);
    // A narrow sheen where the bend turns up into the light. Restrained on
    // purpose: paper catches a soft band, it does not glint.
    const sheen = 0.09 * Math.exp(-Math.pow((phi - 0.38) / 0.3, 2));

    segments.push({
      transform: `translate3d(${x.toFixed(2)}px, 0px, ${z.toFixed(
        2
      )}px) rotateY(${deg.toFixed(2)}deg)`,
      width: segWidth,
      light: Math.min((0.42 + 0.58 * facing) * reverse + sheen, 1),
    });
  }

  // The lifted run: mirror the far end of the sheet back across the fold, then
  // raise it to the top of the bend. translateZ also gives it the slight
  // foreshortening of something genuinely nearer the reader.
  const mirrorShift = 2 * foldX + wrapLen;
  const lifted = {
    transform: `translateZ(${(2 * radius).toFixed(
      2
    )}px) matrix(-1, 0, 0, 1, ${mirrorShift.toFixed(2)}, 0)`,
    clip: `inset(0px 0px 0px ${(foldX + wrapLen).toFixed(2)}px)`,
    light: 0.86,
  };

  // Grab a sheet near one corner and that corner runs ahead while the middle
  // trails — the crease leans instead of standing square. Taken hold of at the
  // centre it stays upright, which is also the fallback when no hand is known.
  const hand = grabY < 0 ? h / 2 : Math.min(Math.max(grabY, 0), h);
  const lean = 1 - (2 * hand) / h;
  const tanLean = (lean * MAX_LEAN * w) / h;

  // The crease runs through (foldX, hand); follow it out to both edges.
  const creaseTop = foldX - hand * tanLean;
  const creaseBottom = foldX + (h - hand) * tanLean;

  const liftShare = Math.min(liftedLen / w, 1);

  return {
    foldX,
    radius,
    wrapLen,
    liftedLen,
    liftHeight: 2 * radius,
    // Keep everything left of the leaning crease.
    pageClip: `polygon(-2px -2px, ${creaseTop.toFixed(
      2
    )}px -2px, ${creaseBottom.toFixed(2)}px ${(h + 2).toFixed(2)}px, -2px ${(
      h + 2
    ).toFixed(2)}px)`,
    rigRotateDeg: (-Math.atan(tanLean) * 180) / Math.PI,
    pivot: { x: foldX, y: hand },
    segments,
    lifted,
    shadow: {
      left: Math.max(foldX - liftedLen, -w),
      width: liftedLen + wrapLen,
      // Wide and soft while the sheet stands high; drawing tighter and darker
      // as it settles back down onto the page beneath.
      opacity: Math.min((0.36 - 0.15 * liftShare) * (ramp * 1.4), 0.36),
    },
    progress,
  };
}
