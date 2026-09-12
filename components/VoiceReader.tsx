"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PointingHand } from "./Ornament";

/**
 * The newspaper read aloud — blueprint section 6.
 *
 * Uses the browser's own SpeechSynthesis, which costs nothing and needs no
 * server, no key and no quota. That is the whole reason this can exist in a
 * £0 build: the voice is already on the reader's machine.
 *
 * What it does not do is answer questions. Two-way conversation needs
 * generation, and there is no free generation in this build yet — so the
 * controls here are honest about being a reader, not an agent.
 */

export type Passage = { headline: string; deck: string; section: string };

type Mode = "edition" | "brief";
const BRIEF_LENGTH = 5;

/**
 * Chrome silently stops mid-utterance after roughly fifteen seconds. Feeding it
 * a sentence at a time keeps every utterance short enough to survive, and has
 * the side effect of making skip land on a sensible boundary.
 */
function toLines(passages: Passage[], mode: Mode): string[] {
  const chosen = mode === "brief" ? passages.slice(0, BRIEF_LENGTH) : passages;
  const lines: string[] = [
    mode === "brief"
      ? `The AI Daily. Here are the ${Math.min(BRIEF_LENGTH, chosen.length)} stories that mattered most today.`
      : `The AI Daily. ${chosen.length} stories in today's edition.`,
  ];

  for (const p of chosen) {
    lines.push(`${p.section}. ${p.headline}.`);
    for (const sentence of p.deck.split(/(?<=[.!?])\s+/)) {
      const s = sentence.trim();
      if (s.length > 3) lines.push(s);
    }
  }

  lines.push("That is the end of the edition.");
  return lines;
}

export default function VoiceReader({ passages }: { passages: Passage[] }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<Mode>("brief");
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState(1);

  const lines = useRef<string[]>([]);
  const cursor = useRef(0);
  const stopping = useRef(false);
  const rateRef = useRef(rate);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" && "speechSynthesis" in window
    );
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakFrom = useCallback((at: number) => {
    const synth = window.speechSynthesis;
    if (at >= lines.current.length) {
      setSpeaking(false);
      setPaused(false);
      cursor.current = 0;
      setIndex(0);
      return;
    }

    cursor.current = at;
    setIndex(at);

    const utter = new SpeechSynthesisUtterance(lines.current[at]);
    utter.rate = rateRef.current;
    utter.pitch = 1;
    utter.onend = () => {
      if (stopping.current) return;
      speakFrom(cursor.current + 1);
    };
    utter.onerror = () => {
      if (!stopping.current) speakFrom(cursor.current + 1);
    };

    synth.speak(utter);
  }, []);

  const start = useCallback(
    (m: Mode) => {
      const synth = window.speechSynthesis;
      stopping.current = true;
      synth.cancel();
      stopping.current = false;

      setMode(m);
      lines.current = toLines(passages, m);
      setSpeaking(true);
      setPaused(false);
      // Cancel settles asynchronously; a tick avoids the first line being eaten.
      setTimeout(() => speakFrom(0), 60);
    },
    [passages, speakFrom]
  );

  const stop = useCallback(() => {
    stopping.current = true;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    cursor.current = 0;
    setIndex(0);
  }, []);

  const togglePause = useCallback(() => {
    const synth = window.speechSynthesis;
    if (synth.paused) {
      synth.resume();
      setPaused(false);
    } else {
      synth.pause();
      setPaused(true);
    }
  }, []);

  const skip = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(cursor.current + delta, lines.current.length - 1));
      stopping.current = true;
      window.speechSynthesis.cancel();
      stopping.current = false;
      setPaused(false);
      setTimeout(() => speakFrom(next), 60);
    },
    [speakFrom]
  );

  const changeRate = useCallback(
    (next: number) => {
      setRate(next);
      rateRef.current = next;
      // Rate only takes on the next utterance, so restart the current line.
      if (speaking) {
        stopping.current = true;
        window.speechSynthesis.cancel();
        stopping.current = false;
        setTimeout(() => speakFrom(cursor.current), 60);
      }
    },
    [speaking, speakFrom]
  );

  if (!supported) return null;

  const total = lines.current.length || 1;
  const progress = speaking ? Math.round(((index + 1) / total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="kicker flex items-center gap-2.5 border-2 border-[var(--ink)] bg-[var(--paper)] px-4 py-2.5 text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors duration-300 cursor-pointer shadow-[3px_3px_0_0_var(--rule)]"
        >
          <PointingHand className="w-5 h-3.5" />
          Read aloud
        </button>
      ) : (
        <div className="w-[290px] border-2 border-[var(--ink)] bg-[var(--paper)] p-4 shadow-[4px_4px_0_0_var(--rule)]">
          <div className="flex items-center justify-between gap-3 pb-2.5 mb-3 border-b border-[var(--ink)]">
            <span className="kicker text-[var(--accent)]">The wireless</span>
            <button
              type="button"
              onClick={() => {
                stop();
                setOpen(false);
              }}
              className="kicker text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              aria-label="Close the reader"
            >
              Close
            </button>
          </div>

          {!speaking ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => start("brief")}
                className="kicker w-full border border-[var(--ink)] px-3 py-2 hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer"
              >
                Five-minute brief
              </button>
              <button
                type="button"
                onClick={() => start("edition")}
                className="kicker w-full border border-[var(--rule)] px-3 py-2 text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              >
                The whole edition
              </button>
            </div>
          ) : (
            <>
              <p className="font-body text-[13px] leading-[1.45] text-[var(--ink)] min-h-[3.6em]">
                {lines.current[index]}
              </p>

              <div className="mt-3 h-[3px] bg-[var(--rule)]" aria-hidden="true">
                <div
                  className="h-full bg-[var(--accent)] transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                <Control onClick={() => skip(-1)} label="Back">
                  &larr;
                </Control>
                <Control onClick={togglePause} label={paused ? "Resume" : "Pause"} wide>
                  {paused ? "Resume" : "Pause"}
                </Control>
                <Control onClick={() => skip(1)} label="Skip">
                  &rarr;
                </Control>
                <Control onClick={stop} label="Stop">
                  &#9632;
                </Control>
              </div>
            </>
          )}

          <div className="mt-3.5 pt-3 border-t border-[var(--rule)] flex items-center gap-2">
            <span className="meta shrink-0">Speed</span>
            {[0.85, 1, 1.25, 1.5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => changeRate(r)}
                aria-pressed={rate === r}
                className={`kicker px-1.5 py-0.5 transition-colors cursor-pointer ${
                  rate === r
                    ? "text-[var(--accent)]"
                    : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              >
                {r}&times;
              </button>
            ))}
          </div>

          <p className="meta mt-3 normal-case tracking-normal text-[11px] font-body italic leading-snug">
            Read by your browser&rsquo;s own voice. Every word spoken is printed
            on the page.
          </p>
        </div>
      )}
    </div>
  );
}

function Control({
  onClick,
  label,
  children,
  wide,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`kicker border border-[var(--rule)] py-1.5 text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors cursor-pointer ${
        wide ? "flex-1" : "w-9"
      }`}
    >
      {children}
    </button>
  );
}
