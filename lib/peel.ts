/**
 * Geometry for a paper page-peel.
 *
 * Grabbing a sheet at point A and moving your hand to point P folds the sheet
 * over a crease that is the perpendicular bisector of A→P. Everything on A's
 * side of that crease lifts and mirrors across it; everything beyond it lies
 * flat. That is the whole model — no rotation, just a reflection and two
 * complementary clips.
 */

export type PeelPoint = { ax: number; ay: number; px: number; py: number };

export type PeelGeometry = {
  /** Clip for the part of the sheet still lying flat. */
  pageClip: string;
  /** Clip for the lifted corner, applied before the mirror transform. */
  flapClip: string;
  /** CSS matrix mirroring the lifted corner across the crease. */
  flapTransform: string;
  /** Angle of the crease in degrees, for orienting shadow gradients. */
  creaseAngle: number;
  /** 0 → untouched, 1 → the crease has run off the far edge. */
  progress: number;
};

/**
 * A fold expressed as transforms only, for driving the DOM.
 *
 * `pageClip` and `flapClip` above are honest descriptions of the two halves,
 * but writing them to `clip-path` every frame repaints whatever they clip — and
 * what they clip here is a whole newspaper page, some four hundred and seventy
 * nodes of type. Removing every layout-dirtying write from the previous rig
 * bought nothing, which is what pointed at the repaint rather than the
 * transforms.
 *
 * A crease is a straight line, so neither clip needs a path. A box with
 * `overflow: clip` rotated to the crease and pushed so that one edge lies along
 * it is the same half-plane, and the content inside carries the exact inverse
 * so it does not move on screen. Everything then rides on `transform`, which
 * the compositor applies without asking anyone to paint.
 */
export type PeelLayers = {
  /** Places the clip box's leading edge on the crease. Both boxes share it. */
  clip: string;
  /** Inverse of `clip`: holds the flat page still while its clip moves. */
  page: string;
  /** Inverse of `clip`, then the mirror — the lifted flap. */
  flap: string;
  /** Angle of the crease in degrees. */
  creaseAngle: number;
  /** Distance from the grabbed point to the hand, in px. */
  span: number;
  /** 0 → untouched, 1 → the crease has run off the far edge. */
  progress: number;
};

type Pt = [number, number];

/**
 * The crease: a unit normal pointing from the grabbed point toward the hand,
 * and how far along it the fold line sits.
 *
 * Both the polygons and the layer transforms read the fold from here, so there
 * is only ever one derivation to be wrong about — and the numeric check that
 * compares the two is comparing two uses of the same three lines rather than
 * two guesses at the same geometry.
 */
function creaseOf(p: PeelPoint) {
  const dx = p.px - p.ax;
  const dy = p.py - p.ay;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 2) return null;

  const nx = dx / len;
  const ny = dy / len;

  // The crease sits halfway between the two.
  const k = ((p.ax + p.px) / 2) * nx + ((p.ay + p.py) / 2) * ny;

  return { nx, ny, k, len };
}

