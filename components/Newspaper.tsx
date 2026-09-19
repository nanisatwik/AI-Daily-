"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { PointingHand } from "./Ornament";
import {
  peelLayers,
  foldReach,
  foldClearance,
  wholeSheet,
  type FoldBox,
} from "@/lib/peel";
import { travelProgress, shouldCommit, spineHand } from "@/lib/turn";

const PAPER_EASE = [0.22, 1, 0.28, 1] as const;
/**
 * How long the hand may pause before a release stops counting as a flick.
 *
 * Velocity is smoothed across moves, so without this a reader who dragged
 * quickly, stopped to think, and then let go would have their stale speed read
 * as a decisive flick.
 */
const FLICK_WINDOW_MS = 90;

/**
 * Share of the sheet at each side that turns the page when tapped.
 *
 * A reader takes a physical sheet by its edge, and until now a tap did nothing
 * at all — the only way forward was to drag the whole way across, which is
 * precisely what felt like hard work. Links and controls never reach this
 * path: onPointerDown declines those presses outright.
 */
const TAP_ZONE = 0.16;

/** Movement before a press becomes a drag, so clicks still work. */
const SLOP = 8;

/**
 * A full, uninterrupted turn.
 *
 * The cylinder this replaced ran for 1050ms, which is roughly three times what
 * a hand takes to flick a page over and about three times the peel in the
 * reference the owner sent. A fold has no long roll to show off, so the extra
 * time bought nothing but the feeling of waiting.
 */
const TURN_MS = 340;
/**
 * Where a driven turn is taken hold of — low and at the fore-edge, as a reader
 * would, but low within the window rather than low on the sheet.
 *
 * These pages are several thousand pixels tall and scroll, so three quarters of
 * the way down the paper is usually some way below the bottom of the screen.
 * The old rig grabbed there and got away with it because the grab height only
 * tilted a cylinder; a fold collapses onto the point it was taken by, so that
 * point had better be somewhere the reader is looking.
 */
const DRIVEN_GRAB = 0.78;

/**
 * How far a driven turn's crease leans, as a share of the sheet's width across
 * the height of the window.
 *
 * Held as an offset over a height rather than as an angle for the same reason
 * the old rig held its lean that way: an angle that reads as a corner peel on
 * one shape of page slices another corner to corner.
 */
const DRIVEN_LEAN = 0.2;

type Props = { pages: ReactNode[]; labels: string[] };
type Side = "next" | "prev";
type Lift = { target: number; side: Side };
type Pt = { x: number; y: number };

/**
 * Three phases, in the proportions a hand actually turns a page.
 *
 *   0–13%   the corner eases off the sheet below — barely any travel
 *   13–78%  the sweep, accelerating in and easing out again
 *   78–100% the landing: the last 8% of distance spread over a fifth of the
 *           time, so the sheet drifts down rather than stopping dead
 *
 * Continuous at both joins, monotonic throughout, and it never exceeds 1 —
 * paper settles, it does not bounce.
 */
function pageEase(t: number) {
  if (t < 0.13) {
    const u = t / 0.13;
    return 0.1 * u * u;
  }
  if (t < 0.78) {
    const u = (t - 0.13) / 0.65;
    const swept = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    return 0.1 + 0.82 * swept;
  }
  const u = (t - 0.78) / 0.22;
  return 0.92 + 0.08 * (1 - Math.pow(1 - u, 3));
}

