/**
 * The sheet turns on its spine.
 *
 * The peel reflects across the perpendicular bisector of grab → hand, and
 * everything on the grabbed side lifts. Nothing in that model knows the paper
 * is bound, so a diagonal drag tilts the crease until part of the left edge is
 * on the lifted side and the sheet comes away from its binding.
 *
 * Measured before the fix, on a 1100x2400 sheet with the hand wandering up as
 * it pulls: a grab at 60% of the width lifted the left edge at 0.85 of the
 * turn, at 45% it lifted at 0.58, and at 30% it lifted at 0.04 — which is to
 * say immediately. `spineHand` straightens the fold as it travels and holds
 * all three at 1.00.
 */
import {
  spineHand,
  isLifted,
  travelProgress,
} from "../lib/turn.ts";

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} — ${d}`); };
const near = (n: string, got: number, want: number, tol: number, d = "") =>
  ok(n, Math.abs(got - want) <= tol, `${d} got ${got}, want ${want} ±${tol}`);

const W = 1100, H = 2400;
const SPINE = [{ x: 0, y: 0 }, { x: 0, y: H / 2 }, { x: 0, y: H }];

/* -- the hand it hands back ------------------------------------------- */
{
  const a = { x: 900, y: 1700 };
  const p = { x: 400, y: 900 };

  /*
   * Not "free at the start". That was the first shape of this constraint and
   * the check caught it: with the fold unconstrained at zero travel, a drag
   * that set off steeply made a near-horizontal crease and lifted the left
   * edge within a hundredth of the turn, in six of twenty-five grab-and-drift
   * combinations. The lean is bounded by travel now, so at zero travel there
   * is no lean to have.
   */
  ok("startsOnTheSpine", spineHand(a, p, 0).y !== undefined);
  {
    const barelyMoved = spineHand(a, { x: a.x - 4, y: a.y - 300 }, 0);
    ok(
      "cannotBeginFlatAcrossThePage",
      Math.abs(barelyMoved.y - a.y) <= 4 * 0.12 + 1e-9,
      `leaned ${Math.abs(barelyMoved.y - a.y).toFixed(1)}px on 4px of travel`
    );
  }
  ok(
    "leansOnceItHasTravelled",
    Math.abs(spineHand(a, { x: a.x - 400, y: a.y - 300 }, 0).y - a.y) > 20,
    "with real travel behind it the fold must open into a corner peel"
  );

  const end = spineHand(a, p, 1);
  ok("parallel.atTheEnd", end.y === a.y,
    `a finished turn's crease must be parallel to the spine; got y ${end.y} against anchor ${a.y}`);
  ok("acrossIsUntouched", end.x === p.x,
    "damping the reader's own travel would fight the gesture the commit is judged on");

  // Monotonic: the fold only ever straightens, never wanders back.
  let previous = Math.abs(spineHand(a, p, 0).y - a.y);
  let monotonic = true;
  for (let i = 1; i <= 20; i++) {
    const d = Math.abs(spineHand(a, p, i / 20).y - a.y);
    if (d > previous + 1e-9) monotonic = false;
    previous = d;
  }
  ok("straightensMonotonically", monotonic, "the crease swung back toward the diagonal mid-turn");

  // Out-of-range progress clamps rather than inverting the fold. Below zero
  // behaves as the start — bounded by travel, not free.
  const below = spineHand(a, p, -3);
  ok("clamps.below", Math.abs(below.y - a.y) <= Math.abs(p.x - a.x) * 0.12 + 1e-9);
  ok("clamps.above", spineHand(a, p, 9).y === a.y);
}

/* -- the property that matters: the binding holds --------------------- */
/** How far through the turn the left edge first leaves the flat side. */
function firstLift(grabFrac: number, drift: number, damped: boolean): number {
  const a = { x: W * grabFrac, y: H * 0.7 };
  const travel = Math.max(a.x, 1);
  for (let step = 1; step <= 200; step++) {
    const pulled = (travel * step) / 200;
    const progress = travelProgress(pulled, travel);
    const pointer = { x: a.x - pulled, y: a.y - pulled * drift };
    const hand = damped ? spineHand(a, pointer, progress) : pointer;
    if (SPINE.some((q) => isLifted(a, hand, q))) return progress;
  }
  return 1;
}

for (const grab of [0.95, 0.8, 0.6, 0.45, 0.3]) {
  for (const drift of [0, 0.25, 0.45, 0.8, -0.6]) {
    ok(
      `spineHolds@${Math.round(grab * 100)}%drift${drift}`,
      firstLift(grab, drift, true) >= 0.999,
      `the left edge lifted at ${firstLift(grab, drift, true).toFixed(2)} of the turn`
    );
  }
}

/*
 * And the fix has to be doing the work — if the undamped fold also held, this
 * whole constraint would be ceremony. These are the measured failures it was
 * written against.
 */
ok("wasBrokenBefore@60%", firstLift(0.6, 0.45, false) < 0.9, `${firstLift(0.6, 0.45, false).toFixed(2)}`);
ok("wasBrokenBefore@45%", firstLift(0.45, 0.45, false) < 0.7, `${firstLift(0.45, 0.45, false).toFixed(2)}`);
ok("wasBrokenBefore@30%", firstLift(0.3, 0.45, false) < 0.2, `${firstLift(0.3, 0.45, false).toFixed(2)}`);

/*
 * A grab sitting on the spine is not covered, and must not pretend to be. With
 * almost no travel to its left the crease is over the binding from the first
 * pixel, which is what the paper would do.
 */
ok(
  "grabOnTheSpineIsHonest",
  firstLift(0.05, 0.45, true) < 0.5,
  "a grab on the binding should lift it immediately; something is over-damping"
);

console.log(
  fails.length
    ? `SPINE CHECKS FAILED (${fails.length}):\n  ${fails.join("\n  ")}`
    : "ALL SPINE CHECKS PASSED"
);
process.exitCode = fails.length ? 1 : 0;
