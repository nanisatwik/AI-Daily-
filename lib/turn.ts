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