export default function Newspaper({ pages, labels }: Props) {
  const reduce = useReducedMotion();
  const [folded, setFolded] = useState(true);
  const [page, setPage] = useState(0);
  /** Non-null only while a sheet is off the table. Never set per-frame. */
  const [lifting, setLifting] = useState<Lift | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  /**
   * One pair of elements per sheet: the box whose clip rect is the crease, and
   * the counter-transformed box inside it that holds the page still. paint()
   * drives whichever pair is flying and leaves the rest at rest.
   */
  const clipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const innerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const flyingRef = useRef(0);
  const flapClipRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const creaseRef = useRef<HTMLDivElement>(null);

  const size = useRef({ w: 0, h: 0 });
  /**
   * How far past the paper each clip box's rect reaches, as overflow-clip-margin.
   *
   * A rectangle turned to an arbitrary crease angle only still covers the sheet
   * if it is bigger than the sheet's diagonal, so this is measured from it. The
   * check asserts the covering; a margin of a few pixels fails it loudly.
   */
  const margin = useRef(0);

  /** The point on the sheet the fold collapses onto. */
  const anchor = useRef<Pt>({ x: 0, y: 0 });
  /** Where that point has been carried to. Everything else follows from these two. */
  const hand = useRef<Pt>({ x: 0, y: 0 });
  /** Unit fold direction, fixed when the drag was recognised. */
  const dir = useRef<Pt>({ x: -1, y: 0 });
  /** Where the reader actually pressed, which progress is measured from. */
  const press = useRef<Pt>({ x: 0, y: 0 });
  /** Turning back only: the hand distance at which the sheet is wholly hidden. */
  const folding = useRef(0);
  /**
   * The band of sheet on screen when the turn began, in sheet coordinates.
   *
   * A finished fold has to have carried its crease off this, not off the whole
   * six-thousand-pixel sheet. Read once per turn, because the reader cannot
   * scroll while they are holding the paper.
   */
  const view = useRef<FoldBox>({ x0: 0, y0: 0, x1: 0, y1: 0 });
  /**
   * The grid's position, read once per press.
   *
   * It used to be read on every pointermove. Nothing in a turn dirties layout
   * any more, so that read was free in principle — but it is a forced flush in
   * the middle of the one gesture that cannot afford one, and the paper does
   * not move under the reader while they are holding it.
   */
  const frame0 = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  /**
   * How far the hand can still go before it runs out of paper. Progress is
   * measured against this rather than the sheet's width: the hand runs out of
   * paper at the spine, so a grab near the spine offers less travel than the
   * full width and measuring against the width made the turn unfinishable from
   * the inner half of the sheet.
   */
  const travel = useRef(0);
  /** Smoothed signed px/ms, and when it was last sampled. */
  const vel = useRef(0);
  const lastMove = useRef<{ x: number; t: number } | null>(null);
  const amount = useRef(0);
  const sideRef = useRef<Side>("next");
  const targetRef = useRef<number | null>(null);
  const pending = useRef<{ cx: number; lx: number; ly: number } | null>(null);
  const dragging = useRef(false);
  const frame = useRef(0);
  const anim = useRef(0);
  /** Backstop that lands the sheet when animation frames stop arriving. */
  const land = useRef(0);

  const total = pages.length;

  /**
   * Everything about the rig that depends on the sheet's size, written when the
   * sheet is measured rather than when the hand moves.
   *
   * The crease band's box is included: it has to span the whole clip rect, and
   * `top`/`height` are layout properties. Sizing it here means a turn writes
   * nothing to it but an opacity.
   */
  /**
   * The band of sheet the reader can actually see, in sheet coordinates.
   *
   * Horizontally the paper is always wholly in view — it is the width of the
   * column — so only the vertical extent is worth trimming.
   */
  const visible = useCallback((): FoldBox => {
    const { w, h } = size.current;
    const top = sheetRef.current?.getBoundingClientRect().top ?? 0;
    return {
      x0: 0,
      x1: w,
      y0: Math.max(0, -top),
      y1: Math.min(h, -top + window.innerHeight),
    };
  }, []);

  const layout = useCallback(() => {
    const m = margin.current;
    const { w, h } = size.current;

    for (const el of clipRefs.current) {
      if (el) el.style.overflowClipMargin = `${m}px`;
    }

    const clip = flapClipRef.current;
    if (clip) clip.style.overflowClipMargin = `${m}px`;

    const crease = creaseRef.current;
    if (crease) {
      // Laid along the crease from the fold line outwards: local x = −m is the
      // clip box's leading edge, which peelLayers puts exactly on the fold.
      crease.style.left = `${-m}px`;
      crease.style.top = `${-m}px`;
      crease.style.height = `${h + 2 * m}px`;
      crease.style.width = `${Math.min(Math.max(w * 0.05, 16), 64)}px`;
    }
  }, []);

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      size.current = { w, h };
      margin.current = Math.ceil(Math.hypot(w, h)) + 64;
      layout();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page, folded, layout]);

  // The flap only exists while a sheet is off the table, so it needs sizing the
  // moment it mounts — before the first frame of the fold, not during it.
  useLayoutEffect(layout, [lifting, layout]);

  useEffect(() => {
    if (reduce) {
      setFolded(false);
      return;
    }
    // Motion's onAnimationComplete is missed if the tab is backgrounded
    // mid-sweep, which would strand the page controls off the DOM for good.
    const t = window.setTimeout(() => setFolded(false), 2200);
    return () => window.clearTimeout(t);
  }, [reduce]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(anim.current);
      window.clearTimeout(land.current);
    },
    []
  );

  /**
   * Writes the fold straight to the DOM. Called from rAF only — React does not
   * render while a page is being held, which is what keeps this feeling like
   * paper rather than a slideshow.
   *
   * Five writes, all of them transforms and opacities, and not one of them
   * something the browser has to paint to honour. The rig this replaced wrote
   * twenty-two strip transforms, a clip-path on the lifted run, and a clip-path
   * on the flying page — and that last one dirtied a whole printed sheet.
   *
   * Both directions share one coordinate system: the flying sheet is always the
   * one being folded, and turning back is the same fold run backwards with the
   * incoming page in flight. So there is no mirroring and no flipped
   * handedness anywhere in here.
   */
  const paint = useCallback(() => {
    const { w } = size.current;
    const clipEl = clipRefs.current[flyingRef.current];
    const innerEl = innerRefs.current[flyingRef.current];
    // Wait for the flap to mount. Creasing the page before it exists would
    // show one frame of a sheet cut off against nothing.
    if (!clipEl || !innerEl || !flapClipRef.current || w === 0) return;

    const a = anchor.current;
    const p = hand.current;
    const g = peelLayers(
      w,
      size.current.h,
      { ax: a.x, ay: a.y, px: p.x, py: p.y },
      margin.current
    );

    if (!g) {
      clipEl.style.transform = "";
      innerEl.style.transform = "";
      flapClipRef.current.style.opacity = "0";
      return;
    }

    // The clip box sweeps across the page; the page inside carries the exact
    // inverse, so it stays where the reader left it. Checked to 1.3e-4px.
    clipEl.style.transform = g.clip;
    innerEl.style.transform = g.page;

    const flapClip = flapClipRef.current;
    const flap = flapRef.current;
    const crease = creaseRef.current;
    if (flap && crease) {
      flapClip.style.opacity = "1";
      // The flap needs no box of its own: the same half-plane that keeps the
      // flat page is exactly the half the lifted corner lands in.
      flapClip.style.transform = g.clip;
      flap.style.transform = g.flap;
      // The fold darkens as the sheet comes off the page beneath and then
      // stops. Paper does not keep getting dimmer once it has left the table.
      crease.style.opacity = (0.52 * Math.min(g.span / (w * 0.16), 1)).toFixed(
        3
      );
    }
  }, []);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      paint();
    });
  }, [paint]);

  /**
   * Take the full-screen paper effects out of the compositing tree while a
   * sheet is moving.
   *
   * `.paper-grain` is fixed at the viewport size, sits above the sheet, and
   * uses mix-blend-mode, so the compositor cannot treat it as an independent
   * layer: every frame of a turn invalidates the whole screen and forces a
   * re-blend against the moving paper. Nobody can see grain on a sheet in
   * flight, so the cost buys nothing exactly when frames are scarcest. Two
   * paints to toggle it beats sixty paints carrying it.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("turning", lifting !== null);
    return () => root.classList.remove("turning");
  }, [lifting]);

  /** Lift a sheet onto its own compositor layer, or put it back down again. */
  const promote = useCallback((i: number, on: boolean) => {
    const want = on ? "transform" : "";
    const clip = clipRefs.current[i];
    const inner = innerRefs.current[i];
    if (clip) clip.style.willChange = want;
    if (inner) inner.style.willChange = want;
  }, []);

  const reset = useCallback(() => {
    targetRef.current = null;
    pending.current = null;
    dragging.current = false;
    amount.current = 0;
    folding.current = 0;
    // Clear every sheet, not just the one that flew — a turn that commits swaps
    // which sheet is flying, and a stale transform would strand the next page
    // creased down the middle.
    for (let i = 0; i < clipRefs.current.length; i++) {
      const clip = clipRefs.current[i];
      const inner = innerRefs.current[i];
      if (clip) clip.style.transform = "";
      if (inner) inner.style.transform = "";
      promote(i, false);
    }
    setLifting(null);
  }, [promote]);

  /** Carry the hand to a destination, painting directly, then finish. */
  const glide = useCallback(
    (to: Pt, ms: number, commit: number | null) => {
      cancelAnimationFrame(anim.current);
      const fx = hand.current.x;
      const fy = hand.current.y;
      const start = performance.now();

      /**
       * Finish the turn, from whichever gets there first.
       *
       * Landing the sheet is not decoration — it is what clears `lifting`, and
       * `lifting` is what holds the `.turning` class that hides the grain and
       * the vignette, and what the guard in turn() checks before allowing the
       * next page. So a glide that never reaches its final frame does not
       * merely look unfinished: the paper loses its texture for good and no
       * further page will turn.
       *
       * That is reachable in ordinary use. A tab backgrounded mid-turn stops
       * receiving animation frames, and the callback that would have finished
       * the turn is simply never called. Observed here too, where the preview
       * pane stops rAF entirely when it is not the front window.
       */
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        window.clearTimeout(land.current);
        cancelAnimationFrame(anim.current);
        if (commit !== null) setPage(commit);
        reset();
      };

      const step = (now: number) => {
        if (done) return;
        const t = Math.min((now - start) / ms, 1);
        const e = pageEase(t);
        hand.current = { x: fx + (to.x - fx) * e, y: fy + (to.y - fy) * e };
        paint();

        if (t < 1) {
          anim.current = requestAnimationFrame(step);
        } else {
          settle();
        }
      };
      anim.current = requestAnimationFrame(step);
      // Timers keep running where animation frames do not. Generous enough
      // never to cut a real glide short, short enough that a reader who comes
      // back to the tab finds a settled page rather than a stranded one.
      window.clearTimeout(land.current);
      land.current = window.setTimeout(settle, ms + 400);
    },
    [paint, reset]
  );

  /**
   * Take hold of a sheet at (atX, atY) and fold it along (ux, uy).
   *
   * The anchor is wherever the reader actually pressed, which is what lets the
   * page come off any corner or any edge: grab the middle of the fore-edge and
   * the crease stands upright, grab low and near the corner and it leans, and
   * neither case is special-cased anywhere. The old rig could only begin a turn
   * from a strip at the sheet's left or right, because a cylinder has to know
   * which edge it is rolling from.
   */
  const begin = useCallback(
    (
      s: Side,
      flies: number,
      target: number,
      atX: number,
      atY: number,
      ux: number,
      uy: number
    ) => {
      const { w, h } = size.current;
      sideRef.current = s;
      targetRef.current = target;
      dir.current = { x: ux, y: uy };
      press.current = { x: atX, y: atY };

      view.current = visible();

      // How far the hand may go is a question about the paper, so it is asked
      // of the whole sheet. Capped at the width for the same reason peelLayers
      // caps its progress there: a page several thousand pixels tall must not
      // ask for a drag that long before it will admit the reader meant to turn
      // it.
      travel.current = Math.min(
        Math.max(foldReach(wholeSheet(w, h), atX, atY, ux, uy), 1),
        w
      );

      if (s === "next") {
        // Forwards the reader is holding the paper, so the hand is the fold:
        // whatever they pressed stays under their finger for the whole drag.
        anchor.current = { x: atX, y: atY };
        hand.current = { x: atX, y: atY };
        folding.current = 0;
      } else {
        // Backwards there is nothing to hold — the sheet is already over on the
        // other side — so the hand's travel drives the fold instead. A fold
        // collapses onto its anchor, so the anchor has to sit out where the
        // drag leaves the paper: left at the press point the sheet would unfold
        // only as far as the reader's finger and then snap the rest of the way.
        const reach = foldReach(view.current, atX, atY, ux, uy);
        const ax = atX + ux * reach;
        const ay = atY + uy * reach;
        anchor.current = { x: ax, y: ay };
        folding.current = foldClearance(view.current, ax, ay, -ux, -uy);
        hand.current = {
          x: ax - ux * folding.current,
          y: ay - uy * folding.current,
        };
      }

      amount.current = 0;
      vel.current = 0;
      lastMove.current = null;
      promote(flies, true);
      setLifting({ target, side: s });
    },
    [promote, visible]
  );

  /**
   * Where the hand has to finish for the turn to be over — or to be undone.
   *
   * A crease is a perpendicular bisector, so it advances at half the hand's
   * speed. That is why a drag to the spine leaves the fold standing at the
   * spine with half the page still showing, and why finishing a turn means
   * carrying the hand on past where the reader let go rather than snapping the
   * crease to the edge.
   */
  const settle = useCallback((done: boolean): Pt => {
    const a = anchor.current;
    const u = dir.current;

    if (sideRef.current === "prev") {
      // Flat, or all the way back over.
      return done
        ? { x: a.x, y: a.y }
        : { x: a.x - u.x * folding.current, y: a.y - u.y * folding.current };
    }

    // Collapsing the fold onto its anchor is the page lying back down.
    if (!done) return { x: a.x, y: a.y };

    // Leave along the fold the reader actually made, not the one they started:
    // a corner taken off diagonally should carry on diagonally.
    const dx = hand.current.x - a.x;
    const dy = hand.current.y - a.y;
    const len = Math.hypot(dx, dy);
    const fx = len > 1 ? dx / len : u.x;
    const fy = len > 1 ? dy / len : u.y;
    const span = foldClearance(view.current, a.x, a.y, fx, fy);
    return { x: a.x + fx * span, y: a.y + fy * span };
  }, []);

  /** Turn by control rather than by hand — the same fold, driven for you. */
  const turn = useCallback(
    (next: number) => {
      if (next < 0 || next >= total || next === page || lifting) return;
      const { w, h } = size.current;

      if (reduce || w === 0 || h === 0) {
        setPage(next);
        return;
      }

      const forward = next > page;
      const band = visible();
      const deep = Math.max(band.y1 - band.y0, 1);
      // Up and towards the spine, so the crease leans the way a hand leans it
      // and the corner nearest the reader comes away first.
      const lean = (DRIVEN_LEAN * w) / deep;
      const len = Math.hypot(1, lean);
      begin(
        forward ? "next" : "prev",
        forward ? page : next,
        next,
        forward ? w : 0,
        band.y0 + deep * DRIVEN_GRAB,
        (forward ? -1 : 1) / len,
        -lean / len
      );
      dragging.current = false;
      requestAnimationFrame(() => glide(settle(true), TURN_MS, next));
    },
    [begin, glide, lifting, page, reduce, settle, total, visible]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        turn(page + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        turn(page - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, turn]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reduce || lifting || e.button !== 0) return;
      // Never steal a press that belongs to a link, a control, or a selection.
      if ((e.target as HTMLElement).closest("a, button, input, textarea, select"))
        return;

      const rect = sheetRef.current?.getBoundingClientRect();
      if (!rect) return;
      frame0.current = { left: rect.left, top: rect.top };
      pending.current = {
        cx: e.clientX,
        lx: e.clientX - rect.left,
        ly: e.clientY - rect.top,
      };
      // The forward turn is much the commoner one, so its layer is worth
      // preparing on the press rather than on the first move — the promotion
      // then happens in the pause before the hand starts travelling.
      promote(page, true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    },
    [lifting, page, promote, reduce]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const lx = e.clientX - frame0.current.left;
      const ly = e.clientY - frame0.current.top;

      const p = pending.current;
      if (p && !dragging.current) {
        // Still the horizontal component that decides whether this is a turn at
        // all. touch-action gives vertical panning to the scroller, and a
        // reader running their thumb down a column has not asked for a page.
        const dx = e.clientX - p.cx;
        if (Math.abs(dx) < SLOP) return;

        const forward = dx < 0;
        const target = forward ? page + 1 : page - 1;
        if (target < 0 || target >= total) {
          pending.current = null;
          promote(page, false);
          return;
        }
        // The fold itself follows the whole drag rather than its horizontal
        // part, which is what lets the corner come away at an angle.
        const rise = ly - p.ly;
        const len = Math.hypot(dx, rise) || 1;
        begin(
          forward ? "next" : "prev",
          forward ? page : target,
          target,
          p.lx,
          p.ly,
          dx / len,
          rise / len
        );
        dragging.current = true;
      }

      if (!dragging.current) return;
      e.preventDefault();

      // Smoothed so a single stuttery frame cannot read as a flick.
      const t = performance.now();
      const prev = lastMove.current;
      if (prev && t > prev.t) {
        const v = (e.clientX - prev.x) / (t - prev.t);
        vel.current = vel.current * 0.6 + v * 0.4;
      }
      lastMove.current = { x: e.clientX, t };

      const u = dir.current;
      const from = press.current;
      // Progress is the hand's travel along the fold, so wandering sideways
      // neither adds to the turn nor takes from it. For a straight drag left or
      // right this is the same number the old rig measured, to the pixel.
      const pulled = Math.max(
        (lx - from.x) * u.x + (ly - from.y) * u.y,
        0
      );
      amount.current = travelProgress(pulled, travel.current);

      if (sideRef.current === "next") {
        /*
         * Through the spine, not straight to the finger.
         *
         * Taking the hand raw let the crease take whatever angle the drag gave
         * it, and a diagonal one tilts far enough to put part of the left edge
         * on the lifted side — the sheet comes away from its binding instead of
         * turning on it. Measured on the front page: a grab at 30% of the width
         * lifted the left edge at 0.04 of the turn, and at 45% by 0.58.
         * `spineHand` bounds the lean to the travel and straightens it as the
         * fold crosses, so the corner still peels and the binding still holds.
         */
        hand.current = spineHand(
          anchor.current,
          { x: lx, y: ly },
          amount.current
        );
      } else {
        const a = anchor.current;
        const d = (1 - amount.current) * folding.current;
        hand.current = { x: a.x - u.x * d, y: a.y - u.y * d };
      }
      schedule();
    },
    [begin, page, promote, schedule, total]
  );

  const onPointerUp = useCallback(() => {
    const tapped = pending.current;
    pending.current = null;

    if (!dragging.current) {
      promote(page, false);
      // Never became a drag, so read it as a tap on the sheet's edge.
      if (tapped && !reduce) {
        const { w } = size.current;
        const zone = w * TAP_ZONE;
        if (tapped.lx >= w - zone) turn(page + 1);
        else if (tapped.lx <= zone) turn(page - 1);
      }
      return;
    }

    dragging.current = false;

    // A hand that has come to rest is not flicking, whatever it was doing a
    // moment ago.
    const stale =
      !lastMove.current || performance.now() - lastMove.current.t > FLICK_WINDOW_MS;

    const done =
      targetRef.current !== null &&
      shouldCommit({
        progress: amount.current,
        velocity: stale ? 0 : vel.current,
        forward: sideRef.current === "next",
      });

    // Time what is left of the turn, so a nearly finished page does not crawl
    // and a barely started one does not snap. Scaled down with TURN_MS: a fold
    // that takes 340ms in full cannot spend 720ms finishing the last tenth.
    const left = done ? 1 - amount.current : amount.current;
    const ms = Math.max(140, Math.min(TURN_MS * left * 1.25, 320));

    glide(settle(done), ms, done ? targetRef.current : null);
  }, [glide, page, promote, reduce, settle, turn]);

  const showFold = page === 0 && folded && !reduce;

  // Forwards, the current sheet flies and the next one waits underneath.
  // Backwards, the incoming sheet flies in over the top of the current one.
  const flying = lifting
    ? lifting.side === "next"
      ? page
      : lifting.target
    : page;
  const beneath = lifting
    ? lifting.side === "next"
      ? lifting.target
      : page
    : null;
  // paint() runs from rAF after render, so a plain assignment here is enough to
  // keep it pointed at the right sheet without an extra render pass.
  flyingRef.current = flying;

  return (
    <div className="stage">
      {/*
        Every sheet is laid into the same single grid cell. The cell is
        therefore always as tall as the tallest page in the edition, and each
        sheet stretches to fill it — so the paper is one fixed rectangle no
        matter which page is face up, and a short page ends in blank newsprint
        rather than collapsing around its content.

        This is also what makes the fold geometry stable: the peel reads its
        dimensions from this box, which never changes size.
      */}
      <div
        ref={sheetRef}
        // grid-cols-[minmax(0,1fr)] is load-bearing: a bare `grid` sizes its
        // implicit column to max-content, so the widest sheet in the stack sets
        // the width and overflows the viewport on narrow screens.
        className={`relative grid grid-cols-[minmax(0,1fr)] ${
          lifting ? "select-none" : ""
        }`}
        onPointerDown={reduce ? undefined : onPointerDown}
        onPointerMove={reduce ? undefined : onPointerMove}
        onPointerUp={reduce ? undefined : onPointerUp}
        onPointerCancel={reduce ? undefined : onPointerUp}
        style={{ cursor: lifting ? "grabbing" : undefined, touchAction: "pan-y" }}
      >
        {pages.map((sheet, i) => {
          const isFlying = i === flying;
          const isBeneath = i === beneath;
          const shown = isFlying || isBeneath;

          return (
            <div
              key={i}
              // Hidden sheets stay in the grid so they keep holding the height,
              // but visibility:hidden takes them out of the a11y tree.
              // min-w-0 too: grid items default to min-width:auto, which would
              // let a long headline push the cell wider than its column.
              className="relative min-w-0"
              style={{
                gridArea: "1 / 1",
                zIndex: isFlying ? 10 : 0,
                visibility: shown ? "visible" : "hidden",
              }}
              aria-hidden={!isFlying}
            >
              {/*
                The crease, as a clip rather than a clip-path.

                `overflow: clip` and not `hidden`, for two reasons. `hidden`
                would make this a scroll container, and a scroll container is
                where a `position: sticky` descendant sticks; `clip` is also the
                only overflow value that takes `overflow-clip-margin`, which is
                what pushes the clip rect out past the paper. That matters twice
                over: idle, the ragged printed edges bleed ten pixels past the
                sheet and must not be trimmed, and mid-fold the rect has to be
                wider than the sheet's diagonal or a crease laid across a corner
                would cut the page short. The margin is written from the
                measured diagonal — see `layout`.

                `relative` so that nothing inside the page can resolve its
                containing block to the grid cell outside this box and escape
                the clip.
              */}
              <div
                ref={(el) => {
                  clipRefs.current[i] = el;
                }}
                className="relative h-full"
                style={{ overflow: "clip", transformOrigin: "0 0" }}
              >
                {/*
                  And the counter-transform. This carries the exact inverse of
                  the box above, so as the clip sweeps across the sheet the
                  sheet itself does not move by so much as a thousandth of a
                  pixel — which is the whole point. `clip-path` would have said
                  the same thing about the same straight line and repainted four
                  hundred and seventy nodes of type to say it.
                */}
                <div
                  ref={(el) => {
                    innerRefs.current[i] = el;
                  }}
                  className="relative h-full"
                  style={{ transformOrigin: "0 0" }}
                >
                  {isFlying && showFold ? (
                    <FoldedSheet onOpened={() => setFolded(false)}>
                      {sheet}
                    </FoldedSheet>
                  ) : (
                    sheet
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {lifting && (
          // Trims the fold to the paper. A lifted corner does stand out past a
          // real sheet's edge, but this canvas is one fixed rectangle and a
          // flap spilling over the masthead reads as a bug, not as paper.
          <div
            className="absolute inset-0 z-30 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            {/*
              The flap's clip box — the same half-plane, and literally the same
              transform, as the flying page's. Everything the fold lifts lands
              on the flat side of the crease, so one orientation serves both and
              there is no second angle to keep in step with the first.
            */}
            <div
              ref={flapClipRef}
              className="absolute inset-0 opacity-0"
              style={{
                overflow: "clip",
                transformOrigin: "0 0",
                willChange: "transform, opacity",
              }}
            >
              {/*
                The lifted corner: the reverse of the sheet, mirrored in the
                crease. Its box is the whole sheet, so the mirror image of the
                sheet's own edges is where the flap ends — and the box-shadow
                that follows those edges is painted once, in this element's own
                frame, and merely carried about by the transform. The previous
                rig cast its shadow from a gradient whose position and length
                were rewritten every frame.

                No page content in here. The old lifted run carried a second
                copy of the whole printed sheet at eleven per cent opacity for
                the show-through, which is four hundred and seventy nodes to lay
                out and paint at the exact moment the reader starts to drag. At
                340ms and that opacity nobody was ever going to read it.
              */}
              <div
                ref={flapRef}
                className="absolute inset-0"
                style={{
                  transformOrigin: "0 0",
                  willChange: "transform",
                  // The reverse of a sheet is never brighter than its face.
                  // Both stops sit at or below the paper's own value, so the
                  // lifted corner reads as the back of the page rather than as
                  // a panel lit from somewhere the room has no lamp.
                  background:
                    "linear-gradient(104deg, var(--sheet-back) 0%, var(--paper-deep) 55%, var(--sheet-back) 100%)",
                  border: "1px solid rgba(120,96,58,0.45)",
                  boxShadow:
                    "0 0 26px 2px rgba(26,15,4,0.32), 0 0 5px rgba(26,15,4,0.26)",
                }}
              />

              {/*
                The fold line. Laid out along the crease in this box's own
                frame — local x of minus the clip margin is exactly where
                peelLayers puts the fold — so it needs no rotation of its own
                and no geometry per frame, only an opacity.
              */}
              <div
                ref={creaseRef}
                className="absolute"
                style={{
                  opacity: 0,
                  willChange: "opacity",
                  background:
                    "linear-gradient(to right, rgba(26,15,4,0.9) 0%, rgba(26,15,4,0.4) 24%, rgba(26,15,4,0) 100%)",
                }}
              />
            </div>
          </div>
        )}

        {/* Corner affordance: a hair of lift where the sheet can be taken. */}
        {!lifting && !reduce && page < total - 1 && (
          <div
            className="group absolute bottom-0 right-0 z-20 hidden h-24 w-24 cursor-grab md:block"
            aria-hidden="true"
          >
            <div
              className="absolute bottom-0 right-0 h-0 w-0 transition-all duration-300 ease-out group-hover:h-[22px] group-hover:w-[22px]"
              style={{
                background:
                  "linear-gradient(225deg, var(--paper) 0%, var(--paper-deep) 55%, var(--sheet-back) 100%)",
                clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
                boxShadow: "-2px -2px 9px rgba(34,20,6,0.2)",
              }}
            />
          </div>
        )}
      </div>

      <PageTurnBar
        page={page}
        total={total}
        labels={labels}
        onTurn={turn}
        hidden={showFold}
      />
    </div>
  );
}

function PageTurnBar({
  page,
  total,
  labels,
  onTurn,
  hidden,
}: {
  page: number;
  total: number;
  labels: string[];
  onTurn: (n: number) => void;
  hidden: boolean;
}) {
  return (
    <motion.nav
      className="mx-auto max-w-[1180px] mt-6 flex items-center justify-between gap-4 px-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.5, delay: hidden ? 0 : 0.3 }}
      aria-label="Newspaper pages"
    >
      <TurnButton
        side="prev"
        disabled={page === 0}
        onClick={() => onTurn(page - 1)}
        label={page > 0 ? labels[page - 1] : ""}
      />

      <div className="flex items-center gap-2.5">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onTurn(i)}
            aria-current={i === page ? "page" : undefined}
            title={label}
            className={`h-[7px] transition-all duration-300 cursor-pointer ${
              i === page
                ? "w-8 bg-[var(--accent)]"
                : "w-[7px] bg-[var(--rule)] hover:bg-[var(--ink-faint)]"
            }`}
          >
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>

      <TurnButton
        side="next"
        disabled={page === total - 1}
        onClick={() => onTurn(page + 1)}
        label={page < total - 1 ? labels[page + 1] : ""}
      />
    </motion.nav>
  );
}

function TurnButton({
  side,
  disabled,
  onClick,
  label,
}: {
  side: Side;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  const isNext = side === "next";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center gap-2.5 border-2 px-3.5 py-2 transition-colors duration-300 ${
        disabled
          ? "border-[var(--rule)] text-[var(--ink-faint)] opacity-40 cursor-default"
          : "border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] cursor-pointer"
      } ${isNext ? "flex-row-reverse" : ""}`}
    >
      <PointingHand
        className={`w-6 h-4 shrink-0 ${isNext ? "" : "rotate-180"}`}
      />
      <span className="kicker hidden sm:inline max-w-[13ch] truncate">
        {label || (isNext ? "End" : "Front")}
      </span>
    </button>
  );
}

/**
 * A broadsheet arrives folded in half. The sheet itself is clipped at the
 * crease, and a duplicate of the lower half swings down on the fold line.
 * The flap hides its own backface, so for the first half of the sweep you see
 * nothing below the crease — exactly as when opening a real paper.
 */
function FoldedSheet({
  children,
  onOpened,
}: {
  children: ReactNode;
  onOpened: () => void;
}) {
  return (
    <div className="relative">
      <div style={{ clipPath: "inset(0 0 50% 0)" }}>{children}</div>

      <motion.div
        className="absolute inset-0 sheet-3d"
        style={{ transformOrigin: "center center" }}
        initial={{ rotateX: 176 }}
        animate={{ rotateX: 0 }}
        transition={{ duration: 1.45, delay: 0.5, ease: PAPER_EASE }}
        onAnimationComplete={onOpened}
        aria-hidden="true"
      >
        <div style={{ clipPath: "inset(50% 0 0 0)" }}>{children}</div>
      </motion.div>

      <motion.div
        className="absolute left-0 right-0 flex justify-center pointer-events-none"
        style={{ top: "50%" }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        aria-hidden="true"
      >
        <span className="kicker mt-6 text-[var(--ink-faint)]">
          Unfolding the morning edition
        </span>
      </motion.div>
    </div>
  );
}
