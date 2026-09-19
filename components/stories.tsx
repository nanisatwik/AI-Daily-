import Link from "next/link";
import { relativeTime, type Story } from "@/lib/digest";
import { PressIn } from "./motion";

export function TallyMarks({ count }: { count: number }) {
  const groups = Math.floor(count / 5);
  const remainder = count % 5;
  const groupWidth = 24;
  const width = groups * groupWidth + (remainder > 0 ? remainder * 5 + 3 : 0);

  return (
    <svg
      viewBox={`0 0 ${Math.max(width, 8)} 20`}
      width={Math.max(width, 8)}
      height="14"
      className="shrink-0 text-[var(--accent)]"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {Array.from({ length: groups }).map((_, g) => (
        <g key={g} transform={`translate(${g * groupWidth} 0)`}>
          {[2, 7, 12, 17].map((x) => (
            <line key={x} x1={x} y1="3" x2={x} y2="17" />
          ))}
          <line x1="0" y1="16" x2="19" y2="4" />
        </g>
      ))}
      {Array.from({ length: remainder }).map((_, i) => (
        <line
          key={`r${i}`}
          x1={groups * groupWidth + 2 + i * 5}
          y1="3"
          x2={groups * groupWidth + 2 + i * 5}
          y2="17"
        />
      ))}
    </svg>
  );
}

function Byline({ story }: { story: Story }) {
  const n = story.sources.length;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <TallyMarks count={n} />
      <span className="meta">
        {n === 1 ? "1 source" : `${n} sources`} &middot;{" "}
        {relativeTime(story.publishedAt)}
      </span>
    </div>
  );
}

/**
 * The two-column justified body, shared by the lead and the feature.
 *
 * The dateline opens the first paragraph so the existing `.drop-cap` initial
 * falls on the placename — a drop initial running into small-caps is the
 * classic way a paper sets "SEATTLE —", and it means the two stories that carry
 * body copy stay set the same way rather than drifting apart. Stories the wire
 * never placed simply open on their first word, as before.
 */
function StoryBody({ story, className }: { story: Story; className: string }) {
  return (
    <div
      className={`prose-column drop-cap sm:columns-2 sm:gap-7 [&>p]:break-inside-avoid ${className}`}
    >
      {story.body.map((para, i) => (
        <p key={i}>
          {i === 0 && story.dateline ? (
            <>
              <span className="dateline">{story.dateline} &mdash; </span>
              {para}
            </>
          ) : (
            para
          )}
        </p>
      ))}
    </div>
  );
}

export function SectionBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span className="kicker bg-[var(--ink)] text-[var(--paper)] px-3 py-1.5">
        {children}
      </span>
      <span className="flex-1 h-[3px] border-t border-b border-[var(--ink)]" />
    </div>
  );
}

/**
 * Wire headlines run far longer than a sub-editor's would, and a fixed size
 * turns them into six lines of banner type. Step the scale down as they grow,
 * the way a compositor fits a headline to its column.
 */
function leadSize(headline: string): string {
  const n = headline.length;
  if (n <= 38) return "clamp(2rem, 5vw, 3.6rem)";
  if (n <= 62) return "clamp(1.75rem, 4vw, 2.9rem)";
  if (n <= 88) return "clamp(1.5rem, 3.2vw, 2.3rem)";
  return "clamp(1.35rem, 2.6vw, 1.95rem)";
}

export function LeadStory({ story }: { story: Story }) {
  return (
    <article>
      <div className="flex items-center gap-3 mb-4">
        <span className="kicker text-[var(--accent)]">{story.section}</span>
        <span className="flex-1 h-px bg-[var(--rule)]" />
      </div>

      <Link href={`/story/${story.id}`} data-story-link className="story-link">
        <h2 className="headline-caps" style={{ fontSize: leadSize(story.headline) }}>
          {story.headline}
        </h2>
      </Link>

      <div className="my-5 h-[4px] border-t border-b border-[var(--ink)]" />

      <p
        className="font-body italic text-[var(--ink-soft)] text-center max-w-[48ch] mx-auto leading-[1.45]"
        style={{ fontSize: "clamp(1.05rem, 2.1vw, 1.3rem)" }}
      >
        {story.deck}
      </p>

      <div className="mt-5 pt-3 border-t border-[var(--rule)] flex justify-center">
        <Byline story={story} />
      </div>

      <StoryBody story={story} className="mt-6" />

      <div className="mt-6 text-center">
        <PressIn className="inline-block">
          <Link
            href={`/story/${story.id}`}
            className="kicker inline-block border-2 border-[var(--ink)] px-6 py-2.5 hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors duration-300"
          >
            Read the full column
          </Link>
        </PressIn>
      </div>
    </article>
  );
}

export function RailItem({ story }: { story: Story }) {
  return (
    <article className="py-4 border-b border-[var(--rule)] last:border-b-0">
      <Link href={`/story/${story.id}`} data-story-link className="story-link">
        <h3 className="headline text-[1.2rem] leading-[1.18]">
          {story.headline}
        </h3>
      </Link>
      <p className="font-body mt-2 text-[14px] leading-[1.5] text-[var(--ink-soft)]">
        {story.deck}
      </p>
      <div className="mt-2.5 flex items-center gap-2.5">
        <TallyMarks count={story.sources.length} />
        <span className="meta">{story.section}</span>
      </div>
    </article>
  );
}

export function JumpLine({ page, label }: { page: number; label: string }) {
  return (
    <p className="font-body italic text-[15px] text-[var(--accent)] mt-4 text-right">
      Continued on page {page} &mdash; {label}
    </p>
  );
}

export function FeatureStory({ story }: { story: Story }) {
  return (
    <article>
      <div className="flex items-center gap-3 mb-3.5">
        <span className="kicker text-[var(--accent)]">{story.section}</span>
        <span className="flex-1 h-px bg-[var(--rule)]" />
      </div>

      <Link href={`/story/${story.id}`} data-story-link className="story-link">
        <h2
          className="headline-caps"
          style={{ fontSize: "clamp(1.6rem, 3.4vw, 2.5rem)" }}
        >
          {story.headline}
        </h2>
      </Link>

      <div className="my-4 h-[4px] border-t border-b border-[var(--ink)]" />

      <p className="font-body italic text-[var(--ink-soft)] text-[1.05rem] leading-[1.45]">
        {story.deck}
      </p>

      <div className="mt-4 pt-3 border-t border-[var(--rule)]">
        <Byline story={story} />
      </div>

      <StoryBody story={story} className="mt-5" />
    </article>
  );
}

export function ColumnItem({ story }: { story: Story }) {
  return (
    <article className="h-full">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="kicker text-[var(--ink-faint)]">{story.section}</span>
        <span className="flex-1 h-px bg-[var(--rule)]" />
      </div>

      <Link href={`/story/${story.id}`} data-story-link className="story-link">
        <h3 className="headline text-[1.35rem] leading-[1.16]">
          {story.headline}
        </h3>
      </Link>

      <p className="prose-column mt-3 text-[15px] text-[var(--ink-soft)]">
        {story.deck}
      </p>

      <div className="mt-3.5 pt-2.5 border-t border-[var(--rule)]">
        <Byline story={story} />
      </div>
    </article>
  );
}
