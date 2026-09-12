import Link from "next/link";
import NightToggle from "./NightToggle";
import FitText from "./FitText";
import { Seal, FleuronRule } from "./Ornament";
import { InkStamp, DrawRule } from "./motion";

type Props = {
  dateLabel: string;
  edition: number;
  totalItems: number;
  storyCount: number;
};

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

      <DrawRule className="w-full h-[3px] text-[var(--ink)]" delay={0.35} />

      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2.5 border-b border-[var(--ink)]">
        <span className="meta text-[var(--ink-soft)]">No. {edition}</span>
        <span className="meta text-[var(--ink-soft)]">{dateLabel}</span>
        <span className="meta text-[var(--ink-soft)] hidden sm:inline">
          {totalItems} items &rarr; {storyCount} stories
        </span>
        <span className="meta text-[var(--ink-soft)]">Two cent edition</span>
      </div>
    </header>
  );
}
