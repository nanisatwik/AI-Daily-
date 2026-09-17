"use client";

import { useEffect, useState } from "react";

/**
 * The reader's own clock, set as folio furniture beside the edition date.
 *
 * Twelve-hour, with a full stop for the separator and the meridiem spelled
 * out — "9.42 P.M." is how a paper of the period set a time, and the whole
 * point of the line is that it does not look like a clock widget.
 */
function reading(now: Date): string {
  const hours = now.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
  // The `.meta` rule upper-cases this, so the copy stays readable in source.
  return `${hour12}.${minutes} ${hours < 12 ? "a.m." : "p.m."}`;
}

/** The longest reading there is, used to hold the column open. */
const WIDEST = "12.00 a.m.";

/**
 * The separator travels with the time it separates. Set in the folio line
 * instead, it showed as a bullet dangling after the date for as long as the
 * clock had nothing to say — which is the whole of the server's HTML.
 */
function Reading({ time }: { time: string }) {
  return (
    <>
      <span className="mx-2.5 text-[var(--rule)]" aria-hidden="true">
        &bull;
      </span>
      {time}
    </>
  );
}

export default function EditionClock() {
  /**
   * Null until mounted. The server has no idea what time it is where the
   * reader is, so rendering a time during SSR guarantees a mismatch and costs
   * us React's server HTML. The first client render therefore agrees with the
   * server — nothing — and the real time arrives a tick later.
   */
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    let timer: number;

    const tick = () => {
      const now = new Date();
      setTime(reading(now));

      /*
       * Scheduled to the next minute boundary rather than on a 60-second
       * interval. A plain interval drifts, so the displayed minute can change
       * up to a minute late; and seconds are deliberately absent — a figure
       * moving once a second draws the eye away from the paper and re-renders
       * sixty times as often for nothing a reader of a daily needs.
       */
      timer = window.setTimeout(
        tick,
        60_000 - (now.getSeconds() * 1000 + now.getMilliseconds())
      );
    };

    tick();

    /*
     * Browsers throttle timers in a hidden tab, so a paper left open in a
     * background tab comes back showing the time it was abandoned at. Resync
     * the moment it is looked at again.
     */
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /*
   * Two copies of the same markup stacked in one grid cell: an invisible one
   * set to the longest reading, and the live one on top. The grid takes the
   * width of the wider, so the column never changes size — not when the clock
   * arrives after hydration, and not at ten o'clock when the hour turns two
   * digits. Both matter because the date sits in a centred folio line, where
   * any change of width here nudges the date sideways.
   *
   * Tabular figures on top of that, so a minute ticking over cannot do it
   * either. It is the same trick FitText uses to reserve the nameplate.
   */
  return (
    <span className="inline-grid tabular-nums">
      <span
        className="col-start-1 row-start-1 invisible whitespace-nowrap"
        aria-hidden="true"
      >
        <Reading time={WIDEST} />
      </span>
      <span
        className="col-start-1 row-start-1 whitespace-nowrap"
        suppressHydrationWarning
      >
        {time && <Reading time={time} />}
      </span>
    </span>
  );
}
