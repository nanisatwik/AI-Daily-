import type { Metadata } from "next";
import Link from "next/link";
import PageSheet from "@/components/PageSheet";
import YourEdition from "@/components/YourEdition";
import NightToggle from "@/components/NightToggle";
import KeyboardNav from "@/components/KeyboardNav";
import { PointingHand } from "@/components/Ornament";
import { getSearchIndex, getDigest, formatEditionDate } from "@/lib/digest";

export const metadata: Metadata = {
  title: "Your edition — The AI Daily",
  description:
    "Today's edition, re-ordered around the desks and cities you follow. Preferences stay on your device.",
};

export default function YoursPage() {
  const digest = getDigest();

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7">
      <PageSheet label="Your edition">
        <div className="flex items-center justify-between gap-4 pt-3 pb-1">
          <Link
            href="/"
            className="kicker flex items-center gap-2 text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors"
          >
            <PointingHand className="w-6 h-4 rotate-180" />
            Front page
          </Link>
          <span className="meta hidden sm:inline">
            {formatEditionDate(digest.date)} &middot; No. {digest.edition}
          </span>
          <NightToggle />
        </div>

        <YourEdition docs={getSearchIndex()} />
      </PageSheet>

      <KeyboardNav />
    </div>
  );
}
