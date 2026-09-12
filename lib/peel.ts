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

type Pt = [number, number];

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

  const dx = p.px - p.ax;
  const dy = p.py - p.ay;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 2) return null;

  // Unit normal of the crease, pointing from the grabbed point toward the hand.
  const nx = dx / len;
  const ny = dy / len;

  // The crease sits halfway between the two.
  const k = ((p.ax + p.px) / 2) * nx + ((p.ay + p.py) / 2) * ny;

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
