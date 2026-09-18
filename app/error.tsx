"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import Link from "next/link";
import { PointingHand, FleuronRule, Seal } from "@/components/Ornament";

/**
 * The recoverable error boundary: the presses have jammed, not broken.
 *
 * This file is the fallback for everything under the root layout — pages,
 * nested layouts, `loading.tsx` and `not-found.tsx` all sit inside it. It does
 * *not* cover the root layout itself, which is why `global-error.tsx` exists
 * alongside it.
 *
 * The prop is `retry`, not `reset`. That is a genuine break from what older
 * App Router code does: this version's `error.js` guide lists `retry` as the
 * prop that became stable in 16.3.0, and says of `reset` that "in most cases,
 * you should use retry() instead" — `reset` only clears the error state and
 * re-renders the children it already has, where `retry` re-fetches them. For a
 * paper whose failures are overwhelmingly a read of the edition that did not
 * come back, clearing the flag without re-fetching would just throw again on
 * the next paint, and the reader would press the button to no visible effect.
 *
 * The furniture here is hand-set rather than borrowed from PageSheet. A jam
 * can be thrown by any part of the sheet machinery, and a boundary that
 * renders the same components that just failed can fail in its own right —
 * whereupon the error escalates past this file to global-error and the reader
 * gets the bare last resort instead of a page in the paper's voice. So this
 * imports only leaf SVG ornaments and plain markup: no digest read, no data,
 * nothing that can throw a second time.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    /*
     * The console is the whole of this paper's error reporting, and that is a
     * deliberate choice rather than a gap: everything here must cost $0, which
     * rules out a hosted error service. In production the `error` handed to a
     * client boundary is redacted down to a generic message plus `digest`, so
     * the digest is logged explicitly — it is the only string that ties what a
     * reader saw to the real stack in the server's own log.
     */
    console.error("[the press jammed]", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7 flex items-center justify-center">
      <div className="relative mx-auto w-full max-w-[680px] border-2 border-[var(--ink)] bg-[var(--paper)] px-5 sm:px-10 py-8">
        <div className="flex items-center justify-between gap-4 pb-4">
          <span className="kicker text-[var(--ink-soft)]">The AI Daily</span>
          <span className="kicker text-[var(--accent)]">Press room</span>
        </div>

        <div className="rule-double" />

        <div className="pt-8 text-center">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex-1 h-px bg-[var(--rule)]" />
            <span className="kicker text-[var(--accent)]">
              Interruption of service
            </span>
            <span className="flex-1 h-px bg-[var(--rule)]" />
          </div>

          <h1
            className="headline-caps"
            style={{ fontSize: "clamp(1.7rem, 4.6vw, 2.7rem)" }}
          >
            The presses have jammed
          </h1>

          <div className="my-6 h-[4px] border-t border-b border-[var(--ink)]" />

          {/* Balanced, like the `.headline-caps` rule in globals.css: unbalanced
              this deck left the word "lost." alone on a third line, which is a
              poor place to break a sentence that exists to reassure. */}
          <p
            className="font-body italic text-balance text-[var(--ink-soft)] max-w-[42ch] mx-auto leading-[1.45]"
            style={{ fontSize: "clamp(1rem, 2.2vw, 1.22rem)" }}
          >
            Something went wrong printing this page. Nothing you did caused it,
            and nothing you were reading has been lost.
          </p>

          {/* ink-faint for the same reason as on the 404: the rule colour is
              too light to read 9px type against the paper. */}
          <div className="mt-8 flex justify-center text-[var(--ink-faint)]">
            <Seal top="Press" bottom="Halted" className="w-[80px] h-[80px]" />
          </div>

          <p className="font-body text-[15px] leading-[1.6] text-pretty text-[var(--ink-soft)] max-w-[48ch] mx-auto mt-8">
            Run the sheet again with the button below. A jam of this kind is
            often a single bad impression and clears on the second pass. If it
            does not, the front page is being printed from the same edition and
            should come up clean.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => retry()}
              className="kicker cursor-pointer border-2 border-[var(--ink)] px-6 py-2.5 hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors duration-300"
            >
              Run the sheet again
            </button>
            <Link
              href="/"
              className="kicker inline-flex items-center gap-2 border border-[var(--rule)] px-6 py-2.5 text-[var(--ink-soft)] hover:bg-[var(--ink)] hover:text-[var(--paper)] hover:border-[var(--ink)] transition-colors duration-300"
            >
              <PointingHand className="w-6 h-4 rotate-180" />
              Front page
            </Link>
          </div>

          <FleuronRule className="text-[var(--rule)] mt-10" />

          {/*
            The digest, printed small, because it is the only handle a reader
            has on their own incident. Production strips the message before it
            reaches the client, so without this line a report of "it broke"
            cannot be matched against anything in the server log.
          */}
          {error.digest && (
            <p className="meta mt-5">Reference {error.digest}</p>
          )}
        </div>
      </div>
    </div>
  );
}
