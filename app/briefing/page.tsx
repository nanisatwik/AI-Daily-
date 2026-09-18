import type { Metadata } from "next";
import Link from "next/link";
import PageSheet from "@/components/PageSheet";
import BriefingPlayer from "@/components/Briefing";
import NightToggle from "@/components/NightToggle";
import KeyboardNav from "@/components/KeyboardNav";
import { PointingHand } from "@/components/Ornament";
import RecordedBriefing from "@/components/Recording";
import { readRecording, recordingFits } from "@/lib/recording";
import { getDigest, formatEditionDate } from "@/lib/digest";
import { buildBriefing, scriptFingerprint } from "@/lib/briefing";

const TITLE = "The five-minute briefing — The AI Daily";
const DESCRIPTION =
  "Today's edition read aloud in order: the lead story, the desks, and what else came over the wire. Spoken by your own browser, so it costs nothing.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // `website`, not `article`: the wireless is a standing page of the paper
  // that gets re-cut each morning, and it has no single author or hour to
  // declare. siteName and locale are restated because Next replaces the
  // parent openGraph block rather than merging into it; see app/layout.tsx.
  openGraph: {
    type: "website",
    siteName: "The AI Daily",
    locale: "en_GB",
    title: TITLE,
    description: DESCRIPTION,
    url: "/briefing",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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

  /**
   * Today's recording, if the press made one.
   *
   * Read at build time rather than fetched, so the page knows before it renders
   * whether there is audio and can choose a player instead of mounting one and
   * discovering a 404. The date is checked: an old recording left in `public`
   * against a newer edition would read yesterday's news in a confident voice,
   * which is worse than falling back to the browser's own.
   */
  const recording = readRecording(digest.date);
  /** The script this page just built, to match against what was recorded. */
  const fingerprint = scriptFingerprint(briefing.lines);

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

        {/*
          The recorded voice, but only if it is a recording of this script.
          The player maps marks onto lines by index, so a recording of a
          different script does not sound worse — it highlights and seeks to
          the wrong sentence while sounding exactly as confident. That went
          live once. `recordingFits` is the check; the browser's own voice is
          the answer when it says no.
        */}
        {recording && recordingFits(recording, briefing.lines, fingerprint) ? (
          <RecordedBriefing briefing={briefing} manifest={recording} />
        ) : (
          <BriefingPlayer briefing={briefing} />
        )}
      </PageSheet>

      <KeyboardNav />
    </div>
  );
}
