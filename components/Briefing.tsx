"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Fleuron } from "./Ornament";
import { formatClock, type Briefing } from "@/lib/briefing";
import {
  pickVoices,
  DELIVERY,
  type VoicePair,
  type Timbre,
} from "@/lib/voices";

/**
 * The five-minute briefing, read aloud — blueprint Phase 4.
 *
 * The script is built on the server by lib/briefing.ts; this file is only the
 * studio. It shares VoiceReader's premise — the browser's own
 * SpeechSynthesis, which costs nothing, needs no key and no quota, and is the
 * only reason a spoken edition can exist in a £0 build — and differs in what
 * it is for. VoiceReader is a floating control that reads whatever page you
 * are on. This is a bulletin with a running order, transport, and a printed
 * script of every word it will say.
 *
 * Most of the length below is not the player. It is `speechSynthesis` being
 * what it is: an API that queues rather than streams, whose pause and resume
 * are advisory, whose callbacks arrive after the thing they describe has been
 * cancelled, and which silently stops speaking if you ask for too much at
 * once. Each of those is handled explicitly rather than hoped past, because
 * every one of them has been observed stranding a bulletin mid-sentence.
 */

const RATES = [0.85, 1, 1.25, 1.5] as const;

/**
 * `cancel()` settles asynchronously, and a `speak()` issued in the same task
 * is discarded with it. One frame of delay is enough for the queue to clear.
 */
const CANCEL_SETTLE_MS = 70;

/** How long to give `pause()` and `resume()` before checking they worked. */
const VERIFY_MS = 220;

/**
 * Slack on the watchdog, as a multiple of the estimated line duration plus a
 * flat margin. Generous on purpose: cutting a slow voice off mid-line is a
 * worse failure than waiting a moment longer for a queue that has genuinely
 * died.
 */
const WATCHDOG_FACTOR = 2.5;
const WATCHDOG_MARGIN_MS = 4000;

type Phase = "idle" | "playing" | "paused" | "done";

const getSynth = (): SpeechSynthesis | null =>
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;

