import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageSheet from "@/components/PageSheet";
import NightToggle from "@/components/NightToggle";
import KeyboardNav from "@/components/KeyboardNav";
import TabBar from "@/components/TabBar";
import { PointingHand, FleuronRule } from "@/components/Ornament";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { FeatureStory, ColumnItem, SectionBanner } from "@/components/stories";
import { sectionSlug } from "@/lib/search";
import {
  getSectionIndex,
  getStoriesForSection,
  getDigest,
  formatEditionDate,
} from "@/lib/digest";

function resolve(slug: string) {
  return getSectionIndex().find((s) => sectionSlug(s.section) === slug);
}

export function generateStaticParams() {
  return getSectionIndex().map((s) => ({ slug: sectionSlug(s.section) }));
}

export async function generateMetadata({
  params,
}: PageProps<"/section/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = resolve(slug);
  if (!found) return { title: "Section not found — The AI Daily" };

  // The count is in the description because a desk page is otherwise
  // indistinguishable from the other six in a list of search results, and the
  // count is the one thing that actually differs day to day.
  const description = `${found.count} ${
    found.count === 1 ? "story" : "stories"
  } filed to the ${found.section} desk in today's edition of The AI Daily, every one with its sources named.`;

  return {
    title: `${found.section} — The AI Daily`,
    description,
    // A desk is a page of the paper rather than a piece of writing, so
    // `website` and no `publishedTime` — the stories it collects carry those.
    // siteName and locale are restated because Next replaces the parent
    // openGraph block rather than merging into it; see app/layout.tsx.
    openGraph: {
      type: "website",
      siteName: "The AI Daily",
      locale: "en_GB",
      title: `${found.section} — The AI Daily`,
      description,
      url: `/section/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${found.section} — The AI Daily`,
      description,
    },
  };
}

export default async function SectionPage({
  params,
}: PageProps<"/section/[slug]">) {
  const { slug } = await params;
  const found = resolve(slug);
  if (!found) notFound();

  const digest = getDigest();
  const stories = getStoriesForSection(found.section);
  const [lead, ...rest] = stories;
  const others = getSectionIndex().filter((s) => s.section !== found.section);

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7">
      <PageSheet label={found.section}>
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

        <div className="pt-7">
          <SectionBanner>{found.section}</SectionBanner>

          <p className="font-body italic text-[15px] text-[var(--ink-soft)] mb-7">
            {stories.length} {stories.length === 1 ? "story" : "stories"} in
            this section today, clustered from {digest.totalItems} items on the
            wire.
          </p>

          {lead && (
            <Reveal>
              <FeatureStory story={lead} />
            </Reveal>
          )}

          {rest.length > 0 && (
            <div className="mt-10 pt-7 border-t-2 border-[var(--ink)]">
              <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-9">
                {rest.map((story) => (
                  <StaggerItem
                    key={story.id}
                    className="lg:not-last:border-r lg:not-last:border-[var(--rule)] lg:not-last:pr-8"
                  >
                    <ColumnItem story={story} />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          )}

          <Reveal className="mt-12">
            <FleuronRule className="text-[var(--rule)] mb-5" />
            <p className="kicker text-center text-[var(--ink-faint)] mb-5">
              Other sections
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2.5">
              {others.map((s) => (
                <Link
                  key={s.section}
                  href={`/section/${sectionSlug(s.section)}`}
                  className="kicker text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors"
                >
                  {s.section}{" "}
                  <span className="text-[var(--accent)]">{s.count}</span>
                </Link>
              ))}
              <Link
                href="/search"
                className="kicker text-[var(--accent)] hover:opacity-60 transition-opacity"
              >
                The index
              </Link>
            </div>
          </Reveal>
        </div>
      </PageSheet>

      <KeyboardNav />
      <TabBar />
    </div>
  );
}
