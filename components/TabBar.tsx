"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The floating nav, for the phone only.
 *
 * The desktop paper already knows how to move: the corner peel turns the
 * sheet, SectionNav and StopPress sit across the top of the front page, and
 * KeyboardNav binds the arrows and Escape. None of that reaches a phone. Below
 * `lg` the three-column grid has collapsed to one, the section nav is a strip
 * a reader has already scrolled past, and the only way from the foot of a
 * column to the index, the wireless or Your Edition is to scroll the whole
 * paper back to the top and start again. This is the bar that fixes that, and
 * it is hidden at `lg:` and up because above that width it would be a second
 * answer to a question the paper has already answered twice.
 *
 * The material is `.glass` from globals.css and nothing else — no
 * `backdrop-filter` is declared here, because the one in that file is
 * deliberately switched off inside `.turning` and a second declaration on this
 * element would survive the suspension and keep the compositor re-sampling the
 * whole screen through every frame of a page turn.
 */

/* ------------------------------------------------------------------ *
 * Icons
 * ------------------------------------------------------------------ */

/*
 * Drawn in the same hand as components/Ornament.tsx: outline only, currentColor,
 * round caps, and decorative — the accessible name of each tab is the text
 * beside the icon, which is why every one of these is `aria-hidden`. A 1.7
 * stroke rather than Ornament's 1.4: these are drawn at 20px where the corner
 * flourishes are drawn at 56 and up, and at that size 1.4 thins to grey.
 */

type IconProps = { className?: string };

const STROKE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.7",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** A folded broadsheet, half-open. */
function FoldedSheet({ className = "" }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M4 20V6a1 1 0 011-1h10a1 1 0 011 1v14M4 20h16a1 1 0 001-1v-9a1 1 0 00-1-1h-4M7 9h6M7 13h6M7 16h3" />
    </svg>
  );
}

/** A magnifier, for the index. */
function Magnifier({ className = "" }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.5-4.5" />
    </svg>
  );
}

/** A studio microphone, for the wireless. */
function Microphone({ className = "" }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" />
      <path d="M6 11v1a6 6 0 0012 0v-1M12 18v3" />
    </svg>
  );
}

/** The subscriber, for their own edition. */
function Subscriber({ className = "" }: IconProps) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The four destinations
 * ------------------------------------------------------------------ */

type Destination = {
  href: string;
  /** The name the paper already calls this page — see the `label` each sheet
      is given in app/search, app/briefing and app/yours. Printing a different
      word here would give a reader two names for one page. */
  label: string;
  Icon: (props: IconProps) => React.ReactElement;
  /** Other addresses this tab stands for. See `lit` below. */
  covers?: (pathname: string) => boolean;
};

const DESTINATIONS: Destination[] = [
  {
    href: "/",
    label: "Front page",
    Icon: FoldedSheet,
    /*
     * A column and a desk are the inside of the same paper, and a reader who
     * has tapped through to one has not left the edition. Leaving all four
     * tabs unlit on /story and /section — which is what an exact match alone
     * gives you, since neither address is any tab's own — reads as the bar
     * having lost its place rather than as the reader having gone somewhere
     * the bar does not cover. Those two routes account for 141 of the paper's
     * 155 pages, so "unlit" would be the state the bar is in almost always.
     */
    covers: (p) => p.startsWith("/story/") || p.startsWith("/section/"),
  },
  { href: "/search", label: "The index", Icon: Magnifier },
  { href: "/briefing", label: "The wireless", Icon: Microphone },
  { href: "/yours", label: "Your edition", Icon: Subscriber },
];

/* ------------------------------------------------------------------ *
 * The bar
 * ------------------------------------------------------------------ */

/**
 * How far the bar floats off the bottom of the screen.
 *
 * `env(safe-area-inset-bottom)` is 34px on a handset with a home indicator and
 * 0 on everything else, and app/layout.tsx sets `viewportFit: "cover"` so the
 * value actually arrives rather than being letterboxed away. Taking the larger
 * of it and 22px lands the bar exactly where the mockup puts it on a device
 * with no indicator, and clear of the indicator on a device with one, from a
 * single expression. Adding the two instead would push it 56px up a phone,
 * which is a thumb's width of wasted paper.
 *
 * Written as a string rather than a Tailwind arbitrary value because it is
 * needed three times below, at three different offsets, and one definition
 * cannot drift from the other two.
 */
