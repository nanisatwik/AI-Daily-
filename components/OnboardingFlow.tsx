"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferences } from "./Preferences";
import { Fleuron } from "./Ornament";
import { InkStamp, PageIn, PressIn } from "./motion";

type Desk = { section: string; count: number };

type Props = {
  /** Feeds in the registry the press run polls. */
  wires: number;
  /** Everything pulled off them before deduplication. */
  items: number;
  /** Columns in today's edition. */
  stories: number;
  /**
   * Outlets credited across every column, deduplicated by publisher.
   *
   * Carried so the first screen can tell the two halves of the gap apart: the
   * second reports that folded into a printed column, and the items that were
   * never printed. See the note where it is computed in Onboarding.tsx.
   */
  credited: number;
  edition: number;
  dateLabel: string;
  desks: Desk[];
};

const STEPS = 3;

/** One id, moved from screen to screen: only one heading is mounted at a time. */
const TITLE_ID = "onboarding-title";

/**
 * Thousands separators by hand rather than through `Intl.NumberFormat`.
 *
 * This number is printed once on the server and again in the browser during
 * hydration, and the two need not carry the same ICU data — Node can be built
 * with a trimmed one. A grouping that disagreed across that boundary is a
 * hydration mismatch on the paper's first screen. A loop cannot disagree.
 */
