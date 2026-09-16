"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatClock, type Briefing } from "@/lib/briefing";
import { TallyMarks } from "./stories";

/**
 * The briefing as a recording.
 *
 * This exists instead of driving `speechSynthesis` because that API does not
 * synthesise — it plays whatever voices the operating system installed, and on
 * a stock Windows machine those are formant synthesisers from around 2005. No
 * amount of choosing between them produces a voice anyone wants to listen to.
 *
 * Synthesising a good voice on the reader's device was tried and measured
 * instead: Kokoro-82M through ONNX Runtime Web ran at a real-time factor of
 * 1.01 to 1.10 on a sixteen-core machine with WebGPU. More than a second of
 * computation per second of speech means playback can never get ahead of
 * synthesis, and on a phone it would fall behind and stay behind.
 *
 * So the bulletin is recorded once a day by the job that prints the edition —
 * see services/ai/voice.ts — and this plays the file. Every device gets the
 * same good voice whatever it has installed, playback starts at once, and the
 * cost is one download rather than five minutes of somebody's battery.
 *
 * `speechSynthesis` is not deleted. components/Briefing.tsx still holds that
 * player, and the page falls back to it on any edition published before a
 * recording was made for it.
 */

export type VoiceCut = {
  file: string;
  seconds: number;
  /** Where each spoken line begins, in seconds. Exact, taken at assembly. */
  marks: { at: number; item: number }[];
};

export type RecordingManifest = {
  date: string;
  edition: number;
  voices: Record<string, VoiceCut>;
};

const LABELS: Record<string, string> = {
  lady: "Lady",
  gentleman: "Gentleman",
};

