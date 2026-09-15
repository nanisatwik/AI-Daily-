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
import {
  getStory,
  getAllStoryIds,
  getDigest,
  getBrief,
  formatEditionDate,
  relativeTime,
} from "@/lib/digest";
import { readingMinutes } from "@/lib/types";


export function generateStaticParams() {
  return getAllStoryIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/story/[id]">): Promise<Metadata> {
  const { id } = await params;
  const story = getStory(id);
  if (!story) return { title: "Not found — The AI Daily" };
  return { title: `${story.headline} — The AI Daily`, description: story.deck };
}

export default async function StoryPage({ params }: PageProps<"/story/[id]">) {
  const { id } = await params;
  const story = getStory(id);
  if (!story) notFound();

  const digest = getDigest();
  const others = digest.stories.filter((s) => s.id !== story.id).slice(0, 3);

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
            {formatEditionDate(digest.date)} &middot; No. {digest.edition}
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

        <AiBrief brief={getBrief(story.id)} />

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