function group(n: number): string {
  const digits = String(n);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

/**
 * First run, as the reader meets the paper before any of it has been printed
 * for them.
 *
 * It is set on the dark shell rather than on cream stock, and that is the whole
 * argument for the rewrite: this is not a page of the edition, it is the press
 * room the edition is handed over in. `.shell` is the ground and `.halftone`
 * is a five-pixel dot field over it — the screen a press puts a photograph
 * through — which buys the depth of a photograph without shipping an image.
 *
 * Three screens, in the order a stranger needs them: what the paper is called,
 * what it does that no rival does, and the one question it asks back. It is
 * skippable from the first of them, and a reader who skips is never asked
 * again.
 */
export default function OnboardingFlow({
  wires,
  items,
  stories,
  credited,
  edition,
  dateLabel,
  desks,
}: Props) {
  const { prefs, ready, update, toggleTopic } = usePreferences();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * Wait for localStorage. Rendering before we know whether this reader has
   * already subscribed flashes the whole flow at returning readers on every
   * single visit — `ready` is the provider's signal that the values on screen
   * are the reader's own and not the defaults the server rendered with.
   */
  const open = ready && !prefs.onboarded && !closing;

  const finish = useCallback(() => {
    // Closed locally as well as in preferences: `update` is a write that comes
    // back through context a tick later, and the screen should go when the
    // finger comes off the button, not a tick after it.
    setClosing(true);
    update({ onboarded: true });
  }, [update]);

  /*
   * Focus follows the screen. Moving it to the panel rather than to the button
   * means a screen reader announces the new heading and its copy on arrival,
   * instead of reading out "Continue" three times and never saying what was
   * being continued from.
   */
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  /*
   * Keys, taken in the capture phase on `window` on purpose.
   *
   * components/KeyboardNav.tsx listens on `window` in the bubble phase and
   * binds Escape to "go to the front page", plus j / k / n / ? to the paper's
   * own shortcuts. Those belong to the edition, and the edition is behind a
   * modal. Capturing above them is the only place a handler can both act and
   * stop the paper from acting on the same keystroke — a React `onKeyDown` on
   * this element runs after the window listener has already fired, so Escape
   * would dismiss this and navigate the reader off their story at once.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish();
        return;
      }

      if (e.key === "Tab") {
        // Every focusable thing in here is a button, so this is the whole tab
        // ring. Wrapping it is what makes the dialog modal in practice as well
        // as in its ARIA: without it, Tab walks off the last control and into
        // the paper underneath, which cannot be seen or clicked.
        const buttons = Array.from(
          rootRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled])"
          ) ?? []
        );
        if (buttons.length === 0) return;

        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = !!active && rootRef.current?.contains(active);

        if (e.shiftKey && (!inside || active === first)) {
          e.preventDefault();
          e.stopPropagation();
          last.focus();
        } else if (!e.shiftKey && (!inside || active === last)) {
          e.preventDefault();
          e.stopPropagation();
          first.focus();
        }
        return;
      }

      if (/^[jkn?]$/i.test(e.key)) e.stopPropagation();
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, finish]);

  if (!open) return null;

  const last = step === STEPS - 1;
  const advance = () => (last ? finish() : setStep((s) => s + 1));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      /*
       * `night` alongside `shell`. The shell is dark in both editions, so the
       * day palette cannot be used on it — `--ink` is #2b1f12 by day, which is
       * ink on ink here and reads as nothing at all. Re-declaring the dark
       * values as literals would be a second copy of the night block; setting
       * the class remaps the tokens for this subtree only, and every shared
       * class inside — .meta, .kicker, .headline-caps, .glass — comes out
       * right without being told about the shell.
       */
      className="night shell fixed inset-0 z-[70] flex flex-col overscroll-contain"
    >
      <div
        aria-hidden="true"
        className="halftone pointer-events-none absolute inset-0 opacity-50"
      />

      <PageIn
        key={step}
        className="relative z-10 flex min-h-0 flex-1 flex-col"
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col outline-none"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          {/*
            Centred with `m-auto` on the child rather than `items-center` on
            the scroller. A flex container that centres its child and then has
            to scroll clips the top of that child instead of scrolling to it,
            which on a short phone in landscape would cut the nameplate in
            half with no way to reach it. Auto margins collapse to zero once
            the child is taller than the box.
          */}
          <div className="flex min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            <div className="m-auto w-full max-w-[420px]">
              {step === 0 && <ColdOpen />}
              {step === 1 && (
                <Wires wires={wires} items={items} stories={stories} credited={credited} />
              )}
              {step === 2 && (
                <Desks
                  desks={desks}
                  chosen={prefs.topics}
                  onToggle={toggleTopic}
                />
              )}
            </div>
          </div>

          <div
            className="mx-auto w-full max-w-[420px] shrink-0 px-6 text-center"
            style={{
              // The paper runs under the notch — app/layout.tsx asks for
              // viewportFit: "cover" — so the foot of this has to clear the
              // home indicator itself or the skip line sits under it.
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 2.25rem)",
            }}
          >
            {step === 0 ? (
              <p className="meta">
                No. {edition} &middot; {dateLabel}
              </p>
            ) : (
              <>
                <h2
                  id={TITLE_ID}
                  className="headline-caps text-[clamp(1.55rem,7.4vw,1.95rem)] leading-[1.06] text-[var(--ink)]"
                >
                  {step === 1 ? "One event, one column" : "Which desks do you read?"}
                </h2>
                <p className="font-body mx-auto mt-3 max-w-[34ch] text-[14px] italic leading-[1.5] text-[var(--ink-soft)]">
                  {step === 1
                    ? "Every wire is read overnight. What survives is one column per event, however many outlets filed it."
                    : "Everything is printed either way. This only decides what leads your edition."}
                </p>
              </>
            )}

            {/*
              The dots are decoration; this is the same fact for a reader who
              cannot see them. Deliberately not a live region: each screen is a
              fresh mount, so the node is replaced rather than changed, and a
              replaced live region either says nothing or says it twice. Focus
              moving to the panel is what announces the screen, and this line
              is read as part of it.
            */}
            <p className="sr-only">
              Step {step + 1} of {STEPS}
            </p>

            <div
              aria-hidden="true"
              className="my-5 flex items-center justify-center gap-1.5"
            >
              {Array.from({ length: STEPS }, (_, i) => (
                <span
                  key={i}
                  className={
                    i === step
                      ? "h-[5px] w-[18px] rounded-[3px] bg-[var(--accent)]"
                      : "h-[5px] w-[5px] rounded-full bg-[rgba(236,224,198,0.25)]"
                  }
                />
              ))}
            </div>

            <PressIn>
              <button
                type="button"
                onClick={advance}
                className="kicker w-full cursor-pointer rounded-full bg-[var(--ink)] py-4 text-[12.5px] font-bold tracking-[0.14em] text-[var(--paper)] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)]"
              >
                {last ? "Open the edition" : "Continue"}
              </button>
            </PressIn>

            {/*
              Skippable from the first screen rather than only from the last.
              Nothing in this flow is required to read the paper, so a reader
              who wants the paper should never have to page through three
              screens to reach it — and keeping the line on every screen also
              stops the button above it moving between screens, which is what
              happens when a control appears only at the end.
            */}
            <button
              type="button"
              onClick={finish}
              className="meta mt-4 cursor-pointer transition-colors duration-200 hover:text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)]"
            >
              Skip &mdash; give me the whole paper
            </button>
          </div>
        </div>
      </PageIn>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The screens
 * ------------------------------------------------------------------ */

