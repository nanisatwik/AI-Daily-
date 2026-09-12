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
import { curlGeometry, BEND_SEGMENTS } from "@/lib/curl";

const PAPER_EASE = [0.22, 1, 0.28, 1] as const;
/** Past this share of a turn, letting go finishes it. */
const COMMIT_AT = 0.45;
/** Movement before a press becomes a drag, so clicks still work. */
const SLOP = 8;
/** A full, uninterrupted turn. */
const TURN_MS = 1050;
/** Where a driven turn is taken hold of — low and right, as a reader would. */
const DRIVEN_GRAB = 0.75;

/** Free-edge position with the sheet lying flat — far enough right for no curl. */
const flatAt = (w: number) => w * 1.02;
/** Free-edge position with the sheet fully turned and clear of the page. */
const turnedAt = (w: number) => -w * 1.15;

type Props = { pages: ReactNode[]; labels: string[] };
type Side = "next" | "prev";
type Lift = { target: number; side: Side; h: number };

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

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default function Newspaper({ pages, labels }: Props) {
  const reduce = useReducedMotion();
  const [folded, setFolded] = useState(true);
  const [page, setPage] = useState(0);
  /** Non-null only while a sheet is off the table. Never set per-frame. */
  const [lifting, setLifting] = useState<Lift | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);
  const pageLayer = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const curlLayer = useRef<HTMLDivElement>(null);
  const liftedRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);

  const size = useRef({ w: 0, h: 0 });
  const cursor = useRef(0);
  const grabX = useRef(0);
  const grabY = useRef(-1);
  const amount = useRef(0);
  const sideRef = useRef<Side>("next");
  const targetRef = useRef<number | null>(null);
  const pending = useRef<{ cx: number; lx: number; ly: number } | null>(null);
  const dragging = useRef(false);
  const frame = useRef(0);
  const anim = useRef(0);

  const total = pages.length;

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => {
      size.current = { w: el.clientWidth, h: el.clientHeight };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page, folded]);

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
    },
    []
  );

  /**
   * Writes the curl straight to the DOM. Called from rAF only — React does not
   * render while a page is being held, which is what keeps this feeling like
   * paper rather than a slideshow.
   *
   * Both directions share one coordinate system: a sheet always curls from the
   * right edge leftwards. Turning back is the same motion run backwards, with
   * the incoming page as the one in flight — so there is no mirroring, and no
   * flipped handedness to invert the depth order of the bend.
   */
  const paint = useCallback(() => {
    const { w, h } = size.current;
    const pageEl = pageLayer.current;
    // Wait for the curl rig to mount. Clipping the page before the bend exists
    // would show one frame of a sheet cut off against nothing.
    if (!pageEl || !curlLayer.current || w === 0) return;

    const g = curlGeometry(w, h, cursor.current, grabY.current);

    if (!g) {
      pageEl.style.clipPath = "";
      curlLayer.current.style.opacity = "0";
      return;
    }

    pageEl.style.clipPath = g.pageClip;
    curlLayer.current.style.opacity = "1";

    // Lean the whole rig so the crease follows the corner being led.
    const rig = rigRef.current;
    if (rig) {
      rig.style.transformOrigin = `${g.pivot.x.toFixed(
        2
      )}px ${g.pivot.y.toFixed(2)}px`;
      rig.style.transform = `rotate(${g.rigRotateDeg.toFixed(3)}deg)`;
    }

    for (let i = 0; i < g.segments.length; i++) {
      const el = segRefs.current[i];
      const s = g.segments[i];
      if (!el || !s) continue;
      el.style.transform = s.transform;
      el.style.width = `${(s.width + 1).toFixed(2)}px`;
      // A shade over each strip is the cheapest way to light a curve: only the
      // child's opacity changes, so the compositor handles it.
      const shade = el.firstElementChild as HTMLElement | null;
      if (shade) shade.style.opacity = ((1 - s.light) * 0.62).toFixed(3);
    }

    const lifted = liftedRef.current;
    if (lifted) {
      lifted.style.transform = g.lifted.transform;
      lifted.style.clipPath = g.lifted.clip;
      const shade = lifted.querySelector<HTMLElement>("[data-shade]");
      if (shade) shade.style.opacity = ((1 - g.lifted.light) * 0.62).toFixed(3);
    }

    const shadow = shadowRef.current;
    if (shadow) {
      shadow.style.left = `${g.shadow.left.toFixed(2)}px`;
      shadow.style.width = `${g.shadow.width.toFixed(2)}px`;
      shadow.style.opacity = g.shadow.opacity.toFixed(3);
      // The cast follows the crease, so it leans with it.
      shadow.style.transformOrigin = `${g.pivot.x.toFixed(
        2
      )}px ${g.pivot.y.toFixed(2)}px`;
      shadow.style.transform = `rotate(${g.rigRotateDeg.toFixed(3)}deg)`;
    }
  }, []);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      paint();
    });
  }, [paint]);

  const reset = useCallback(() => {
    targetRef.current = null;
    pending.current = null;
    dragging.current = false;
    amount.current = 0;
    grabY.current = -1;
    if (pageLayer.current) pageLayer.current.style.clipPath = "";
    setLifting(null);
  }, []);

  /** Carry the free edge to a destination, painting directly, then finish. */
  const glide = useCallback(
    (toX: number, ms: number, commit: number | null) => {
      cancelAnimationFrame(anim.current);
      const from = cursor.current;
      const start = performance.now();

      const step = (now: number) => {
        const t = Math.min((now - start) / ms, 1);
        cursor.current = from + (toX - from) * pageEase(t);
        paint();

        if (t < 1) {
          anim.current = requestAnimationFrame(step);
        } else {
          if (commit !== null) setPage(commit);
          reset();
        }
      };
      anim.current = requestAnimationFrame(step);
    },
    [paint, reset]
  );

  const begin = useCallback(
    (s: Side, target: number, atX: number, atY: number) => {
      const { w } = size.current;
      sideRef.current = s;
      targetRef.current = target;
      grabX.current = atX;
      grabY.current = atY;
      amount.current = 0;
      // Start at the pose that matches what is already on screen, so taking
      // hold of the sheet never makes it jump.
      cursor.current = s === "next" ? flatAt(w) : turnedAt(w);
      setLifting({
        target,
        side: s,
        h: sheetRef.current?.offsetHeight ?? 0,
      });
    },
    []
  );

  /** Turn by control rather than by hand — the same curl, driven for you. */
  const turn = useCallback(
    (next: number) => {
      if (next < 0 || next >= total || next === page || lifting) return;
      const { w } = size.current;

      if (reduce || w === 0) {
        setPage(next);
        return;
      }

      const forward = next > page;
      const h = sheetRef.current?.offsetHeight ?? 0;
      begin(
        forward ? "next" : "prev",
        next,
        forward ? w : 0,
        h * DRIVEN_GRAB
      );
      dragging.current = false;
      requestAnimationFrame(() =>
        glide(forward ? turnedAt(w) : flatAt(w), TURN_MS, next)
      );
    },
    [begin, glide, lifting, page, reduce, total]
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

  const localX = (clientX: number) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    return rect ? clientX - rect.left : null;
  };

  const localY = (clientY: number) => {
    const rect = sheetRef.current?.getBoundingClientRect();
    return rect ? clientY - rect.top : 0;
  };

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reduce || lifting || e.button !== 0) return;
      // Never steal a press that belongs to a link, a control, or a selection.
      if ((e.target as HTMLElement).closest("a, button, input, textarea, select"))
        return;

      const lx = localX(e.clientX);
      if (lx === null) return;
      pending.current = { cx: e.clientX, lx, ly: localY(e.clientY) };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    },
    [lifting, reduce]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const lx = localX(e.clientX);
      if (lx === null) return;

      const p = pending.current;
      if (p && !dragging.current) {
        const dx = e.clientX - p.cx;
        if (Math.abs(dx) < SLOP) return;

        const forward = dx < 0;
        const target = forward ? page + 1 : page - 1;
        if (target < 0 || target >= total) {
          pending.current = null;
          return;
        }
        begin(forward ? "next" : "prev", target, p.lx, p.ly);
        dragging.current = true;
      }

      if (!dragging.current) return;
      e.preventDefault();

      const { w } = size.current;
      if (sideRef.current === "next") {
        // Forwards the free edge rides under the hand: offset from where the
        // sheet was taken hold of, so it lifts from the point being pulled.
        const pulled = Math.max(grabX.current - lx, 0);
        amount.current = clamp01(pulled / w);
        cursor.current = flatAt(w) - pulled;
      } else {
        // Backwards there is no free edge to hold — the sheet is already over
        // on the left — so the hand's travel drives the turn directly.
        const pushed = Math.max(lx - grabX.current, 0);
        amount.current = clamp01(pushed / w);
        cursor.current =
          turnedAt(w) + amount.current * (flatAt(w) - turnedAt(w));
      }
      schedule();
    },
    [begin, page, schedule, total]
  );

  const onPointerUp = useCallback(() => {
    pending.current = null;
    if (!dragging.current) return;
    dragging.current = false;

    const { w } = size.current;
    const forward = sideRef.current === "next";
    const done = amount.current >= COMMIT_AT && targetRef.current !== null;

    // Time what is left of the turn, so a nearly finished page does not crawl
    // and a barely started one does not snap.
    const left = done ? 1 - amount.current : amount.current;
    const ms = Math.max(300, Math.min(TURN_MS * left * 1.4, 720));

    if (done) {
      glide(forward ? turnedAt(w) : flatAt(w), ms, targetRef.current);
    } else {
      glide(forward ? flatAt(w) : turnedAt(w), ms, null);
    }
  }, [glide]);

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
  const flyingSheet = pages[flying];

  return (
    <div className="stage">
      <div
        ref={sheetRef}
        className={`relative ${lifting ? "select-none" : ""}`}
        onPointerDown={reduce ? undefined : onPointerDown}
        onPointerMove={reduce ? undefined : onPointerMove}
        onPointerUp={reduce ? undefined : onPointerUp}
        onPointerCancel={reduce ? undefined : onPointerUp}
        style={{
          cursor: lifting ? "grabbing" : undefined,
          touchAction: "pan-y",
          // Hold the height still for the length of the turn. Pages differ in
          // length, and letting the box resize mid-flight reads as a lurch.
          height: lifting ? lifting.h : undefined,
        }}
      >
        {beneath !== null && (
          <div className="absolute top-0 left-0 w-full z-0" aria-hidden="true">
            {pages[beneath]}
          </div>
        )}

        {/* No will-change here: promoting this layer switches the body text
            from subpixel to grayscale antialiasing and visibly washes out the
            ink, and it buys nothing — a clip-path change repaints regardless. */}
        <div
          ref={pageLayer}
          className={
            lifting ? "absolute top-0 left-0 w-full z-10" : "relative z-10"
          }
        >
          {showFold ? (
            <FoldedSheet onOpened={() => setFolded(false)}>
              {flyingSheet}
            </FoldedSheet>
          ) : (
            flyingSheet
          )}

          {/* Cast by the raised sheet onto the page still lying flat. */}
          {lifting && (
            <div
              ref={shadowRef}
              className="absolute z-20 pointer-events-none opacity-0"
              style={{
                top: "-12%",
                height: "124%",
                willChange: "left, width, opacity, transform",
                background:
                  "linear-gradient(to left, rgba(26,15,4,0.85) 0%, rgba(26,15,4,0.34) 22%, rgba(26,15,4,0) 78%)",
              }}
              aria-hidden="true"
            />
          )}
        </div>

        {lifting && (
          // Flat wrapper, kept out of the 3D context purely to trim anything
          // the leaning rig pushes past the edges of the sheet.
          <div
            className="absolute inset-0 z-30 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <div ref={rigRef} className="absolute inset-0">
              <div
                ref={curlLayer}
                className="absolute inset-0 opacity-0"
                style={{
                  transformStyle: "preserve-3d",
                  perspective: "1500px",
                  perspectiveOrigin: "50% 34%",
                }}
              >
                {/* The bend: strips around a half-cylinder, each lit by angle.
                    Run tall so a leaning crease still covers the full sheet. */}
                {Array.from({ length: BEND_SEGMENTS }).map((_, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      segRefs.current[i] = el;
                    }}
                    className="absolute left-0"
                    style={{
                      top: "-12%",
                      height: "124%",
                      transformOrigin: "0 0",
                      background: "var(--paper)",
                      willChange: "transform",
                      backfaceVisibility: "hidden",
                    }}
                  >
                    <div
                      className="absolute inset-0 bg-[#150d03] opacity-0"
                      style={{ willChange: "opacity" }}
                    />
                  </div>
                ))}

                {/* The run already lifted: flat, face-down, off the page. */}
                <div
                  ref={liftedRef}
                  className="absolute left-0 w-full"
                  style={{
                    top: "-12%",
                    height: "124%",
                    transformOrigin: "0 0",
                    willChange: "transform, clip-path",
                    backfaceVisibility: "hidden",
                  }}
                >
                  <div
                    className="absolute inset-0 bg-[var(--paper)]"
                    style={{ borderRight: "1px solid rgba(120,96,58,0.55)" }}
                  />
                  {/* Newsprint is thin: the far face shows faintly through.
                      Held at the sheet's own offset inside the taller box. */}
                  <div
                    className="absolute left-0 w-full opacity-[0.11]"
                    style={{ top: "9.677%" }}
                  >
                    {flyingSheet}
                  </div>
                  <div
                    data-shade
                    className="absolute inset-0 bg-[#150d03] opacity-0"
                    style={{ willChange: "opacity" }}
                  />
                </div>
              </div>
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
