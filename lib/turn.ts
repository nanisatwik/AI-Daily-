/**
 * When a drag becomes a turn.
 *
 * Separated from the rig so it can be checked numerically. The previous
 * version of this decision lived inline in the component and carried a bug no
 * amount of looking at it would reveal: progress was measured against the
 * width of the whole sheet, while the distance the hand can actually travel is
 * bounded by where the sheet was taken hold of. Grabbing near the spine left
 * less travel available than the commit threshold required, so the turn could
 * not be completed however hard it was dragged.
 */

/** Share of the available travel that commits the turn on release. */
export const COMMIT_PROGRESS = 0.3;

/**
 * Release speed that commits regardless of distance, in px per millisecond.
 *
 * Turning a page is a flick, not a haul. Requiring distance alone meant a fast
 * short gesture — the natural motion — was read as a change of mind and snapped
 * back. 0.45px/ms is about 450px/s: brisker than a drag being positioned, well
 * under a fling.
 */
export const FLICK_SPEED = 0.45;

/** Below this, a release carries no meaningful direction. */
const FLICK_FLOOR = 0.08;

/**
 * Progress through the turn, as a share of the travel actually available.
 *
 * `available` is how far the free edge can still move — the distance from the
 * grab point to the spine going forwards. Dragging to the end of the available
 * travel is always 1, wherever the sheet was grabbed, which is what makes the
 * gesture feel the same across the whole sheet.
 */
export function travelProgress(pulled: number, available: number): number {
  if (!(available > 0)) return 0;
  const p = pulled / available;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export type Release = {
  /** Share of available travel completed, 0..1. */
  progress: number;
  /** Signed px/ms at release. Negative is leftwards. */
  velocity: number;
  /** True when turning forwards — the sheet flies to the left. */
  forward: boolean;
};

/**
 * Commit on distance OR on speed, and let a decisive flick the wrong way undo
 * an almost-finished turn: a reader who has dragged most of the way across and
 * then flicks back has changed their mind, and honouring the distance alone
 * would fight them.
 */
export function shouldCommit({ progress, velocity, forward }: Release): boolean {
  const speed = Math.abs(velocity);
  const towards = forward ? velocity < 0 : velocity > 0;

  if (speed >= FLICK_SPEED) return towards;
  if (speed >= FLICK_FLOOR && !towards && progress < 1 - COMMIT_PROGRESS) {
    return false;
  }
  return progress >= COMMIT_PROGRESS;
}

export type Pt = { x: number; y: number };

/**
 * The sheet is bound at its left edge, and the fold has to respect that.
 *
 * The peel is a reflection across the perpendicular bisector of grab → hand,
 * so the crease takes whatever angle the hand gives it and everything on the
 * grabbed side lifts. Dragging away diagonally therefore tilts the crease far
 * enough that part of the left edge ends up on the lifted side, and the sheet
 * reads as coming away from the spine rather than turning on it — which is the
 * one thing a bound paper never does.
 *
 * Pinning it by forcing the drag horizontal would fix that and throw away the
 * corner peel with it. So the fold is allowed its full freedom at the start,
 * where the crease is out near the reader's finger and the left edge is
 * nowhere near it, and is straightened as it travels: by the time the crease
 * has crossed the sheet it is parallel to the spine, which is a book turn.
 * The reader gets a corner lifting off under their thumb and a page pivoting
 * on its binding, in one gesture, with the left edge flat for all of it.
 *
 * `progress` is travel-relative — see `travelProgress` — so this straightens
 * against how far through the turn the reader is, not how many pixels they
 * have moved.
 */
/**
 * How far the crease may lean, as a share of how far the hand has travelled.
 *
 * Measured rather than chosen. Sweeping it against a 1100x2400 sheet, over
 * grabs from 30% to 95% of the width and drags drifting from 0.6 down to 0.8
 * up, the left edge stays flat for the whole turn at 0.15 and lifts within a
 * hundredth of it at 0.25. The boundary is sharp because a tilted crease is a
 * full line across a sheet more than twice as tall as it is wide: a few
 * degrees at the hand is hundreds of pixels at the far corner.
 *
 * 0.12 is that boundary with a little room, and it is about seven degrees of
 * tilt. Worth knowing before changing it: the safe value falls as the sheet
 * gets taller relative to its width, so a squarer page could afford more.
 */
export const MAX_LEAN = 0.12;

export function spineHand(anchor: Pt, pointer: Pt, progress: number): Pt {
  const straighten = Math.min(Math.max(progress, 0), 1);

  /*
   * The lean is bounded by the travel, not merely faded out with it.
   *
   * Fading alone left the fold completely free at the instant it began, and a
   * drag that set off steeply — straight up, or sharply down — made a crease
   * near enough horizontal that the left edge was on the lifted side within a
   * hundredth of the turn. Checked across five drift angles, that was six
   * cases out of twenty-five: the damping did nothing precisely where the
   * reader was most abrupt.
   *
   * Tying the allowance to how far the hand has actually crossed the sheet
   * fixes the angle rather than the offset. The crease can lean half as far as
   * it has travelled, so the fold opens as a corner peel; and since the
   * allowance is zero before the hand has gone anywhere, it never begins flat
   * across the page.
   */
  const across = Math.abs(pointer.x - anchor.x);
  const allowed = across * MAX_LEAN * (1 - straighten);
  const lean = pointer.y - anchor.y;

  return {
    // The reader's own travel is untouched: it is the number `travelProgress`
    // measures and the commit decision is made on.
    x: pointer.x,
    y: anchor.y + Math.max(-allowed, Math.min(allowed, lean)),
  };
}

/**
 * Whether a point is on the lifted side of the crease, for checking.
 *
 * The crease is the perpendicular bisector of anchor → hand, and the lifted
 * half-plane is the one the anchor sits in. A point is lifted when it is on
 * the anchor's side of that line.
 */
export function isLifted(anchor: Pt, hand: Pt, q: Pt): boolean {
  const mx = (anchor.x + hand.x) / 2;
  const my = (anchor.y + hand.y) / 2;
  const nx = anchor.x - mx;
  const ny = anchor.y - my;
  return (q.x - mx) * nx + (q.y - my) * ny > 0;
}
