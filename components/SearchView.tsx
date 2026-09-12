"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { search, sectionSlug, type SearchDoc } from "@/lib/search";
import { TallyMarks } from "./stories";

export default function SearchView({
  docs,
  sections,
  sources,
  initialSection,
}: {
  docs: SearchDoc[];
  sections: string[];
  sources: string[];
  initialSection?: string;
}) {
  const [query, setQuery] = useState("");
  const [section, setSection] = useState(initialSection ?? "");
  const [source, setSource] = useState("");

  const hits = useMemo(
    () => search(docs, query, { section: section || undefined, source: source || undefined }),
    [docs, query, section, source]
  );

  const clear = () => {
    setQuery("");
    setSection("");
    setSource("");
  };

  const filtering = Boolean(query || section || source);

  return (
    <div className="pt-7">
      <div className="flex items-center gap-3 mb-6">
        <span className="kicker bg-[var(--ink)] text-[var(--paper)] px-3 py-1.5">
          The index
        </span>
        <span className="flex-1 h-[3px] border-t border-b border-[var(--ink)]" />
      </div>

      <label htmlFor="q" className="sr-only">
        Search this edition
      </label>
      <input
        id="q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search headlines, topics, publishers…"
        autoComplete="off"
        className="w-full bg-transparent border-0 border-b-2 border-[var(--ink)] pb-3 font-head text-[clamp(1.3rem,3.4vw,2.1rem)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="meta mr-1">Section</span>
        {sections.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSection(section === s ? "" : s)}
            aria-pressed={section === s}
            className={`kicker border px-2.5 py-1 transition-colors duration-200 cursor-pointer ${
              section === s
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
                : "border-[var(--rule)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="meta mr-1">Publisher</span>
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(source === s ? "" : s)}
            aria-pressed={source === s}
            className={`kicker border px-2.5 py-1 transition-colors duration-200 cursor-pointer ${
              source === s
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
                : "border-[var(--rule)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-7 pt-3 border-t-2 border-[var(--ink)] flex items-center justify-between gap-4">
        <span className="meta">
          {hits.length === 0
            ? "Nothing found"
            : `${hits.length} ${hits.length === 1 ? "story" : "stories"}`}
          {filtering ? " matching" : " in this edition"}
        </span>
        {filtering && (
          <button
            type="button"
            onClick={clear}
            className="kicker text-[var(--accent)] hover:opacity-60 transition-opacity cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {hits.length === 0 ? (
        <p className="font-body italic text-[15px] text-[var(--ink-soft)] mt-6 leading-relaxed max-w-[52ch]">
          No story in today&rsquo;s edition matches that. The paper carries only
          what came over the wire in the last three days — try a broader term,
          or clear the filters.
        </p>
      ) : (
        <ul className="mt-1">
          {hits.map((hit) => (
            <li key={hit.id} className="border-b border-[var(--rule)] last:border-b-0">
              <Link
                href={`/story/${hit.id}`}
                data-story-link
                className="story-link py-4 block"
              >
                <div className="flex items-baseline justify-between gap-4 mb-1.5">
                  <span className="kicker text-[var(--accent)]">{hit.section}</span>
                  <span className="meta shrink-0">
                    {hit.sources.slice(0, 2).join(", ")}
                    {hit.sources.length > 2 ? ` +${hit.sources.length - 2}` : ""}
                  </span>
                </div>
                <h2 className="headline text-[1.25rem] leading-[1.2]">
                  {hit.headline}
                </h2>
                <p className="font-body text-[14px] leading-[1.5] text-[var(--ink-soft)] mt-1.5 line-clamp-2">
                  {hit.deck}
                </p>
                <div className="mt-2">
                  <TallyMarks count={hit.sourceCount} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 pt-5 border-t border-[var(--rule)] flex flex-wrap gap-x-6 gap-y-2">
        <span className="meta">Sections</span>
        {sections.map((s) => (
          <Link
            key={s}
            href={`/section/${sectionSlug(s)}`}
            className="kicker text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors"
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