/** The nameplate, the ornament rule, and the strap line. Nothing to tap. */
function ColdOpen() {
  return (
    <div className="text-center">
      <p className="kicker tracking-[0.4em] text-[var(--accent)]">
        Off the press
      </p>

      {/*
        Stamped on rather than faded in. The nameplate is the one piece of
        blackletter in the product and it is the first thing a reader ever sees
        of it; InkStamp lands it at 1.28 scale with a degree and a half of
        rotation, which is a type slug meeting paper.
      */}
      <InkStamp delay={0.1}>
        <h2
          id={TITLE_ID}
          className="font-mast mt-5 whitespace-nowrap leading-[0.98] text-[var(--ink)]"
          style={{ fontSize: "clamp(2.1rem, 11.5vw, 3.1rem)" }}
        >
          The AI Daily
        </h2>
      </InkStamp>

      <div className="ornament-rule mx-auto mt-5 max-w-[280px] text-[rgba(236,224,198,0.22)]">
        <Fleuron className="h-4 w-8 text-[#c9a86a]" />
      </div>

      <p className="font-body mx-auto mt-5 max-w-[26ch] text-[15px] italic leading-[1.55] text-[var(--ink-soft)]">
        Everything that mattered in artificial intelligence this morning.
      </p>
    </div>
  );
}

/**
 * The one number no rival can print, printed first.
 *
 * Every figure here is read off today's edition. The middle one is the same
 * `totalItems` the folio line already sets as "N items → N stories" in the
 * masthead, so the two agree by construction rather than by anyone remembering
 * to change both.
 */
function Wires({
  wires,
  items,
  stories,
  credited,
}: {
  wires: number;
  items: number;
  stories: number;
  /** Outlets credited across the paper; see the note in Onboarding.tsx. */
  credited: number;
}) {
  return (
    <div>
      <div className="flex items-start justify-center">
        <Figure value={group(wires)} label="Wires" delay={0} />
        <Arrow />
        <Figure value={group(items)} label="Items" delay={0.12} />
        <Arrow />
        <Figure value={group(stories)} label="Stories" delay={0.24} lead />
      </div>

      {/*
        Two numbers, because they are two different things.

        The mockup put the whole gap between items and columns under the word
        "duplicates". It is not one: of the 3,022 items that did not become a
        column on 2026-09-19, only 47 were another outlet's report of an event
        the paper had already set. The other 2,975 were never printed at all.
        Printing the gap as a single figure invites the reading that three
        thousand duplicates were folded into fifty-four columns, which is
        false by a factor of sixty.

        Said separately, both are true and the second is the better claim
        anyway: a paper that reads three thousand items and prints fifty-four
        is being selective, which is the thing worth boasting about. "Folded
        in or set aside" was the earlier hedge here, and it was defensible
        without being clear.
      */}
      <p className="meta mt-4 text-center leading-[1.9]">
        <span className="text-[var(--accent)]">
          {group(credited - stories)} second reports folded in
        </span>
        <br />
        <span className="text-[var(--ink-faint)]">
          {group(items - credited)} read and not printed
        </span>
      </p>
    </div>
  );
}

function Figure({
  value,
  label,
  delay,
  lead = false,
}: {
  value: string;
  label: string;
  delay: number;
  lead?: boolean;
}) {
  return (
    <InkStamp delay={delay} className="px-2.5 text-center sm:px-3.5">
      <span
        className={`font-head block leading-[0.9] ${
          lead ? "text-[var(--accent)]" : "text-[var(--ink)]"
        }`}
        style={{ fontSize: "clamp(1.75rem, 8.5vw, 2.4rem)" }}
      >
        {value}
      </span>
      <span className="font-label mt-1.5 block text-[7.5px] font-semibold uppercase tracking-[0.17em] text-[var(--ink-faint)]">
        {label}
      </span>
    </InkStamp>
  );
}

function Arrow() {
  return (
    <span
      aria-hidden="true"
      className="font-head shrink-0 self-start pt-[0.5em] text-[16px] text-[var(--accent)]"
    >
      &rarr;
    </span>
  );
}

/**
 * The only screen that asks for anything.
 *
 * The counts are today's, so the choice is informed: a reader can see that
 * Robotics ran one column this morning before deciding to follow it. The chip
 * carries the section's full name as its value and its shortened name as its
 * label — lib/preferences.ts matches topics against `story.section` by string,
 * so "Startups" on screen must still store "AI Startups".
 */
function Desks({
  desks,
  chosen,
  onToggle,
}: {
  desks: Desk[];
  chosen: string[];
  onToggle: (section: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Desks you follow"
      className="flex flex-wrap justify-center gap-2"
    >
      {desks.map(({ section, count }) => {
        const on = chosen.includes(section);
        return (
          <button
            key={section}
            type="button"
            onClick={() => onToggle(section)}
            aria-pressed={on}
            className={`cursor-pointer rounded-full px-3.5 py-2.5 font-label text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--accent)] ${
              on
                ? "border border-transparent bg-[var(--ink)] text-[var(--paper)]"
                : "border border-[rgba(236,224,198,0.2)] text-[var(--ink-soft)] hover:border-[rgba(236,224,198,0.45)]"
            }`}
          >
            {section.replace(/^AI /, "")}{" "}
            <span className={on ? "opacity-55" : "opacity-70"}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