export default function RecordedBriefing({
  briefing,
  manifest,
}: {
  briefing: Briefing;
  manifest: RecordingManifest;
}) {
  const timbres = useMemo(
    () => Object.keys(manifest.voices).filter((t) => manifest.voices[t]),
    [manifest]
  );
  const [timbre, setTimbre] = useState(timbres[0] ?? "lady");
  const cut = manifest.voices[timbre] ?? manifest.voices[timbres[0]];

  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [rate, setRate] = useState(1);
  /**
   * False until the element exists. The transport renders disabled on the
   * server, because the first client render has to match the HTML the server
   * sent or React discards it and the running order blinks out and back.
   */
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  /** Which line the recording is currently inside. */
  const line = useMemo(() => {
    const marks = cut?.marks ?? [];
    // Walked from the end: the last mark at or before the playhead is the line
    // being spoken, and a linear scan over a few dozen marks on each timeupdate
    // is cheaper than keeping an index in sync through seeks.
    for (let i = marks.length - 1; i >= 0; i--) if (at >= marks[i].at) return i;
    return 0;
  }, [at, cut]);

  const item = briefing.lines[line]?.item ?? 0;

  /* ---------------- transport ---------------- */

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      // A rejected play() is the browser's autoplay policy, not a broken file.
      // Leaving `playing` true would show a pause button that does nothing.
      el.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      );
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const seekLine = useCallback(
    (to: number) => {
      const el = audio.current;
      const marks = cut?.marks ?? [];
      if (!el || marks.length === 0) return;
      const clamped = Math.max(0, Math.min(to, marks.length - 1));
      el.currentTime = marks[clamped].at;
      setAt(marks[clamped].at);
    },
    [cut]
  );

  const seekItem = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(item + delta, briefing.items.length - 1));
      seekLine(briefing.items[next].from);
    },
    [briefing.items, item, seekLine]
  );

  /**
   * Switching announcer keeps your place in the *script*, not in the file.
   *
   * The two recordings are different lengths — the same words, read at
   * different speeds — so carrying the raw playhead across would land
   * somewhere else in the bulletin. Carrying the line index lands on the same
   * sentence in the other voice.
   */
  const changeTimbre = useCallback(
    (next: string) => {
      const from = line;
      const wasPlaying = playing;
      setTimbre(next);
      const marks = manifest.voices[next]?.marks ?? [];
      const to = marks[Math.min(from, marks.length - 1)]?.at ?? 0;
      // After the source swap, so the element has the new file loaded.
      requestAnimationFrame(() => {
        const el = audio.current;
        if (!el) return;
        el.currentTime = to;
        setAt(to);
        if (wasPlaying) el.play().catch(() => setPlaying(false));
      });
    },
    [line, manifest.voices, playing]
  );

  useEffect(() => {
    const el = audio.current;
    if (el) el.playbackRate = rate;
  }, [rate, timbre]);

  if (!cut) return null;

  const total = cut.seconds;

  return (
    <div className="border-2 border-[var(--ink)] p-4 sm:p-5">
      <audio
        ref={audio}
        src={cut.file}
        preload="metadata"
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      <div className="flex items-center gap-2 border-b border-[var(--ink)] pb-2.5">
        <span className="kicker">Wireless bulletin</span>
        <span className="h-px flex-1 bg-[var(--rule)]" />
        <span className="meta">{formatClock(total)}</span>
      </div>

      {/* ---- what is being said ---- */}
      <p className="meta mt-4">
        {!ready
          ? "Preparing the set"
          : playing
            ? `On air — ${formatClock(at)} of ${formatClock(total)}`
            : at > 0
              ? `Held — ${formatClock(at)}`
              : "Ready"}
      </p>

      <p
        className={`font-body mt-2 min-h-[3.2em] text-[1.05rem] leading-[1.45] ${
          playing ? "text-[var(--ink)]" : "text-[var(--ink-faint)] italic"
        }`}
      >
        {briefing.lines[line]?.text ?? ""}
      </p>

      {/* ---- transport ---- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!ready}
          className="kicker cursor-pointer border-2 border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-[var(--paper)] transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-40"
        >
          {playing ? "Hold" : at > 0 ? "Resume" : "On air"}
        </button>

        <button
          type="button"
          onClick={() => seekItem(-1)}
          disabled={!ready}
          aria-label="Previous item"
          className="kicker cursor-pointer border border-[var(--rule)] px-2.5 py-1.5 transition-colors hover:border-[var(--ink)] disabled:cursor-default disabled:opacity-40"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={() => seekItem(1)}
          disabled={!ready}
          aria-label="Next item"
          className="kicker cursor-pointer border border-[var(--rule)] px-2.5 py-1.5 transition-colors hover:border-[var(--ink)] disabled:cursor-default disabled:opacity-40"
        >
          Next &rarr;
        </button>

        <span className="flex-1" />

        {timbres.length > 1 && (
          <>
            <span className="meta shrink-0">Announcer</span>
            {timbres.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeTimbre(t)}
                aria-pressed={timbre === t}
                aria-label={`Read by the ${t} announcer`}
                className={`kicker cursor-pointer px-1.5 py-0.5 transition-colors ${
                  timbre === t
                    ? "text-[var(--accent)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {LABELS[t] ?? t}
              </button>
            ))}
            <span className="meta shrink-0 text-[var(--ink-faint)]">&middot;</span>
          </>
        )}

        <span className="meta shrink-0">Speed</span>
        {[0.85, 1, 1.25, 1.5].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRate(r)}
            aria-pressed={rate === r}
            aria-label={`Play at ${r} times speed`}
            className={`kicker cursor-pointer px-1.5 py-0.5 transition-colors ${
              rate === r
                ? "text-[var(--accent)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            }`}
          >
            {r}&times;
          </button>
        ))}
      </div>

      <p className="font-body mt-4 border-t border-[var(--rule)] pt-3 text-[13px] leading-relaxed italic text-[var(--ink-faint)]">
        Recorded once this morning when the edition went to press, so it sounds
        the same on every device and starts at once. Nothing is generated —
        every word spoken was written by a publisher or is the studio announcing
        them.
      </p>

      {/* ---- the running order ---- */}
      <div className="mt-6 border-t border-[var(--rule)] pt-4">
        <p className="kicker mb-3 text-[var(--ink-soft)]">Running order</p>
        <ol>
          {briefing.items.map((entry, i) => {
            const live = i === item;
            return (
              <li
                key={i}
                className={`border-b border-[var(--rule)] py-2.5 last:border-b-0 ${
                  live ? "bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]" : ""
                }`}
              >
                <div className="flex items-baseline gap-3">
                  <button
                    type="button"
                    onClick={() => seekLine(entry.from)}
                    className="kicker cursor-pointer text-left text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
                    aria-label={`Play from ${entry.title}`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`font-body text-[15px] leading-snug ${
                        live ? "text-[var(--accent)]" : "text-[var(--ink)]"
                      }`}
                    >
                      {entry.storyId ? (
                        <Link
                          href={`/story/${entry.storyId}`}
                          data-story-link
                          className="story-link"
                        >
                          {entry.title}
                        </Link>
                      ) : (
                        entry.title
                      )}
                    </p>
                    {entry.sources > 1 && (
                      <span className="mt-1 inline-block">
                        <TallyMarks count={entry.sources} />
                      </span>
                    )}
                  </div>

                  <span className="meta shrink-0">
                    {formatClock(entry.seconds)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
