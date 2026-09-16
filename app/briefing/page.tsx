import type { Metadata } from "next";
import Link from "next/link";
import PageSheet from "@/components/PageSheet";
import BriefingPlayer from "@/components/Briefing";
import NightToggle from "@/components/NightToggle";
import KeyboardNav from "@/components/KeyboardNav";
import { PointingHand } from "@/components/Ornament";
import { getDigest, formatEditionDate } from "@/lib/digest";
import { buildBriefing } from "@/lib/briefing";

export const metadata: Metadata = {
  title: "The five-minute briefing — The AI Daily",
  description:
    "Today's edition read aloud in order: the lead story, the desks, and what else came over the wire. Spoken by your own browser, so it costs nothing.",
};

export default function BriefingPage() {
  const digest = getDigest();

  /**
   * The script is built here rather than in the browser.
   *
   * It is deterministic either way, so both would agree — but building it on
   * the server means the running order is in the first HTML the reader
   * receives, so the page is readable, and the whole bulletin is legible, on a
   * device with no voices installed or with JavaScript still in flight. It is
   * also the smaller payload: the script is a few hundred words, where
   * shipping the edition for the client to plan from would be the lot.
   */
  const briefing = buildBriefing(digest.stories, digest.date);

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7">
      <PageSheet label="The wireless">
        <div className="flex items-center justify-between gap-4 pt-3 pb-1">
          <Link
            href="/"
            className="kicker flex items-center gap-2 text-[var(--ink-soft)] transition-colors hover:text-[var(--accent)]"
          >
            <PointingHand className="h-4 w-6 rotate-180" />
            Front page
          </Link>
          <span className="meta hidden sm:inline">
            {formatEditionDate(digest.date)} &middot; No. {digest.edition}
          </span>
          <NightToggle />
        </div>

        <BriefingPlayer briefing={briefing} />
      </PageSheet>

      <KeyboardNav />
    </div>
  );
}