/** Sutherland–Hodgman clip of a rectangle against the half-plane n·x ≥ k. */
function clipRect(
  w: number,
  h: number,
  nx: number,
  ny: number,
  k: number,
  keepAbove: boolean
): Pt[] {
  const corners: Pt[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const signed = (p: Pt) => p[0] * nx + p[1] * ny - k;
  const inside = (p: Pt) => (keepAbove ? signed(p) >= 0 : signed(p) <= 0);

  const out: Pt[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const aIn = inside(a);
    const bIn = inside(b);

    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const da = signed(a);
      const db = signed(b);
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

function toPolygon(pts: Pt[]): string {
  if (pts.length < 3) return "polygon(0 0, 0 0, 0 0)";
  return `polygon(${pts
    .map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`)
    .join(", ")})`;
}

export function peelGeometry(
  w: number,
  h: number,
  p: PeelPoint
): PeelGeometry | null {
  if (!(w > 0) || !(h > 0)) return null;

  const line = creaseOf(p);
  if (!line) return null;
  const { nx, ny, k, len } = line;

  const flat = clipRect(w, h, nx, ny, k, true);
  const lifted = clipRect(w, h, nx, ny, k, false);

  // Mirror across n·x = k.
  const a = 1 - 2 * nx * nx;
  const b = -2 * nx * ny;
  const c = -2 * nx * ny;
  const d = 1 - 2 * ny * ny;
  const e = 2 * k * nx;
  const f = 2 * k * ny;

  // Progress is measured against the sheet's width, not its diagonal. These
  // pages scroll and can be several thousand pixels tall, so a diagonal-based
  // measure would demand an absurdly long drag to turn one page.
  const progress = Math.min(len / w, 1);

  return {
    pageClip: toPolygon(flat),
    flapClip: toPolygon(lifted),
    flapTransform: `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(
      5
    )}, ${d.toFixed(5)}, ${e.toFixed(2)}, ${f.toFixed(2)})`,
    creaseAngle: (Math.atan2(ny, nx) * 180) / Math.PI,
    progress,
  };
}

/** Rotations to eight decimals, offsets to four: see the note in peelLayers. */
const rot = (n: number) => n.toFixed(8);
const off = (n: number) => n.toFixed(4);

/**
 * The same fold as `peelGeometry`, as transforms for a pair of clip boxes.
 *
 * Both boxes are the sheet's own size with `overflow: clip` widened by
 * `margin`, so their clip rect runs from −margin to size+margin. `clip` turns
 * that rect to the crease and slides it until its leading edge — local
 * x = −margin — lies exactly along the fold line, pointing away from the
 * grabbed corner. What survives is the half-plane of sheet still lying flat.
 *
 * `page` is `clip` inverted, so the page inside is dragged back to precisely
 * where it was: the clip sweeps across it and not one glyph moves.
 *
 * `flap` is that same inverse with a mirror about the box's leading edge, which
 * in the box's own frame is all a reflection in the crease amounts to. The
 * lifted corner therefore lands under the hand for the same reason
 * `flapTransform` does, and lands inside the same clip box — so the fold needs
 * one box orientation, not two.
 *
 * `margin` must be at least the sheet's diagonal for the box to still cover the
 * sheet when the crease lies across a corner. The check asserts it.
 */
export function peelLayers(
  w: number,
  h: number,
  p: PeelPoint,
  margin: number
): PeelLayers | null {
  if (!(w > 0) || !(h > 0)) return null;

  const line = creaseOf(p);
  if (!line) return null;
  const { nx, ny, k, len } = line;

  const m = margin > 0 ? margin : 0;

  // Along the crease the box is centred on the sheet's middle rather than on
  // the origin. A fold near a far corner otherwise spends half its box off in
  // the empty quadrant and runs short at the end it needs.
  const mid = -ny * (w / 2) + nx * (h / 2);
  const s = mid - h / 2;

  return {
    clip: `matrix(${rot(nx)}, ${rot(ny)}, ${rot(-ny)}, ${rot(nx)}, ${off(
      (k + m) * nx - s * ny
    )}, ${off((k + m) * ny + s * nx)})`,
    /**
     * Offsets are carried to four decimals and the rotation to eight because
     * these two strings have to compose to the identity. Rounding them to the
     * hundredth of a pixel the polygons use would leave the page jittering by
     * a residual that changes every frame, which is exactly the shimmer the
     * whole technique exists to avoid.
     */
    page: `matrix(${rot(nx)}, ${rot(-ny)}, ${rot(ny)}, ${rot(nx)}, ${off(
      -(k + m)
    )}, ${off(-s)})`,
    flap: `matrix(${rot(-nx)}, ${rot(-ny)}, ${rot(-ny)}, ${rot(nx)}, ${off(
      k - m
    )}, ${off(-s)})`,
    creaseAngle: (Math.atan2(ny, nx) * 180) / Math.PI,
    span: len,
    progress: Math.min(len / w, 1),
  };
}

/**
 * A rectangle in sheet coordinates that a fold is measured against.
 *
 * Which rectangle depends on the question. How far the hand may travel before
 * it runs out of paper is a question about the paper, so it is asked of the
 * whole sheet. Where the fold has to finish is a question about what the reader
 * can see, so it is asked of the part of the sheet on screen — and those two
 * differ enormously here, because a page is a few hundred pixels wide and
 * several thousand tall. A drag tilted downwards would otherwise have to carry
 * the crease the sheet's entire height to count as finished, and nine tenths of
 * the animation would run below the fold of the window with nothing to show.
 */
export type FoldBox = { x0: number; y0: number; x1: number; y1: number };

/**
 * How much of `box` lies ahead of the grabbed point along the fold direction.
 *
 * A fold's crease advances at half the speed of the hand — it is the
 * perpendicular bisector — so the box is only clear of the crease once the hand
 * has travelled twice this. That factor of two is the whole reason a drag to
 * the spine leaves the crease sitting at the spine with half the page still
 * showing, and why a committed turn has to carry the fold on past where the
 * reader let go.
 */
export function foldReach(
  box: FoldBox,
  ax: number,
  ay: number,
  ux: number,
  uy: number
): number {
  const here = ax * ux + ay * uy;
  const far = Math.max(
    box.x0 * ux + box.y0 * uy,
    box.x1 * ux + box.y0 * uy,
    box.x1 * ux + box.y1 * uy,
    box.x0 * ux + box.y1 * uy
  );
  return Math.max(far - here, 0);
}

/** A hair past the far edge, so a finished turn leaves no sliver of crease. */
const CLEARED = 8;

/**
 * How far the hand must get from the anchor before `box` is wholly on the
 * lifted side of the crease — twice the reach, for the reason given above.
 */
export function foldClearance(
  box: FoldBox,
  ax: number,
  ay: number,
  ux: number,
  uy: number
): number {
  return 2 * foldReach(box, ax, ay, ux, uy) + CLEARED;
}

/** The whole sheet, for the questions that are about the paper. */
export const wholeSheet = (w: number, h: number): FoldBox => ({
  x0: 0,
  y0: 0,
  x1: w,
  y1: h,
});