const upperFirst = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export default function BriefingPlayer({ briefing }: { briefing: Briefing }) {
  /**
   * False until the first effect runs.
   *
   * The server has no `speechSynthesis`, so it cannot know whether this
   * browser can speak. If the first client render answered that question the
   * two would disagree and React would throw away the server's HTML — the
   * running order would blink out and back. So the first client render is the
   * server's render, and the transport comes alive a tick later.
   */
  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState(false);

  /**
   * The two announcers, and which one is reading.
   *
   * Both are drawn from whatever the device has installed — there is no
   * bought-in voice here and no request leaves the machine. Which means the
   * pair genuinely may not exist: a device carrying only one identifiable
   * English voice gets one announcer, and the choice is not offered rather
   * than offered and broken.
   */
  const [pair, setPair] = useState<VoicePair | null>(null);
  const [timbre, setTimbre] = useState<Timbre>("lady");

  const [phase, setPhase] = useState<Phase>("idle");
  const [line, setLine] = useState(0);
  /**
   * A multiplier on the broadcast pace, not an absolute rate.
   *
   * DELIVERY.rate is a shade under the synthesiser's default because the
   * default is a hurried clip; "1x" here means that intended pace rather than
   * the engine's. Keeping the multiplier in state is also what lets the speed
   * buttons stay whole numbers instead of reading "0.94x".
   */
  const [rate, setRate] = useState<number>(1);

  /**
   * Which line the queue is actually on, and which generation of the queue we
   * are in.
   *
   * `cursor` is duplicated in state only so React can paint it. The epoch is
   * the important one: a cancelled utterance may still fire `onend`, and
   * without a generation stamp that stale callback advances the queue a
   * second time, so a single skip jumps two items. VoiceReader guards this
   * with a boolean cleared on a timer, which leaves a window open; a counter
   * closes it, because a stale callback can never match the current value.
   */
  const cursor = useRef(0);
  const epoch = useRef(0);

  /**
   * The utterance being spoken, held for as long as it speaks.
   *
   * Chrome garbage-collects an unreferenced SpeechSynthesisUtterance while it
   * is still being read, and when it does the `onend` never arrives and the
   * bulletin stops dead partway through.
   */
  const live = useRef<SpeechSynthesisUtterance | null>(null);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const watchdog = useRef(0);
  const verify = useRef(0);
  /** The breath between sentences — see DELIVERY.gapMs. */
  const breath = useRef(0);

  /**
   * Set when `pause()` was ignored and the queue had to be cancelled instead.
   * Resuming then means speaking the current line again from its beginning,
   * since there is no longer anything paused to resume.
   */
  const replay = useRef(false);

  // Callbacks fired by the speech engine run outside React's render, so they
  // read these rather than closed-over state.
  const phaseRef = useRef<Phase>("idle");
  const rateRef = useRef(1);
  const speakRef = useRef<(at: number) => void>(() => {});

  /**
   * The chosen announcer, resolved to a voice that actually exists.
   *
   * Falls back to the best available rather than to silence — a device with no
   * identifiable lady's voice should still read the news. Taking effect from
   * the next line rather than the current one is deliberate: the utterance
   * already with the engine cannot have its voice changed, and cancelling
   * mid-sentence to swap announcer sounds worse than finishing the sentence.
   * With the breath between lines that is a quarter of a second away.
   */
  const chosen = useMemo(
    () => (pair ? ((timbre === "lady" ? pair.lady : pair.gentleman) ?? pair.best) : null),
    [pair, timbre]
  );

  useEffect(() => {
    voice.current = chosen;
  }, [chosen]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  /** Cumulative estimate up to each line, for the progress rule. */
  const elapsedTo = useMemo(() => {
    const out: number[] = [0];
    for (const l of briefing.lines) out.push(out[out.length - 1] + l.seconds);
    return out;
  }, [briefing]);

  const clearTimers = useCallback(() => {
    if (watchdog.current) window.clearTimeout(watchdog.current);
    if (verify.current) window.clearTimeout(verify.current);
    if (breath.current) window.clearTimeout(breath.current);
    watchdog.current = 0;
    verify.current = 0;
    breath.current = 0;
  }, []);

  /**
   * Stop everything and invalidate the current generation of callbacks.
   *
   * The `resume()` is not redundant. Chrome keeps its paused flag through a
   * `cancel()`, and every utterance queued afterwards is then swallowed in
   * silence — pause, skip, and the player never speaks again. Clearing the
   * flag first is the only way back.
   */
  const hardStop = useCallback(
    (synth: SpeechSynthesis) => {
      epoch.current += 1;
      clearTimers();
      live.current = null;
      if (synth.paused) synth.resume();
      synth.cancel();
    },
    [clearTimers]
  );

  const finish = useCallback(() => {
    clearTimers();
    live.current = null;
    setPhase("done");
  }, [clearTimers]);

  /* ---------------- the queue ---------------- */

  const speakLine = useCallback(
    (at: number) => {
      const synth = getSynth();
      if (!synth) return;
      if (at >= briefing.lines.length) {
        finish();
        return;
      }

      cursor.current = at;
      setLine(at);

      const spoken = briefing.lines[at];
      const utter = new SpeechSynthesisUtterance(spoken.text);
      utter.rate = DELIVERY.rate * rateRef.current;
      utter.pitch = DELIVERY.pitch;
      utter.lang = voice.current?.lang ?? "en-US";
      if (voice.current) utter.voice = voice.current;

      const mine = epoch.current;
      const advance = () => {
        if (mine !== epoch.current) return;
        clearTimers();
        if (phaseRef.current !== "playing") return;

        /**
         * A breath between sentences.
         *
         * `speechSynthesis` plays a queue back to back with no gap at all, and
         * that running-together is most of what makes a synthesiser sound
         * mechanical — a newsreader pauses between sentences and pauses longer
         * between stories. The API has no way to express silence, so it has to
         * be waited out here. The wait is longer where the running order moves
         * to a new item, which is what turns a list of sentences into a
         * bulletin.
         */
        const crossing =
          briefing.items.find((it) => it.to === at + 1) !== undefined;
        breath.current = window.setTimeout(
          () => {
            if (mine !== epoch.current || phaseRef.current !== "playing") return;
            speakRef.current(at + 1);
          },
          crossing ? DELIVERY.itemGapMs : DELIVERY.gapMs
        );
      };

      utter.onend = advance;
      utter.onerror = (event) => {
        // "interrupted" and "canceled" are our own skip and stop arriving as
        // errors. Advancing on them would double-skip.
        if (event.error === "interrupted" || event.error === "canceled") return;
        advance();
      };

      live.current = utter;
      synth.speak(utter);

      /**
       * The watchdog.
       *
       * Two failures look identical from here: Chrome's roughly fifteen-second
       * utterance cut-off, which the script's short lines are meant to stay
       * under, and an utterance the engine simply drops. Both end with no
       * `onend` and no `onerror`, and a queue that waits for one of those
       * waits forever. So the line gets a generous budget, and if it passes,
       * the bulletin moves on rather than sitting in silence.
       */
      if (watchdog.current) window.clearTimeout(watchdog.current);
      watchdog.current = window.setTimeout(
        () => {
          if (mine !== epoch.current || phaseRef.current !== "playing") return;
          epoch.current += 1;
          if (synth.paused) synth.resume();
          synth.cancel();
          window.setTimeout(() => speakRef.current(at + 1), CANCEL_SETTLE_MS);
        },
        (spoken.seconds / (DELIVERY.rate * rateRef.current)) *
          1000 *
          WATCHDOG_FACTOR +
          WATCHDOG_MARGIN_MS
      );
    },
    [briefing, clearTimers, finish]
  );

  useEffect(() => {
    speakRef.current = speakLine;
  }, [speakLine]);

  /**
   * Start the queue at a line.
   *
   * `gesture` says whether we are still inside the click that asked for this.
   * Safari on iOS only honours `speak()` from within the gesture that
   * triggered it, so deferring the first utterance by a timer — which is what
   * letting `cancel()` settle requires — leaves the briefing permanently
   * silent on iPhones. When nothing is queued there is nothing to cancel, so
   * the first press can speak immediately and keep the gesture intact.
   */
  const startAt = useCallback(
    (at: number, gesture = false) => {
      const synth = getSynth();
      if (!synth) return;

      const idle = !synth.speaking && !synth.pending && !synth.paused;
      if (idle) {
        epoch.current += 1;
        clearTimers();
      } else {
        hardStop(synth);
      }

      replay.current = false;
      setPhase("playing");
      phaseRef.current = "playing";

      if (idle && gesture) speakRef.current(at);
      else window.setTimeout(() => speakRef.current(at), CANCEL_SETTLE_MS);
    },
    [clearTimers, hardStop]
  );

  const stop = useCallback(() => {
    const synth = getSynth();
    if (synth) hardStop(synth);
    replay.current = false;
    cursor.current = 0;
    setLine(0);
    setPhase("idle");
    phaseRef.current = "idle";
  }, [hardStop]);

  /**
   * Pause, and check that it took.
   *
   * `pause()` is advisory. Android Chrome has ignored it outright, and some
   * engines report `paused === false` while genuinely paused. So the intent is
   * recorded here and the engine is merely asked: if it is still speaking a
   * moment later, the queue is cancelled instead and the current line is
   * marked for replay. The worst a wrong guess costs is hearing one line from
   * its beginning again, which is a far better failure than a pause button
   * that does nothing.
   */
  const pause = useCallback(() => {
    const synth = getSynth();
    if (!synth) return;

    clearTimers();
    setPhase("paused");
    phaseRef.current = "paused";
    synth.pause();

    verify.current = window.setTimeout(() => {
      if (phaseRef.current !== "paused") return;
      if (!synth.paused && synth.speaking) {
        replay.current = true;
        epoch.current += 1;
        live.current = null;
        synth.cancel();
      }
    }, VERIFY_MS);
  }, [clearTimers]);

  /**
   * Resume, and check that too.
   *
   * `resume()` after a long pause is where this API is least reliable: Chrome
   * has been observed acknowledging it while the queue stays silent for good.
   * The fix is the same shape as pause — ask, then verify, and restart the
   * line from the top if the engine did not come back.
   */
  const resume = useCallback(() => {
    const synth = getSynth();
    if (!synth) return;

    setPhase("playing");
    phaseRef.current = "playing";

    if (replay.current) {
      replay.current = false;
      startAt(cursor.current);
      return;
    }

    synth.resume();

    verify.current = window.setTimeout(() => {
      if (phaseRef.current !== "playing") return;
      if (!synth.speaking && !synth.pending) startAt(cursor.current);
      else speakRef.current(cursor.current);
    }, VERIFY_MS);
  }, [startAt]);

  /* ---------------- transport ---------------- */

  const item = briefing.lines[line]?.item ?? 0;

  const jump = useCallback(
    (index: number) => {
      const target = briefing.items[Math.max(0, Math.min(index, briefing.items.length - 1))];
      if (!target) return;
      startAt(target.from, phase === "idle" || phase === "done");
    },
    [briefing, phase, startAt]
  );

  /**
   * Back goes to the top of the entry being read before it goes to the one
   * before it, which is how every transport control a reader has used
   * behaves. It also means a mis-heard headline can be replayed without
   * losing your place in the bulletin.
   */
  const back = useCallback(() => {
    const current = briefing.items[item];
    jump(current && cursor.current > current.from ? item : item - 1);
  }, [briefing, item, jump, cursor]);

  const changeRate = useCallback(
    (next: number) => {
      setRate(next);
      rateRef.current = next;
      // Rate is fixed when an utterance is created, so the change only reaches
      // the reader on the next line unless the current one is started again.
      if (phase === "playing") startAt(cursor.current);
    },
    [phase, startAt]
  );

  /* ---------------- lifecycle ---------------- */

  useEffect(() => {
    const synth = getSynth();
    setMounted(true);
    setSupported(synth !== null);
    if (!synth) return;

    /**
     * Chrome answers the first `getVoices()` with an empty list and fills it
     * in asynchronously, so a voice chosen at mount is no voice at all
     * without listening for the event that says the list arrived.
     *
     * This asked for en-GB, on the reasoning that the paper is set as a London
     * broadsheet. On a machine with no en-GB installed — most Windows
     * machines — that fell through to "first English voice", which is
     * Microsoft David: the default en-US voice and a twenty-year-old formant
     * synthesiser. The paper was reading itself in the worst voice available
     * to it. Voices are now ranked by what the name says about the engine
     * behind them, so a device with something better gets it. See lib/voices.
     */
    const pick = () => {
      const all = synth.getVoices();
      if (all.length === 0) return;
      setPair(pickVoices(all));
    };

    pick();
    synth.addEventListener("voiceschanged", pick);

    /**
     * Speech outlives the page that started it. Leaving this route, or the
     * tab, with the bulletin running leaves a disembodied voice reading the
     * news over whatever the reader does next.
     */
    const silence = () => {
      if (synth.paused) synth.resume();
      synth.cancel();
    };
    window.addEventListener("pagehide", silence);

    return () => {
      synth.removeEventListener("voiceschanged", pick);
      window.removeEventListener("pagehide", silence);
      epoch.current += 1;
      silence();
    };
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /* ---------------- presentation ---------------- */

  const running = phase === "playing" || phase === "paused";
  /**
   * Silence is part of the running time.
   *
   * The breath between sentences is a fixed wait rather than something the
   * engine speaks, so unlike the words it does not shorten when the pace is
   * turned up. Across roughly sixty lines it comes to nearly half a minute,
   * which is not a rounding error — leaving it out had the clock promising a
   * shorter bulletin than it actually delivers.
   */
  const gapSeconds = useMemo(() => {
    const boundaries = Math.max(briefing.lines.length - 1, 0);
    const itemBreaks = Math.max(briefing.items.length - 1, 0);
    return (
      (boundaries * DELIVERY.gapMs +
        itemBreaks * (DELIVERY.itemGapMs - DELIVERY.gapMs)) /
      1000
    );
  }, [briefing]);

  /**
   * Speech scales with the pace; silence does not.
   *
   * This read `briefing.seconds`, which now carries the pauses baked into it —
   * so adding `gapSeconds` charged for every breath twice, and dividing by the
   * rate shortened waits that are fixed timeouts and do not move. The clock
   * promised 5:34 for a bulletin that runs 5:15. `speechSeconds` is the spoken
   * part alone, which is the only part a speed control can hurry.
   */
  const estimate = briefing.speechSeconds / (DELIVERY.rate * rate) + gapSeconds;
  const spent = running || phase === "done" ? elapsedTo[line] / rate : 0;
  const progress =
    phase === "done" ? 100 : Math.min(100, (spent / estimate) * 100);
  const live_ = briefing.items[item];

  const fullItems = briefing.items.filter(
    (i) => i.kind === "lead" || i.kind === "story"
  ).length;

  return (
    <div className="pt-6 pb-2">
      {/* ---- the panel itself ---- */}
      <div className="border-2 border-[var(--ink)] p-5 sm:p-7">
        <div className="mb-4 flex items-center gap-3">
          <span className="kicker text-[var(--accent)]">Wireless bulletin</span>
          <span className="h-px flex-1 bg-[var(--rule)]" />
          <Fleuron className="h-3.5 w-7 text-[var(--rule)]" />
        </div>

        <h1
          className="headline-caps text-[var(--ink)]"
          style={{ fontSize: "clamp(1.7rem, 4vw, 2.8rem)" }}
        >
          The Five-Minute Briefing
        </h1>

        <div className="rule-double my-5" aria-hidden="true" />

        <p className="font-body italic text-center max-w-[52ch] mx-auto text-[var(--ink-soft)] text-[1.02rem] leading-[1.5]">
          Today&rsquo;s edition read out in order — the lead, the desks, and a
          closing run through what else came over the wire. Spoken by the voice
          already installed on your own machine, which is why it is free.
        </p>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          <Figure term="Runs about" value={formatClock(estimate)} />
          <Figure term="In full" value={String(fullItems)} />
          <Figure term="Stories" value={`${briefing.read} of ${briefing.total}`} />
          <Figure term="Words" value={String(briefing.words)} />
        </dl>

        {/* ---- transport ---- */}
        <div className="mt-6 h-[4px] border-t border-b border-[var(--ink)]" aria-hidden="true">
          <div
            className="h-full bg-[var(--accent)] transition-[width] duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Control
            onClick={back}
            label="Back to the previous item"
            disabled={!mounted || !supported || !running}
          >
            &larr; Back
          </Control>

          <Control
            primary
            pressed={phase === "playing"}
            onClick={() => {
              if (phase === "playing") pause();
              else if (phase === "paused") resume();
              else startAt(phase === "done" ? 0 : cursor.current, true);
            }}
            label={
              phase === "playing"
                ? "Pause the briefing"
                : phase === "paused"
                  ? "Resume the briefing"
                  : "Play the briefing"
            }
            disabled={!mounted || !supported}
          >
            {phase === "playing"
              ? "Pause"
              : phase === "paused"
                ? "Resume"
                : phase === "done"
                  ? "Play again"
                  : "Play the briefing"}
          </Control>

          <Control
            onClick={() => jump(item + 1)}
            label="Skip to the next item"
            disabled={!mounted || !supported || !running}
          >
            Next &rarr;
          </Control>

          <Control
            onClick={stop}
            label="Stop the briefing"
            disabled={!mounted || !supported || !running}
          >
            Stop
          </Control>

          <span className="flex-1" />

          {/*
            Offered only when the device actually has both. A device carrying
            one identifiable English voice gets one announcer, and showing a
            choice that silently does nothing is worse than showing none.
          */}
          {pair?.lady && pair?.gentleman && (
            <>
              <span className="meta shrink-0">Announcer</span>
              {(["lady", "gentleman"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTimbre(t)}
                  aria-pressed={timbre === t}
                  aria-label={`Read by the ${t} announcer`}
                  disabled={!mounted || !supported}
                  className={`kicker cursor-pointer px-1.5 py-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-40 ${
                    timbre === t
                      ? "text-[var(--accent)]"
                      : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  }`}
                >
                  {t === "lady" ? "Lady" : "Gentleman"}
                </button>
              ))}
              <span className="meta shrink-0 text-[var(--ink-faint)]">&middot;</span>
            </>
          )}

          <span className="meta shrink-0">Speed</span>
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => changeRate(r)}
              aria-pressed={rate === r}
              aria-label={`Read at ${r} times speed`}
              disabled={!mounted || !supported}
              className={`kicker cursor-pointer px-1.5 py-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-40 ${
                rate === r
                  ? "text-[var(--accent)]"
                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
              }`}
            >
              {r}&times;
            </button>
          ))}
        </div>

        {/* ---- what is being said, printed ---- */}
        <div className="mt-5 border-t border-[var(--rule)] pt-4">
          <p className="meta">
            {!mounted
              ? "Preparing the set"
              : !supported
                ? "No voice on this machine"
                : phase === "playing"
                  ? `On air — ${formatClock(spent)} of ${formatClock(estimate)}`
                  : phase === "paused"
                    ? "Held"
                    : phase === "done"
                      ? "Off air"
                      : "Ready"}
          </p>

          <p
            className={`font-body mt-2 min-h-[3.2em] text-[1.05rem] leading-[1.45] ${
              running ? "text-[var(--ink)]" : "text-[var(--ink-faint)] italic"
            }`}
          >
            {mounted && !supported
              ? "This browser has no speech voices installed, so there is nobody to read the bulletin. The running order below is the whole script — every word it would have said is printed."
              : briefing.lines[line]?.text}
          </p>

          {/*
            One live region, and it carries the entry rather than the line.
            Announcing every utterance would have a screen reader talking over
            the voice that is already talking.
          */}
          <p className="sr-only" aria-live="polite">
            {running ? `Now reading: ${live_?.title ?? ""}` : ""}
          </p>

          <p className="meta mt-3 normal-case tracking-normal text-[11px] font-body italic leading-snug">
            {chosen
              ? `Read by ${chosen.name}, a voice already on this device. Nothing is sent anywhere, and nothing is generated — every word below was written by a publisher or is the studio announcing them.`
              : "Read by your browser's own voice. Nothing is sent anywhere, and nothing is generated — every word below was written by a publisher or is the studio announcing them."}
          </p>

          {/*
            Said plainly, because no amount of code can fix it. The good
            neural voices cost money per character and this paper costs
            nothing to run, so the announcer is whoever the device already
            has — and on a bare Windows install that is a synthesiser from
            two decades ago. Naming the remedy is more use than apologising.
          */}
          {pair?.onlyLegacy && (
            <p className="font-body mt-2 text-[13px] leading-relaxed italic text-[var(--ink-faint)]">
              This device carries only its older built-in voices, which is why
              the announcer sounds mechanical. Installing a natural voice —
              Windows: Settings, Time &amp; language, Speech, Add voices — is
              free, and the studio will pick it up on its own.
            </p>
          )}
        </div>
      </div>

      {/* ---- the running order ---- */}
      <div className="mt-9">
        <div className="mb-5 flex items-center gap-3">
          <span className="kicker bg-[var(--ink)] px-3 py-1.5 text-[var(--paper)]">
            Running order
          </span>
          <span className="h-[3px] flex-1 border-t border-b border-[var(--ink)]" />
        </div>

        <ol className="border-t border-[var(--rule)]">
          {briefing.items.map((entry, index) => {
            const isLive = running && index === item;
            const read = running && index < item;

            return (
              <li key={`${entry.kind}-${index}`}>
                {entry.desk && (
                  <p className="kicker mt-6 mb-1 flex items-center gap-3 text-[var(--accent)]">
                    {upperFirst(entry.desk)}
                    <span className="h-px flex-1 bg-[var(--rule)]" />
                  </p>
                )}

                <div
                  className={`flex items-baseline gap-3 border-b border-[var(--rule)] py-3 transition-colors ${
                    isLive ? "bg-[var(--paper-deep)]" : ""
                  }`}
                  aria-current={isLive ? "true" : undefined}
                >
                  <span
                    className={`meta w-7 shrink-0 tabular-nums ${
                      isLive ? "text-[var(--accent)]" : ""
                    }`}
                    aria-hidden="true"
                  >
                    {isLive ? "▸" : read ? "·" : String(index + 1).padStart(2, "0")}
                  </span>

                  <button
                    type="button"
                    onClick={() => jump(index)}
                    disabled={!mounted || !supported}
                    aria-label={`Read from: ${entry.title}`}
                    className="flex-1 cursor-pointer text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default"
                  >
                    <span
                      className={`headline block text-[1.05rem] leading-[1.2] ${
                        isLive
                          ? "text-[var(--accent)]"
                          : read
                            ? "text-[var(--ink-faint)]"
                            : "text-[var(--ink)]"
                      }`}
                    >
                      {entry.title}
                    </span>
                    <span className="meta mt-1 block">
                      {[
                        entry.section,
                        entry.sources > 0
                          ? `${entry.sources} ${entry.sources === 1 ? "outlet" : "outlets"}`
                          : null,
                        entry.kind === "rundown" ? "in brief" : null,
                        formatClock(entry.seconds / rate),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>

                  {entry.storyId && (
                    <Link
                      href={`/story/${entry.storyId}`}
                      data-story-link
                      className="kicker shrink-0 text-[var(--ink-faint)] transition-colors hover:text-[var(--accent)]"
                    >
                      Column
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function Figure({ term, value }: { term: string; value: string }) {
  return (
    <div className="bg-[var(--paper)] px-3 py-3 text-center">
      <dt className="meta">{term}</dt>
      <dd className="font-head mt-1 text-[1.3rem] leading-none text-[var(--ink)]">
        {value}
      </dd>
    </div>
  );
}

function Control({
  onClick,
  label,
  children,
  disabled,
  primary,
  pressed,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  primary?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={primary ? pressed : undefined}
      title={label}
      className={`kicker cursor-pointer transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-default disabled:opacity-40 ${
        primary
          ? "border-2 border-[var(--ink)] px-5 py-2.5 text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          : "border border-[var(--rule)] px-3 py-2 text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}
