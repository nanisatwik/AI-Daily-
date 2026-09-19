import type { Metadata } from "next";
import Link from "next/link";
import PageSheet from "@/components/PageSheet";
import SearchView from "@/components/SearchView";
import NightToggle from "@/components/NightToggle";
import KeyboardNav from "@/components/KeyboardNav";
import TabBar from "@/components/TabBar";
import { PointingHand } from "@/components/Ornament";
import {
  getSearchIndex,
  getSectionIndex,
  getSourceIndex,
  getDigest,
  formatEditionDate,
} from "@/lib/digest";

export const metadata: Metadata = {
  title: "The index — The AI Daily",
  description: "Search every story in today's edition by headline, topic or publisher.",
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

        <SearchView
          docs={getSearchIndex()}
          sections={getSectionIndex().map((s) => s.section)}
          sources={getSourceIndex()}
        />
      </PageSheet>

      <KeyboardNav />
      <TabBar />
    </div>
  );
}
