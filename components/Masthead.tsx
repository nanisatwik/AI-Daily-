import Link from "next/link";
import NightToggle from "./NightToggle";
import FitText from "./FitText";
import { Seal, FleuronRule } from "./Ornament";
import { InkStamp } from "./motion";
import EditionClock from "./EditionClock";
import WeatherBox from "./WeatherBox";
import OnThisDay from "./OnThisDay";

type Props = {
  dateLabel: string;
  edition: number;
  totalItems: number;
  storyCount: number;
};

/** The separator a folio line uses between its facts. */
function Pip() {
  return (
    <span className="mx-2.5 text-[var(--rule)]" aria-hidden="true">
      &bull;
    </span>
  );
}

export default function Masthead({
  dateLabel,
  edition,
  totalItems,
  storyCount,
}: Props) {
  return (
    <header className="relative pt-5">
      <div className="flex justify-end pb-4">
        <NightToggle />
      </div>

      <div className="rule-double" />

      <div className="relative py-7 sm:py-9">
        <span
          className="absolute left-0 top-8 hidden md:block text-[var(--paper)] bg-[var(--ink)] kicker px-4 py-1.5"
          style={{
            clipPath:
              "polygon(0 0, 100% 0, 92% 50%, 100% 100%, 0 100%, 8% 50%)",
          }}
        >
          The
        </span>

        <div className="absolute right-0 top-6 hidden md:block text-[var(--ink)]">
          <InkStamp delay={0.5}>
            <Seal top="Deduped" bottom="Daily" className="w-[76px] h-[76px]" />
          </InkStamp>
        </div>

        <InkStamp>
          <Link href="/" className="block text-center px-1 md:px-24 lg:px-28">
            <h1 className="font-mast leading-[1.06] text-[var(--ink)]">
              <FitText max={112}>The AI Daily</FitText>
            </h1>
          </Link>
        </InkStamp>

        <div className="mt-5 flex justify-center">
          <FleuronRule className="w-full max-w-[420px] text-[var(--rule)]" />
        </div>
      </div>

      {/*
        The rule that closes the nameplate. Two borders and a CSS transform,
        where this used to be a stretched <svg><line> drawn by animating
        pathLength — see .rule-draw in globals.css for why that arrived on the
        page as a row of stray dashes.
      */}
      <div className="rule-triple rule-draw" />

      {/*
        The folio line, set in three zones rather than spaced apart.

        It was a single flex row with justify-between, and with four facts of
        wildly different widths the date — the one fact a reader looks for —
        landed well left of centre and the gaps between the rest were all
        different sizes. A 1-auto-1 grid centres the date against the page
        instead of against its neighbours, which is how a folio line has
        always been set: volume and number out on the left rail, date and hour
        dead centre, price out on the right.

        The three zones only appear once there is room for them; below that the
        line stacks and stays centred, rather than being squeezed until the
        price itself breaks across two lines. The press run is held back
        further still, to the width at which it fits beside the price without
        either of them wrapping — and it is no loss, since the same figure is
        set out in full in the rail below.
      */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-baseline justify-items-center gap-x-5 gap-y-1 py-2.5 text-center border-b border-[var(--rule)]">
        <span className="meta md:justify-self-start">No. {edition}</span>

        <span className="meta text-[var(--ink-soft)] md:whitespace-nowrap">
          {dateLabel}
          <EditionClock />
        </span>

        <span className="meta md:justify-self-end">
          <span className="hidden xl:inline">
            {totalItems} items &rarr; {storyCount} stories
            <Pip />
          </span>
          Two cent edition
        </span>
      </div>

      {/*
        The almanac band: weather on the left, the day's milestone on the
        right, as a paper of the period ran them. Both cells hold their height
        in every state — the weather never renders an empty box while it waits
        on a reading — so nothing below the masthead moves once the page is
        painted.

        Split uneven rather than down the middle. A weather reading is a fixed
        short phrase and an almanac line is a sentence, so equal columns left
        the left cell half empty while the right one ran to three lines.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] border-b border-[var(--ink)]">
        <div className="py-3 sm:pr-7 sm:border-r sm:border-[var(--rule)]">
          <WeatherBox />
        </div>
        <div className="py-3 sm:pl-7 border-t border-[var(--rule)] sm:border-t-0">
          <OnThisDay />
        </div>
      </div>
    </header>
  );
}
