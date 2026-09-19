"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PointingHand } from "./Ornament";
import Link from "next/link";
import { pickVoices, DELIVERY } from "@/lib/voices";
import type { RecordingManifest } from "@/lib/recording";

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

/**
 * The floating reader.
 *
 * Its "five-minute brief" plays the recording the press made this morning when
 * there is one, and only falls back to the browser's own synthesiser when there
 * is not. That distinction is the whole point of this component's existence in
 * its current shape: the recorded neural voice shipped and was live for a day
 * while every reader still heard Microsoft David, because this button — the
 * only spoken edition anyone could find — never knew the recording existed.
 *
 * "The whole edition" stays on the synthesiser. Nothing is recorded for it;
 * fifty-four stories is not a five-minute bulletin.
 */
export default function VoiceReader({
  passages,
  recording = null,
}: {
  passages: Passage[];
  recording?: RecordingManifest | null;
}) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<Mode>("brief");
  const [index, setIndex] = useState(0);
  // A multiplier on DELIVERY.rate, so "1x" means the broadcast pace rather
  // than the synthesiser's hurried default.
  const [rate, setRate] = useState<number>(1);

  /* ---- the recording, when the press made one ---- */
  const audio = useRef<HTMLAudioElement | null>(null);
  const timbres = recording ? Object.keys(recording.voices) : [];
  const [timbre, setTimbre] = useState(timbres[0] ?? "lady");
  const cut = recording
    ? (recording.voices[timbre] ?? recording.voices[timbres[0]])
    : null;
  /** True while the recording is the thing being played, not the synthesiser. */
  const [onAir, setOnAir] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);

  const lines = useRef<string[]>([]);
  const cursor = useRef(0);
  const stopping = useRef(false);
  const rateRef = useRef(rate);
  /**
   * This set no voice at all, so every utterance went to the system default —
   * Microsoft David on Windows, a twenty-year-old formant synthesiser and the
   * worst voice on the machine. Ranked selection picks the best the device
   * actually has; see lib/voices.
   */
  const voice = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    rateRef.current = rate;
    // One speed control for both engines.
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, timbre]);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(ok);
    if (!ok) return;

    const synth = window.speechSynthesis;
    // Chrome answers the first getVoices() with an empty list and fills it in
    // asynchronously, so one call at mount reliably finds nothing.
    const pick = () => {
      const all = synth.getVoices();
      if (all.length === 0) return;
      const { lady, gentleman, best } = pickVoices(all);
      voice.current = lady ?? gentleman ?? best;
    };
    pick();
    synth.addEventListener("voiceschanged", pick);

    return () => {
      synth.removeEventListener("voiceschanged", pick);
      synth.cancel();
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
    utter.rate = DELIVERY.rate * rateRef.current;
    utter.pitch = DELIVERY.pitch;
    if (voice.current) {
      utter.voice = voice.current;
      utter.lang = voice.current.lang;
    }
    utter.onend = () => {
      if (stopping.current) return;
      // A breath between sentences. The queue otherwise runs them together
      // with no gap, which is most of what makes a synthesiser sound like one.
      window.setTimeout(() => {
        if (stopping.current) return;
        speakFrom(cursor.current + 1);
      }, DELIVERY.gapMs);
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

  /* ---- recorded playback ---- */

  const playRecording = useCallback(() => {
    // Silence the synthesiser first: the two engines share no state and would
    // otherwise talk over each other.
    stopping.current = true;
    window.speechSynthesis.cancel();
    stopping.current = false;
    setSpeaking(false);
    setOnAir(true);
    // After the element exists and has a source.
    requestAnimationFrame(() => {
      const el = audio.current;
      if (!el) return;
      el.playbackRate = rateRef.current;
      // A rejected play() is the autoplay policy, not a broken file. Leaving
      // `playing` true would show a pause button that does nothing.
      el.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      );
    });
  }, []);

  const stopRecording = useCallback(() => {
    const el = audio.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setOnAir(false);
    setPlaying(false);
    setAt(0);
  }, []);

  const toggleRecording = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(
        () => setPlaying(true),
        () => setPlaying(false)
      );
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const nudge = useCallback((seconds: number) => {
    const el = audio.current;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(el.currentTime + seconds, el.duration));
  }, []);

  /**
   * Switching announcer keeps your place in the bulletin.
   *
   * The two recordings are the same words at different speaking rates, so they
   * are different lengths — carrying the raw playhead across would land
   * somewhere else in the news. The fraction through is what is preserved.
   */
  const changeTimbre = useCallback(
    (next: string) => {
      const el = audio.current;
      const was = playing;
      const share =
        el && Number.isFinite(el.duration) && el.duration > 0
          ? el.currentTime / el.duration
          : 0;
      setTimbre(next);
      requestAnimationFrame(() => {
        const e2 = audio.current;
        if (!e2) return;
        const target = recording?.voices[next]?.seconds ?? 0;
        e2.currentTime = share * target;
        e2.playbackRate = rateRef.current;
        if (was) e2.play().catch(() => setPlaying(false));
      });
    },
    [playing, recording]
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
    /*
     * Stood off the foot of the screen far enough to clear the tab bar.
     *
     * Below `lg` components/TabBar.tsx floats a 60px pane of glass across the
     * bottom of the front page, lifted by the same
     * `max(env(safe-area-inset-bottom), 22px)` written there. At the old
     * `bottom-4` this button overlapped it by 42 of its own 42 pixels and,
     * being z-50 against the bar's z-40, painted straight over the wireless
     * and Your Edition tabs. 72 is the bar's height plus twelve of air. Above
     * `lg` the bar is not rendered at all and the button goes back to sitting
     * in the corner.
     */
    <div className="fixed right-4 bottom-[calc(max(env(safe-area-inset-bottom,0px),22px)+72px)] lg:bottom-4 z-50 print:hidden">
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
          {cut && (
            <audio
              ref={audio}
              src={cut.file}
              preload="none"
              onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => {
                setPlaying(false);
                setOnAir(false);
                setAt(0);
              }}
            />
          )}

          <div className="flex items-center justify-between gap-3 pb-2.5 mb-3 border-b border-[var(--ink)]">
            <span className="kicker text-[var(--accent)]">The wireless</span>
            <button
              type="button"
              onClick={() => {
                stop();
                stopRecording();
                setOpen(false);
              }}
              className="kicker text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              aria-label="Close the reader"
            >
              Close
            </button>
          </div>

          {onAir && cut ? (
            <>
              <p className="meta">
                {playing ? "On air" : "Held"} &middot; {clockOf(at)} of{" "}
                {clockOf(cut.seconds)}
              </p>

              <div className="mt-2.5 h-[3px] bg-[var(--rule)]" aria-hidden="true">
                <div
                  className="h-full bg-[var(--accent)]"
                  style={{
                    width: `${Math.min((at / Math.max(cut.seconds, 1)) * 100, 100)}%`,
                  }}
                />
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                <Control onClick={() => nudge(-15)} label="Back fifteen seconds">
                  &larr;
                </Control>
                <Control
                  onClick={toggleRecording}
                  label={playing ? "Hold" : "Resume"}
                  wide
                >
                  {playing ? "Hold" : "Resume"}
                </Control>
                <Control onClick={() => nudge(15)} label="On fifteen seconds">
                  &rarr;
                </Control>
                <Control onClick={stopRecording} label="Stop">
                  &#9632;
                </Control>
              </div>

              {timbres.length > 1 && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="meta shrink-0">Announcer</span>
                  {timbres.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => changeTimbre(t)}
                      aria-pressed={timbre === t}
                      aria-label={`Read by the ${t} announcer`}
                      className={`kicker px-1.5 py-0.5 transition-colors cursor-pointer ${
                        timbre === t
                          ? "text-[var(--accent)]"
                          : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {t === "lady" ? "Lady" : t === "gentleman" ? "Gentleman" : t}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : !speaking ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => (cut ? playRecording() : start("brief"))}
                className="kicker w-full border border-[var(--ink)] px-3 py-2 hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors cursor-pointer"
              >
                {cut ? "This morning's bulletin" : "Five-minute brief"}
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
            {onAir && cut ? (
              <>
                Recorded this morning when the edition went to press, so it
                sounds the same on every device.{" "}
                <Link href="/briefing" className="underline hover:text-[var(--accent)]">
                  The running order and full script
                </Link>{" "}
                are on the wireless page.
              </>
            ) : cut ? (
              <>
                The bulletin is a recording made at press time. The whole
                edition is read by your browser&rsquo;s own voice, which will
                sound like a machine — there is nothing recorded for all
                fifty-four stories.
              </>
            ) : (
              <>
                Read by your browser&rsquo;s own voice. Every word spoken is
                printed on the page.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** m:ss, for a progress readout. */
function clockOf(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
