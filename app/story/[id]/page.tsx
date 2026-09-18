import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import KeyboardNav from "@/components/KeyboardNav";
import ReadingProgress from "@/components/ReadingProgress";
import NightToggle from "@/components/NightToggle";
import { OrnateFrame, FleuronRule, PointingHand } from "@/components/Ornament";
import { PageIn, Reveal, PressIn } from "@/components/motion";
import { TallyMarks } from "@/components/stories";
import AiBrief from "@/components/AiBrief";
import ClipButton from "@/components/ClipButton";
import { getDigest, formatEditionDate, relativeTime } from "@/lib/digest";
import {
  getArchivedStory,
  getArchivedBrief,
  getStoriesAlongside,
  getPrerenderedStoryIds,
} from "@/lib/archive";
import { readingMinutes } from "@/lib/types";


/**
 * A recent window, not the whole archive.
 *
 * The ids come from lib/archive.ts rather than from today's edition, which is
 * the fix: reading `getAllStoryIds()` meant the build prerendered fifty-four
 * pages and the route answered for nothing else, so 131 of the 185 stories this
 * paper has printed were 404 and every shared link died within a day.
 *
 * `dynamicParams` is deliberately not exported here. Its default is `true`,
 * which is what makes an id outside the window render on first request and be
 * cached from then on — see PRERENDER_EDITIONS in lib/archive.ts for why the
 * window exists at all and what it costs. Setting it to `false` would rebuild
 * the defect: only the window would resolve.
 *
 * A genuinely unknown id still 404s, because the page below calls `notFound()`
 * when the archive has never heard of it.
 */
export function generateStaticParams() {
  return getPrerenderedStoryIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/story/[id]">): Promise<Metadata> {
  const { id } = await params;
  const story = getArchivedStory(id)?.story;
  if (!story) return { title: "Not found — The AI Daily" };
  return {
    title: `${story.headline} — The AI Daily`,
    description: story.deck,
    /**
     * The card a shared story link unfurls into.
     *
     * `og:title` is the bare headline, not the `<title>` above it. A card
     * prints `og:site_name` on its own line, so carrying "— The AI Daily" into
     * the title as well spends one of the two lines a preview gets on saying
     * the same thing twice.
     *
     * `siteName` and `locale` are restated rather than inherited because Next
     * replaces the parent `openGraph` block wholesale when a segment declares
     * its own — see the note in app/layout.tsx. `images` is left to the
     * `opengraph-image` convention.
     *
     * `publishedTime` is the story's own hour, which for a clustered event is
     * when the wire last carried it. That is the same figure the column prints
     * beside the tally marks, so a card that disagreed with the page would be
     * the odd one out.
     */
    openGraph: {
      type: "article",
      siteName: "The AI Daily",
      locale: "en_GB",
      title: story.headline,
      description: story.deck,
      publishedTime: story.publishedAt,
      // Canonical, so a link that arrives carrying somebody's tracking
      // parameters still shares as one story rather than as a new page.
      url: `/story/${story.id}`,
    },
    twitter: {
      card: "summary_large_image",
      title: story.headline,
      description: story.deck,
    },
  };
}

