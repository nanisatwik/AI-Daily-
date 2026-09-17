import Link from "next/link";
import type { Story } from "@/lib/digest";
import { sectionSlug } from "@/lib/search";
import { relativeTime } from "@/lib/digest";

/**
 * The blueprint asks for a breaking strip: a small red signal and a row of live
 * headlines, with red used sparingly as a status colour. A 1925 paper called
 * the same thing STOP PRESS — the late slot held open for news that broke after
 * the plates were set. Same job, and it belongs in this masthead.
 */
export function StopPress({ stories }: { stories: Story[] }) {
  if (stories.length === 0) return null;

  return (
    <div className="flex items-stretch border-b border-[var(--ink)]">
      <span className="flex items-center gap-2 shrink-0 pr-3.5 py-2 border-r border-[var(--ink)]">
        <span
          className="w-[7px] h-[7px] rounded-full bg-[var(--accent)]"
          aria-hidden="true"
        />
        <span className="kicker text-[var(--accent)]">Stop press</span>
      </span>

      <ul className="flex items-center gap-0 overflow-x-auto py-2 pl-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stories.map((story, i) => (
          <li key={story.id} className="flex items-center shrink-0">
            {i > 0 && (
              <span className="text-[var(--rule)] px-3.5" aria-hidden="true">
                &bull;
              </span>
            )}
            <Link
              href={`/story/${story.id}`}
              className="font-body text-[13px] leading-none text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors whitespace-nowrap"
            >
              {story.headline}
              <span className="meta ml-2">{relativeTime(story.publishedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The editorial index the blueprint calls SectionNav. Set as a ruled band of
 * small caps rather than a row of buttons — a newspaper lists its sections, it
 * does not offer them as controls.
 */
export function SectionNav({
  sections,
  active,
}: {
  sections: { section: string; count: number }[];
  active?: string;
}) {
  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 py-2.5 border-b border-[var(--ink)]"
      aria-label="Sections"
    >
      {sections.map((s) => (
        <Link
          key={s.section}
          href={`/section/${sectionSlug(s.section)}`}
          aria-current={active === s.section ? "page" : undefined}
          className={`kicker transition-colors ${
            active === s.section
              ? "text-[var(--accent)]"
              : "text-[var(--ink-soft)] hover:text-[var(--accent)]"
          }`}
        >
          {s.section}
        </Link>
      ))}
      {/*
        The briefing had no link from anywhere in the paper for a day after it
        went live, so the only spoken edition a reader could find was the
        floating reader — which drove the operating system's synthesiser. The
        good voice existed and was unreachable.
      */}
      <Link
        href="/briefing"
        className="kicker text-[var(--accent)] hover:opacity-60 transition-opacity"
      >
        The wireless
      </Link>
      <Link
        href="/yours"
        className="kicker text-[var(--accent)] hover:opacity-60 transition-opacity"
      >
        Your edition
      </Link>
      <Link
        href="/search"
        className="kicker text-[var(--ink-faint)] hover:text-[var(--accent)] transition-colors"
      >
        Index ↗
      </Link>
    </nav>
  );
}
