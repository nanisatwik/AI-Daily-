import type { Metadata } from "next";
import Link from "next/link";
import PageSheet from "@/components/PageSheet";
import SearchView from "@/components/SearchView";
import NightToggle from "@/components/NightToggle";
import KeyboardNav from "@/components/KeyboardNav";
import TabBar from "@/components/TabBar";
import { PointingHand } from "@/components/Ornament";
import { getArchiveSearchIndex, getArchiveEditions } from "@/lib/archive";
import {
  getSectionIndex,
  getSourceIndex,
  getDigest,
  formatEditionDate,
} from "@/lib/digest";

export const metadata: Metadata = {
  title: "The index — The AI Daily",
  description:
    "Search every story the paper has printed, by headline, topic or publisher.",
};

export default function SearchPage() {
  const digest = getDigest();

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7">
      <PageSheet label="The index">
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

        {/*
          The whole archive, not today's paper.
          237 columns have been printed and every one keeps its address, but
          this page was built from getDigest() — so 183 of them were reachable
          and unfindable, which is not an index. lib/archive.ts bounds it to
          SEARCH_EDITIONS because these documents are shipped to the browser
          and searched there; see the note on that constant for the arithmetic.
        */}
        <SearchView
          docs={getArchiveSearchIndex()}
          todayDate={digest.date}
          sections={getSectionIndex().map((s) => s.section)}
          sources={getSourceIndex()}
        />
      </PageSheet>

      <KeyboardNav />
      <TabBar />
    </div>
  );
}