export default async function StoryPage({ params }: PageProps<"/story/[id]">) {
  const { id } = await params;
  const printed = getArchivedStory(id);
  if (!printed) notFound();

  const { story } = printed;
  const others = getStoriesAlongside(story.id, 3);

  /**
   * Whether this column is in the paper on the press, or out of the archive.
   *
   * The masthead below carries the printing edition either way, which for one
   * of today's fifty-four is today's date and No. 155 — the same two values it
   * printed before the archive existed. But a masthead alone does not tell a
   * reader who arrived from a six-day-old link that they are not reading
   * today's news; it just quietly shows a date they have no reason to check
   * against. So an archived story says so, once, in the dateline, in the type
   * the dateline is already set in.
   */
  const archived = printed.date !== getDigest().date;

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7">
      <ReadingProgress />

      <div className="relative mx-auto max-w-[920px] border-2 border-[var(--ink)] bg-[var(--paper)] px-4 sm:px-10 pb-10">
        <OrnateFrame className="z-10" />

        <div className="flex items-center justify-between pt-5 pb-4">
          <Link
            href="/"
            className="kicker flex items-center gap-2 text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors"
          >
            <PointingHand className="w-6 h-4 rotate-180" />
            Front page
          </Link>
          <NightToggle />
        </div>

        <div className="rule-double" />

        <div className="py-3 text-center border-b border-[var(--ink)]">
          <Link href="/" className="font-mast text-[1.35rem] leading-none">
            The AI Daily
          </Link>
          <p className="meta mt-1.5">
            {formatEditionDate(printed.date)} &middot; No. {printed.edition}
          </p>
        </div>

        <PageIn>
          <article className="pt-9">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex-1 h-px bg-[var(--rule)]" />
              <span className="kicker text-[var(--accent)]">
                {story.section}
              </span>
              <span className="flex-1 h-px bg-[var(--rule)]" />
            </div>

            <h1
              className="headline-caps text-center"
              style={{ fontSize: "clamp(1.9rem, 5.6vw, 3.4rem)" }}
            >
              {story.headline}
            </h1>

            <div className="my-6 h-[4px] border-t border-b border-[var(--ink)]" />

            <p
              className="font-body italic text-center text-[var(--ink-soft)] max-w-[46ch] mx-auto leading-[1.45]"
              style={{ fontSize: "clamp(1.05rem, 2.3vw, 1.35rem)" }}
            >
              {story.deck}
            </p>

            <div className="mt-6 pt-3.5 border-t border-[var(--rule)] flex items-center justify-center gap-4 flex-wrap">
              <TallyMarks count={story.sources.length} />
              <span className="meta">
                {story.sources.length} sources &middot;{" "}
                {relativeTime(story.publishedAt)} &middot;{" "}
                {readingMinutes(story.body.join(" "))} min read
                {archived && (
                  <>
                    {" "}
                    &middot; From the edition of{" "}
                    {formatEditionDate(printed.date)}
                  </>
                )}
              </span>
            </div>

            <div className="prose-column drop-cap mt-9 max-w-[64ch] mx-auto text-[17px]">
              {story.body.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </article>
        </PageIn>

        <div className="mt-8 flex justify-center">
          <ClipButton storyId={story.id} />
        </div>

        {/* The panel the editor wrote on the night this story ran, not tonight's. */}
        <AiBrief brief={getArchivedBrief(story.id)} />

        <Reveal className="mt-12">
          <div className="border-2 border-[var(--ink)] p-5 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <span className="kicker bg-[var(--ink)] text-[var(--paper)] px-3 py-1.5">
                Carried by
              </span>
              <span className="flex-1 h-px bg-[var(--rule)]" />
              <TallyMarks count={story.sources.length} />
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {story.sources.map((source) => (
                <li
                  key={source.url + source.name}
                  className="border-b border-[var(--rule)] last:border-b-0 sm:nth-last-[2]:border-b-0"
                >
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-baseline justify-between gap-3 py-3 group"
                  >
                    <span className="font-head text-[16px] group-hover:text-[var(--accent)] transition-colors">
                      {source.name}
                    </span>
                    <span className="meta shrink-0">
                      {relativeTime(source.publishedAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal className="mt-11">
          <FleuronRule className="text-[var(--rule)] mb-6" />
          <p className="kicker text-center text-[var(--ink-faint)] mb-6">
            Elsewhere in this edition
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {others.map((other) => (
              <Link
                key={other.id}
                href={`/story/${other.id}`}
                data-story-link
                className="story-link"
              >
                <span className="meta block mb-2">{other.section}</span>
                <h3 className="headline text-[1.1rem] leading-[1.2]">
                  {other.headline}
                </h3>
              </Link>
            ))}
          </div>
        </Reveal>

        <div className="mt-11 text-center">
          <PressIn className="inline-block">
            <Link
              href="/"
              className="kicker inline-block border-2 border-[var(--ink)] px-6 py-2.5 hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors duration-300"
            >
              Back to the front page
            </Link>
          </PressIn>
        </div>

        <KeyboardNav />
      </div>
    </div>
  );
}
