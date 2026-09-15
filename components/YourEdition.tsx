"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePreferences } from "./Preferences";
import { personalise, hasPreferences } from "@/lib/preferences";
import type { SearchDoc } from "@/lib/search";
import { SECTIONS } from "@/lib/types";
import { HUB_CITIES } from "@/lib/hubs";
import { TallyMarks } from "./stories";
import ClipButton from "./ClipButton";
import AccountPanel from "./AccountPanel";
import { FleuronRule } from "./Ornament";

export default function YourEdition({ docs }: { docs: SearchDoc[] }) {
  const { prefs, ready, toggleTopic, toggleCity, reset } = usePreferences();

  const ordered = useMemo(
    () => (ready ? personalise(docs, prefs) : docs),
    [docs, prefs, ready]
  );

  const clippings = useMemo(
    () => docs.filter((d) => prefs.clippings.includes(d.id)),
    [docs, prefs.clippings]
  );

  const tuned = ready && hasPreferences(prefs);

  return (
    <div className="pt-7">
      <div className="mb-6 flex items-center gap-3">
        <span className="kicker bg-[var(--ink)] px-3 py-1.5 text-[var(--paper)]">
          Your edition
        </span>
        <span className="h-[3px] flex-1 border-t border-b border-[var(--ink)]" />
      </div>

      <p className="font-body italic mb-7 max-w-[56ch] text-[15px] leading-relaxed text-[var(--ink-soft)]">
        {tuned
          ? "The same edition, re-ordered around the desks and cities you follow. Nothing is hidden — a major story still rises even if it matches nothing you picked."
          : "Choose a desk or a city below and this edition re-orders itself around them. Your choices stay on this device."}
      </p>

      <div className="mb-7">
        <AccountPanel />
      </div>

      {/* --- preferences ------------------------------------------------ */}
      <div className="border border-[var(--rule)] p-4 sm:p-5">
        <p className="kicker mb-3 text-[var(--ink-soft)]">Desks</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {SECTIONS.map((s) => {
            const on = ready && prefs.topics.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleTopic(s)}
                aria-pressed={on}
                className={`kicker cursor-pointer border px-2.5 py-1 transition-colors duration-200 ${
                  on
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
                    : "border-[var(--rule)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>

        <p className="kicker mb-3 text-[var(--ink-soft)]">Cities</p>
        <div className="flex flex-wrap gap-2">
          {HUB_CITIES.map((c) => {
            const on = ready && prefs.cities.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCity(c)}
                aria-pressed={on}
                className={`kicker cursor-pointer border px-2.5 py-1 transition-colors duration-200 ${
                  on
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
                    : "border-[var(--rule)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>

        {tuned && (
          <button
            type="button"
            onClick={reset}
            className="kicker mt-5 cursor-pointer text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
          >
            Clear everything
          </button>
        )}
      </div>

      {/* --- clippings --------------------------------------------------- */}
      {clippings.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="kicker text-[var(--accent)]">Your clippings</span>
            <span className="h-px flex-1 bg-[var(--rule)]" />
            <span className="meta">{clippings.length}</span>
          </div>
          <ul>
            {clippings.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-4 border-b border-[var(--rule)] py-3 last:border-b-0"
              >
                <Link
                  href={`/story/${c.id}`}
                  data-story-link
                  className="story-link flex-1"
                >
                  <span className="meta block mb-1">{c.section}</span>
                  <h3 className="headline text-[1.05rem] leading-[1.2]">
                    {c.headline}
                  </h3>
                </Link>
                <ClipButton storyId={c.id} className="shrink-0" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- the edition, re-ordered ------------------------------------- */}
      <section className="mt-10">
        <div className="mb-4 flex items-center gap-3">
          <span className="kicker text-[var(--ink-soft)]">
            {tuned ? "Ordered for you" : "Today's edition"}
          </span>
          <span className="h-px flex-1 bg-[var(--rule)]" />
        </div>

        <ul>
          {ordered.map((d, i) => {
            const matchedTopic = ready && prefs.topics.includes(d.section);
            const matchedCity =
              ready && d.cities.some((c) => prefs.cities.includes(c));

            return (
              <li
                key={d.id}
                className="border-b border-[var(--rule)] py-4 last:border-b-0"
              >
                <div className="mb-1.5 flex items-baseline gap-3">
                  <span className="font-label text-[11px] text-[var(--ink-faint)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`kicker ${
                      matchedTopic ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
                    }`}
                  >
                    {d.section}
                  </span>
                  {matchedCity && (
                    <span className="kicker text-[var(--accent)]">
                      {d.cities.filter((c) => prefs.cities.includes(c))[0]}
                    </span>
                  )}
                </div>

                <Link
                  href={`/story/${d.id}`}
                  data-story-link
                  className="story-link"
                >
                  <h3 className="headline text-[1.2rem] leading-[1.2]">
                    {d.headline}
                  </h3>
                  <p className="font-body mt-1.5 line-clamp-2 text-[14px] leading-[1.5] text-[var(--ink-soft)]">
                    {d.deck}
                  </p>
                </Link>

                <div className="mt-2.5 flex items-center gap-3">
                  <TallyMarks count={d.sourceCount} />
                  <ClipButton storyId={d.id} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <FleuronRule className="mt-10 text-[var(--rule)]" />
      <p className="meta mt-5 text-center normal-case tracking-normal font-body italic text-[13px] leading-relaxed">
        Your desks, cities and clippings are stored on this device only. They
        are never sent anywhere, and clearing your browser clears them.
      </p>
    </div>
  );
}