const LIFT = "max(env(safe-area-inset-bottom, 0px), 22px)";

/** The pane itself: 60px of glass, as the mockup draws it. */
const BAR_HEIGHT = 60;

export default function TabBar() {
  const pathname = usePathname();

  return (
    /*
     * The wrapper is the scroll runway as well as the container.
     *
     * The bar is fixed, so it takes no space and the foot of the paper ends up
     * underneath it — the last line of a column, or the folio rule, sitting
     * behind glass with no way to scroll it clear. Giving this element the
     * bar's own height in normal flow buys exactly that much blank newsprint
     * at the end of every page that mounts it, and costs nothing when the page
     * is shorter than the screen, because the `min-h-screen` wrapper it sits
     * in is already taller than its content there.
     *
     * `lg:hidden` takes the runway away with the bar, so the desktop paper is
     * untouched to the pixel.
     */
    <div
      className="lg:hidden print:hidden"
      style={{ height: `calc(${LIFT} + ${BAR_HEIGHT + 12}px)` }}
    >
      {/*
        The paper fading out under the glass.
        Without it the bar cuts a hard line across a justified column and the
        column reads as having been sliced off rather than as continuing
        underneath. `.chrome-fade` is the shared gradient — it resolves
        `var(--paper)`, so it follows the edition into the night without a
        second declaration here.
      */}
      <div
        className="chrome-fade pointer-events-none fixed inset-x-0 bottom-0 z-30"
        style={{ height: `calc(${LIFT} + ${BAR_HEIGHT + 48}px)` }}
        aria-hidden="true"
      />

      {/*
        z-40 is chosen from both sides. Above the fade at 30 and above the
        sheet, which tops out at 25 inside PageSheet; below the grain and the
        vignette at 60 and 59, so the bar is photographed in the same room as
        the paper rather than pasted on over the top of it; and below the
        first-run order form at 60, so the bar sits behind that scrim exactly
        as the newspaper behind it does, instead of floating over a dialog that
        declares itself modal.
      */}
      <nav
        aria-label="The paper"
        className={`glass fixed inset-x-4 z-40 flex items-center justify-around rounded-full px-1.5`}
        style={{ bottom: LIFT, height: `${BAR_HEIGHT}px` }}
      >
        {DESTINATIONS.map(({ href, label, Icon, covers }) => {
          /*
           * `aria-current="page"` is the narrow claim — this address *is* that
           * page — and it is only ever true of an exact match. The filled pill
           * is the broader one: where in the paper you are. They come apart on
           * a story and on a desk, and when they do the honest thing is to
           * light the tab and stay quiet in ARIA rather than tell a screen
           * reader it is on the front page when it is reading a column.
           */
          const here = pathname === href;
          const lit = here || (covers?.(pathname) ?? false);

          return (
            <Link
              key={href}
              href={href}
              aria-current={here ? "page" : undefined}
              /*
               * 44px tall, where the mockup draws the pill at 42. Two pixels,
               * bought because 44 is the smallest target both Apple and the
               * WCAG target-size rule will accept and this is the one control
               * on the page a thumb reaches for without looking. At 50 wide
               * inside a 60 bar the difference is not visible.
               */
              className={`grid h-11 w-[50px] place-items-center rounded-full transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                lit
                  ? /*
                     * The wash is mixed from `--ink` rather than written as the
                     * two rgba() literals the mockup uses, so it inverts with
                     * the edition on its own: by day that is dark ink at a
                     * tenth over a light pane, at night it is the cream `--ink`
                     * at fifteen hundredths over a dark one. Two literals would
                     * be a colour with no night twin, which is the one thing
                     * the palette in globals.css asks you not to leave behind.
                     */
                    "bg-[color-mix(in_srgb,var(--ink)_10%,transparent)] night:bg-[color-mix(in_srgb,var(--ink)_15%,transparent)] text-[var(--ink)] opacity-100"
                  : "text-[var(--ink-soft)] opacity-[0.78]"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="sr-only">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
