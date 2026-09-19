/**
 * The five-minute briefing, checked against the clock before anyone listens.
 *
 * The property that matters: the number the bulletin bills itself as, the
 * number the sizer budgets against, and the length of the file the recorder
 * produces must all be the same number. They were not — the sizer priced
 * speech at a broadcast 150 words a minute and charged a flat 0.35s a line for
 * silence, while the recorder's Kokoro voices read at 123.5 (af_heart) and
 * 110.0 (am_michael) words a minute and the recorder inserted 260ms between
 * lines and 620ms between items. Today's edition was billed at five minutes
 * and ran 5:59 and 6:40.
 *
 * Every figure below marked "measured" is read off public/briefing/manifest.json
 * for the edition of 2026-09-17, whose marks record the exact sample offset of
 * all 63 spoken lines.
 */
import {
  buildBriefing,
  PACE,
  TARGET_SECONDS,
  type Briefing,
  type BriefSource,
  type SpokenBrief,
} from "../lib/briefing.ts";
import type { Story } from "../lib/digest.ts";
import { DELIVERY } from "../lib/voices.ts";
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";


/** The repository root, so these run on any machine and on a CI runner. */
const REPO = fileURLToPath(new URL("..", import.meta.url));
/**
 * This suite runs under plain `node`, which strips types rather than checking
 * them, so nothing here proves anything about the type contract. That a
 * `Brief` from lib/digest.ts satisfies `BriefSource` — so the page can hand
 * `getBrief` over with no adapter — is checked by `npx tsc --noEmit` instead.
 * What is checked below is the shape at runtime: a whole `Brief`, extra fields
 * and all, must behave the same as the two the bulletin reads.
 */
type BriefShaped = {
  tldr: string | null;
  keyPoints: string[];
  whyItMatters: string | null;
  whoIsAffected: string | null;
  model: string;
};
const asSource = (f: (id: string) => BriefShaped | null): BriefSource => f;

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => {
  if (!c) fails.push(`${n} — ${d}`);
};
const near = (n: string, got: number, want: number, tol: number, d = "") =>
  ok(n, Math.abs(got - want) <= tol, `${d} got ${got.toFixed(2)}, want ${want.toFixed(2)} ±${tol}`);

const countWords = (t: string) => (t.match(/\S+/g) ?? []).length;

/* ------------------------------------------------------------------ *
 * Today's edition, mapped exactly as lib/digest.ts `toStory` maps it.
 * ------------------------------------------------------------------ */

const edition = JSON.parse(
  readFileSync(`${REPO}data/edition-latest.json`, "utf8")
);

function toStory(cluster: any): Story {
  const byTime = [...cluster.articles].sort(
    (a: any, b: any) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
  );
  const seen = new Set<string>();
  const body = byTime
    .filter((a: any) => {
      if (seen.has(a.sourceId) || a.summary.length <= 40) return false;
      seen.add(a.sourceId);
      return true;
    })
    .sort((a: any, b: any) => b.summary.length - a.summary.length)
    .slice(0, 3)
    .map((a: any) => a.summary);
  const credited = new Set<string>();
  const sources = byTime.filter((a: any) => {
    if (credited.has(a.sourceName)) return false;
    credited.add(a.sourceName);
    return true;
  });
  return {
    id: cluster.id,
    headline: cluster.title,
    deck: (cluster.summary ?? "").slice(0, 240),
    body: body.length ? body : [cluster.summary || cluster.title],
    section: cluster.category,
    sources: sources.map((a: any) => ({
      name: a.sourceName,
      url: a.sourceUrl,
      publishedAt: a.publishedAt,
    })),
    publishedAt: cluster.lastSeenAt,
    score: cluster.score,
  } as Story;
}

const today: Story[] = edition.clusters.map(toStory);

/* ------------------------------------------------------------------ *
 * 1. The pacing constants describe the voice that was actually recorded
 *
 * Measured off the 2026-09-17 manifest: 63 lines, 690 words. Subtracting the
 * silence the recorder inserted (62 line boundaries, 21 of them item
 * boundaries) leaves the clip audio each voice produced.
 * ------------------------------------------------------------------ */

const MEASURED = {
  lines: 63,
  words: 690,
  /** af_heart at speed 1. */
  ladyClipSeconds: 335.3,
  /** am_michael at speed 1. */
  gentlemanClipSeconds: 376.3,
  /** Whole-file lengths, as committed. */
  ladyFile: 359,
  gentlemanFile: 400,
};

/**
 * Every take of `af_heart` at speed 1 that has been measured off a manifest.
 *
 * There used to be one, and the assertion below demanded PACE reproduce it to
 * two seconds. That is what produced 138 words a minute: a perfect fit to one
 * morning, 6.5% out by the third. Fitting a calibration to a single
 * observation and then asserting the fit is a check that guarantees the bug it
 * is supposed to catch.
 */
const TAKES = [
  { day: "2026-09-17", lines: 63, words: 690, speech: 335.3 },
  { day: "2026-09-19", lines: 45, words: 569, speech: 255.9 },
];

{
  /*
   * Within tolerance of all of them, not exact on any.
   *
   * 5% is the number the paper bills against — a five-minute bulletin may run
   * 4:45 or 5:15 and still be honestly described. The recorder warns at 4%, so
   * this failing means the warning has already fired on a press run and been
   * missed.
   */
  for (const take of TAKES) {
    const predicted =
      (take.words / PACE.wordsPerMinute) * 60 + take.lines * PACE.perLineSeconds;
    const off = Math.abs(predicted / take.speech - 1);
    ok(
      `paceMatchesTheRecordedVoice@${take.day}`,
      off <= 0.05,
      `predicted ${predicted.toFixed(1)}s against a measured ${take.speech}s — ${(off * 100).toFixed(1)}% out`
    );
  }

  /*
   * And it must not be fitted to either one alone. A calibration that nails
   * the oldest take and misses the newest is the failure that was just
   * corrected; requiring the errors to sit on opposite sides of zero is what
   * stops the next fit collapsing back onto a single morning.
   */
  const errors = TAKES.map(
    (t) => (t.words / PACE.wordsPerMinute) * 60 + t.lines * PACE.perLineSeconds - t.speech
  );
  ok(
    "paceIsNotFittedToOneMorning",
    errors.some((e) => e < 0) && errors.some((e) => e > 0),
    `errors all point the same way: ${errors.map((e) => e.toFixed(1)).join(", ")}`
  );

  // And the old constants must not: this is the bug the check exists for.
  const old = (MEASURED.words / 150) * 60 + MEASURED.lines * 0.35;
  ok(
    "oldPaceWasWrong",
    Math.abs(old - MEASURED.ladyClipSeconds) > 20,
    `the previous model predicted ${old.toFixed(0)}s for a take that ran ${MEASURED.ladyClipSeconds}s`
  );

  near("gapIsTheRecordersGap", PACE.gapSeconds, 0.26, 1e-9);
  near("itemGapIsTheRecordersItemGap", PACE.itemGapSeconds, 0.62, 1e-9);
}

/* -- and the takes it produced afterwards --------------------------------- *
 *
 * Recorded with the calibrated constants, straight off the finished MP3 rather
 * than from the recorder's own arithmetic. Kept here as a fixed record so the
 * evidence survives `public/briefing` being overwritten by the next press run.
 */
const AFTER: { target: number; predicted: number; lady: number; gentleman: number }[] = [
  // Two-minute test target, 22 lines, 217 words.
  { target: 120, predicted: 115.4, lady: 112.5, gentleman: 116.3 },
  // The real thing: the edition of 2026-09-17 at the five-minute target,
  // 49 lines, 580 words. ffmpeg reads 00:04:54.96 and 00:05:05.71 off the two
  // finished MP3s. The same script, before this was calibrated, ran 5:59 and
  // 6:40 and the two voices were forty-one seconds apart.
  { target: 300, predicted: 297.1, lady: 294.96, gentleman: 305.71 },
];

for (const take of AFTER) {
  for (const [timbre, seconds] of [
    ["lady", take.lady],
    ["gentleman", take.gentleman],
  ] as const) {
    ok(
      `takeLandsOnPrediction@${take.target}s:${timbre}`,
      Math.abs(seconds / take.predicted - 1) <= 0.04,
      `predicted ${take.predicted}s, recorded ${seconds}s`
    );
  }
  ok(
    `voicesAgreeOnLength@${take.target}s`,
    Math.abs(take.lady - take.gentleman) <= Math.min(take.lady, take.gentleman) * 0.05,
    `${take.lady}s against ${take.gentleman}s`
  );
}

/* -- the same pacing everywhere it is written down ------------------------ *
 *
 * Three places apply these pauses: this sizer, the recorder, and the browser
 * fallback player through lib/voices.ts `DELIVERY`. The recorder now imports
 * them; lib/voices.ts cannot, because no import specifier satisfies both the
 * Next bundle and a plain `node` process. So the duplication stays and is
 * checked instead of trusted.
 */
{
  near("browserFallbackUsesTheSameBreath", DELIVERY.gapMs / 1000, PACE.gapSeconds, 1e-9);
  near(
    "browserFallbackUsesTheSameSettlingPause",
    DELIVERY.itemGapMs / 1000,
    PACE.itemGapSeconds,
    1e-9
  );

  // And the recorder must not have grown a copy of its own again.
  const recorder = readFileSync(
    `${REPO}services/ai/voice.ts`,
    "utf8"
  );
  ok(
    "theRecorderImportsThePacing",
    /import\s*\{[^}]*\bPACE\b[^}]*\}\s*from\s*"\.\.\/\.\.\/lib\/briefing\.ts"/.test(recorder),
    "voice.ts no longer imports PACE from lib/briefing.ts"
  );
  ok(
    "theRecorderKeepsNoGapsOfItsOwn",
    !/\bGAP_MS\b|\bITEM_GAP_MS\b/.test(recorder),
    "voice.ts has declared its own gap constants again"
  );

  /**
   * The two announcers read one bulletin of one length.
   *
   * This used to assert the multiplier equalled 376.3/335.3 — the ratio of two
   * totals from the edition of 2026-09-17 — and that is what shipped as 1.12.
   * It under-corrected: on 2026-09-18 he still ran 316s against her 304s,
   * because the ratio of two totals silently assumes the only difference
   * between the voices is tempo, and his clips also carry more silence at
   * their edges (fitted line for line: 1.0189x her speech plus a fixed 0.142s
   * a line, r2 0.9984).
   *
   * So the assertion is now the property rather than the derivation. Pinning a
   * formula only guarantees the formula was applied, and the formula was the
   * thing that was wrong; the length of the two files is what a listener
   * actually gets. 1% of five minutes is three seconds, which nobody can hear
   * and no round-off to whole minutes can trip over.
   */
  const takes = JSON.parse(
    readFileSync(
      `${REPO}public/briefing/manifest.json`,
      "utf8"
    )
  ) as { voices: Record<string, { seconds: number }> };
  const ladyFile = takes.voices.lady?.seconds ?? NaN;
  const gentFile = takes.voices.gentleman?.seconds ?? NaN;
  near(
    "theTwoTakesAreTheSameLength",
    gentFile,
    ladyFile,
    Math.max(ladyFile * 0.01, 3),
    `the announcers must not hand the reader two different bulletins (lady ${ladyFile}s, gentleman ${gentFile}s):`
  );

  /**
   * And the multiplier stays a correction rather than a distortion. Measured
   * against her, 1.163 puts his words about 1.9% ahead of hers — roughly 124
   * words a minute. Far outside this range he would be readable as hurried or
   * as the slow reader the multiplier exists to fix.
   */
  const speed = Number(
    recorder.match(/gentleman:\s*\{[^}]*speed:\s*([\d.]+)/)?.[1] ?? NaN
  );
  ok(
    "theGentlemanIsBroughtOntoThePace",
    speed >= 1.05 && speed <= 1.25,
    `am_michael's speed is ${speed}, outside the range a tempo correction can defend`
  );
}

/* ------------------------------------------------------------------ *
 * 2. The predicted duration now includes the pauses
 *
 * `Briefing.seconds` has to be the length of the file, not the length of the
 * speech. On the recorded script of 2026-09-17 the sixty-two line boundaries
 * came to 23.7 seconds of silence — a twelfth of the whole budget, and not a
 * rounding error in anybody's arithmetic.
 * ------------------------------------------------------------------ */

/** The silence the recorder will insert, derived from the laid-out script. */
function pauseSecondsOf(b: Briefing): number {
  let total = 0;
  for (let i = 0; i < b.lines.length - 1; i++) {
    total +=
      b.lines[i + 1].item !== b.lines[i].item ? PACE.itemGapSeconds : PACE.gapSeconds;
  }
  return total;
}

{
  const b = buildBriefing(today, edition.date);

  const pauses = pauseSecondsOf(b);
  ok("scriptHasPauses", pauses > 15, `only ${pauses.toFixed(1)}s of silence — is the script empty?`);
  near(
    "secondsIncludesThePauses",
    b.seconds - b.speechSeconds,
    pauses,
    0.01,
    "wall clock minus speech must equal the inserted silence:"
  );

  const speech =
    (b.words / PACE.wordsPerMinute) * 60 + b.lines.length * PACE.perLineSeconds;
  near("speechSecondsIsWordsAndClipLead", b.speechSeconds, speech, 0.01);

  // The three totals the players read must agree with each other.
  const fromLines = b.lines.reduce((n, l) => n + l.seconds, 0);
  const fromItems = b.items.reduce((n, i) => n + i.seconds, 0);
  near("linesSumToTheWhole", fromLines, b.seconds, 0.01);
  near("itemsSumToTheWhole", fromItems, b.seconds, 0.01);

  // Every item's range has to cover its lines exactly, or Recording.tsx seeks
  // to the wrong place.
  let covered = 0;
  for (const it of b.items) {
    const mine = b.lines.slice(it.from, it.to);
    covered += mine.length;
    near(
      `itemSpansItsLines@${it.kind}:${it.from}`,
      mine.reduce((n, l) => n + l.seconds, 0),
      it.seconds,
      0.01
    );
  }
  ok("everyLineBelongsToAnItem", covered === b.lines.length, `${covered} of ${b.lines.length}`);
}

/* ------------------------------------------------------------------ *
 * 3. A line's predicted seconds is the gap between two recorded marks
 *
 * This is the property the manifest can settle directly: `marks[i+1].at -
 * marks[i].at` is what the recorder actually produced for line i, silence
 * included, and that is exactly what `line.seconds` claims to predict.
 * Checked in aggregate rather than line by line — a single line's length
 * scatters by about a second either way, which does not matter, while the
 * total does.
 * ------------------------------------------------------------------ */

{
  const script = buildBriefing(today, edition.date);
  let manifest: any = null;
  try {
    manifest = JSON.parse(
      readFileSync(
        `${REPO}public/briefing/manifest.json`,
        "utf8"
      )
    );
  } catch {
    /* no recording on disk; the calibration checks above still stand */
  }

  const cuts = Object.entries<any>(manifest?.voices ?? {}).filter(
    ([, cut]) => cut?.marks?.length === script.lines.length
  );

  if (cuts.length === 0) {
    console.log(
      `  (no recording on disk matches the current ${script.lines.length}-line script — the take comparison is skipped; run services/ai/voice.ts to arm it)`
    );
  }

  for (const [timbre, cut] of cuts) {
    const marks = cut.marks as { at: number }[];
    ok(
      `marksAdvance@${timbre}`,
      marks.every((m, i) => i === 0 || m.at > marks[i - 1].at),
      "a mark went backwards"
    );

    // Predicted against recorded, line for line, then in total. The per-line
    // figure scatters by about a second either way — Kokoro's clips are not a
    // linear function of word count and never will be — so only the total is
    // asserted, which is the number the paper puts its name to.
    let worst = 0;
    for (let i = 0; i < marks.length - 1; i++) {
      const recordedLine = marks[i + 1].at - marks[i].at;
      worst = Math.max(worst, Math.abs(recordedLine - script.lines[i].seconds));
    }
    near(
      `takeMatchesPrediction@${timbre}`,
      cut.seconds,
      script.seconds,
      script.seconds * 0.05,
      `${marks.length} lines, worst single line off by ${worst.toFixed(1)}s:`
    );
    console.log(
      `  ${timbre}: predicted ${script.seconds.toFixed(0)}s, recorded ${cut.seconds}s (${(((cut.seconds - script.seconds) / script.seconds) * 100).toFixed(1)}%)`
    );
  }

  if (cuts.length === 2) {
    const [a, b] = cuts.map(([, cut]) => cut.seconds as number);
    // The whole point of normalising the voices: the bulletin is one length,
    // whoever reads it. Before, the same script ran 359s and 400s.
    ok(
      "bothVoicesRunTheSameLength",
      Math.abs(a - b) <= Math.min(a, b) * 0.05,
      `${a}s against ${b}s`
    );
  }
}

/* ------------------------------------------------------------------ *
 * 4. The script fits its target, at every target and every edition size
 * ------------------------------------------------------------------ */

const TARGETS = [45, 60, 90, 120, 180, 240, 300, 420, 600];
const SIZES = [0, 1, 2, 3, 5, 12, 30, 54];

{
  let cases = 0;
  for (const size of SIZES) {
    const stories = today.slice(0, size);
    for (const target of TARGETS) {
      const b = buildBriefing(stories, edition.date, target);
      cases++;

      ok(
        `fitsTarget@${size}x${target}`,
        // The lead is always read even when it alone overruns — a briefing
        // with no stories in it is not a briefing — so a one-story edition is
        // allowed past the target. Everything else must fit.
        b.seconds <= target + 0.7 || b.read <= 1,
        `${b.read} stories ran ${b.seconds.toFixed(1)}s against a ${target}s target`
      );

      ok(
        `finite@${size}x${target}`,
        Number.isFinite(b.seconds) && Number.isFinite(b.speechSeconds) && b.seconds >= 0,
        `seconds=${b.seconds}`
      );

      ok(
        `readNeverExceedsTotal@${size}x${target}`,
        b.read <= b.total && b.total === size,
        `read ${b.read} of ${b.total}, edition had ${size}`
      );

      // A bulletin that stops at half its slot has wasted the reader's time.
      // Only asserted where there is enough wire to fill it.
      if (size >= 12 && target <= 300) {
        ok(
          `fillsTarget@${size}x${target}`,
          b.seconds >= target * 0.85,
          `only ${b.seconds.toFixed(1)}s of a ${target}s slot`
        );
      }
    }
  }
  ok("targetCoverage", cases === TARGETS.length * SIZES.length, `${cases} cases`);
}

/* -- the default target is still five minutes, and still lands there ------ */
{
  const b = buildBriefing(today, edition.date);
  ok("defaultTargetIsFiveMinutes", TARGET_SECONDS === 300, `${TARGET_SECONDS}`);
  ok(
    "fiveMinutesMeansFiveMinutes",
    Math.abs(b.seconds - 300) <= 15,
    `a full edition produced ${b.seconds.toFixed(1)}s`
  );
  // What the opening line promises the reader has to be what it delivers.
  const promise = b.lines.find((l) => /runs about/.test(l.text))?.text ?? "";
  ok(
    "openingPromisesFiveMinutes",
    /about five minutes/.test(promise),
    JSON.stringify(promise)
  );
}

/* -- degenerate editions -------------------------------------------------- */
{
  const none = buildBriefing([], edition.date);
  ok("emptyEditionStillOpensAndCloses", none.items.length === 2, `${none.items.length} items`);
  ok("emptyEditionReadsNothing", none.read === 0 && none.total === 0);
  ok("emptyEditionHasNoNaN", Number.isFinite(none.seconds) && none.seconds > 0);
  ok(
    "emptyEditionSaysSo",
    none.lines.some((l) => /wire is quiet|Nothing has reached us/.test(l.text)),
    none.lines.map((l) => l.text).join(" | ")
  );

  for (const n of [1, 2]) {
    const b = buildBriefing(today.slice(0, n), edition.date);
    ok(`leadAlwaysRead@${n}`, b.read >= 1, `read ${b.read}`);
    ok(
      `noRundownOfNothing@${n}`,
      b.items.filter((i) => i.kind === "rundown").length <= Math.max(n - 1, 0),
      `${b.items.filter((i) => i.kind === "rundown").length} rundown entries for ${n} stories`
    );
    ok(`itemsAreOrdered@${n}`, b.items.every((it, i) => i === 0 || it.from === b.items[i - 1].to));
  }

  // A story with nothing but a headline must not crash or speak a blank line.
  const bare: Story = {
    id: "bare",
    headline: "A headline and nothing else",
    deck: "",
    body: [],
    section: "AI News",
    sources: [],
    publishedAt: edition.date,
    score: 1,
  } as unknown as Story;
  const b = buildBriefing([bare], edition.date);
  ok("bareStoryIsSpeakable", b.lines.every((l) => l.text.trim().length > 0), "a blank line");
  ok("bareStoryIsRead", b.read === 1);
}

/* ------------------------------------------------------------------ *
 * 5. Generated copy is preferred when it exists, and invisible when not
 * ------------------------------------------------------------------ */

const sample = today.slice(0, 8);
const plain = buildBriefing(sample, edition.date);

/** Deep comparison, because "unchanged" has to mean every field. */
const same = (a: Briefing, b: Briefing) => JSON.stringify(a) === JSON.stringify(b);

{
  // Absent, in every shape the contract allows.
  const absent: [string, (id: string) => SpokenBrief | null | undefined][] = [
    ["undefinedLookup", () => undefined],
    ["nullLookup", () => null],
    ["emptyBrief", () => ({ tldr: null, whyItMatters: null })],
    ["blankStrings", () => ({ tldr: "", whyItMatters: "" })],
    ["whitespaceOnly", () => ({ tldr: "   ", whyItMatters: "\n\t " })],
    ["missingFields", () => ({}) as SpokenBrief],
    ["partialEdition", (id) => (id === sample[3].id ? null : undefined)],
  ];
  for (const [name, lookup] of absent) {
    ok(
      `degradesCleanly@${name}`,
      same(buildBriefing(sample, edition.date, undefined, lookup), plain),
      "the script moved when there was nothing to move it"
    );
  }

  // A lookup that throws must not take the bulletin down with it — the editor
  // is a separate job and may be half-written.
  let threw = false;
  try {
    const b = buildBriefing(sample, edition.date, undefined, () => {
      throw new Error("editor blew up");
    });
    ok("survivesABrokenLookup", same(b, plain), "the script moved");
  } catch {
    threw = true;
  }
  ok("aBrokenLookupIsNotFatal", !threw, "buildBriefing threw when the lookup did");
}

{
  // Present: the tldr replaces the standfirst, the why-it-matters replaces the
  // extra publisher paragraph.
  const TLDR = "Wembley Stadium has agreed to buy nine hundred singing robots.";
  const WHY = "It is the first time a sports ground has bought a choir outright.";
  const lookup = (id: string): SpokenBrief | null =>
    id === sample[0].id ? { tldr: TLDR, whyItMatters: WHY } : null;

  const b = buildBriefing(sample, edition.date, undefined, lookup);
  const spoken = b.lines.map((l) => l.text).join(" ");

  ok("usesTheTldr", spoken.includes("nine hundred singing robots"), "the tldr was not spoken");
  ok("usesWhyItMatters", spoken.includes("bought a choir outright"), "why-it-matters was not spoken");

  // And the standfirst it replaced is gone, rather than read out as well.
  // Marked copy, so there is no doubt which of the two was spoken.
  const marked: Story = {
    ...sample[0],
    id: "marked",
    deck: "The standfirst describes a zeppelin moored over Highbury. It was there all afternoon.",
    body: ["A second paragraph mentions the aerodrome at Cricklewood as well."],
  };
  const withDeck = buildBriefing([marked], edition.date);
  const withCopy = buildBriefing([marked], edition.date, undefined, () => ({
    tldr: TLDR,
    whyItMatters: WHY,
  }));
  const deckText = withDeck.lines.map((l) => l.text).join(" ");
  const copyText = withCopy.lines.map((l) => l.text).join(" ");
  ok("withoutCopyTheStandfirstIsRead", /zeppelin/.test(deckText), deckText);
  ok("theStandfirstStepsAside", !/zeppelin/.test(copyText), copyText);
  ok(
    "theExtraParagraphStepsAsideToo",
    /Cricklewood/.test(deckText) && !/Cricklewood/.test(copyText),
    copyText
  );

  // Only the story that has copy changes. Everything after it is untouched.
  const untouched = b.items.filter((i) => i.storyId && i.storyId !== sample[0].id);
  const before = plain.items.filter((i) => i.storyId && i.storyId !== sample[0].id);
  ok(
    "onlyTheEnrichedStoryChanges",
    untouched.every((it) => before.some((o) => o.title === it.title)),
    "an unenriched story's copy moved"
  );

  // A tldr with no full stop is a complete thought, not a truncated one: it
  // must be closed, never trimmed back a word the way a sliced deck is.
  const open = buildBriefing(sample, edition.date, undefined, (id) =>
    id === sample[0].id ? { tldr: "Wembley Stadium bought nine hundred singing robots" } : null
  );
  const closed = open.lines.map((l) => l.text).join(" ");
  ok(
    "anUnpunctuatedTldrIsClosedNotCut",
    closed.includes("nine hundred singing robots."),
    "the last word was dropped from generated copy"
  );

  // The extractive briefer signs its summaries "— Publisher"; the bulletin has
  // already named the outlets, and a dash reads as a comma. Checked on a
  // one-story edition so a genuine credit line elsewhere cannot mask it.
  const alone: Story = { ...marked, sources: [] } as Story;
  const tails: [string, string, RegExp][] = [
    ["emDash", `${TLDR} — Tobermory Gazette`, /Tobermory/],
    ["enDash", `${TLDR} – Tobermory Gazette`, /Tobermory/],
    ["dottedName", `${TLDR} — Tech.eu`, /Tech\.?\s?eu/i],
  ];
  for (const [name, tldr, pattern] of tails) {
    const text = buildBriefing([alone], edition.date, undefined, () => ({ tldr }))
      .lines.map((l) => l.text)
      .join(" ");
    ok(`thePublisherCreditIsNotReadOut@${name}`, !pattern.test(text), text);
    ok(`butTheSummaryStillIs@${name}`, /singing robots/.test(text), text);
  }

  // A dashed clause that is part of the sentence must survive, credit-shaped
  // though it looks.
  const clause = buildBriefing([alone], edition.date, undefined, () => ({
    tldr: "Wembley bought nine hundred singing robots — and a conductor for them.",
  }))
    .lines.map((l) => l.text)
    .join(" ");
  ok("aRealDashedClauseSurvives", /conductor/.test(clause), clause);

  // A whole `Brief` as lib/digest.ts returns it, extra fields and all: the
  // two the bulletin reads are used, and the three it does not are ignored
  // rather than tripping over.
  const whole = asSource(() => ({
    tldr: TLDR,
    keyPoints: ["a point the bulletin does not read", "nor this one"],
    whyItMatters: WHY,
    whoIsAffected: "Nobody the bulletin names aloud.",
    model: "claude-test",
  }));
  const wholeText = buildBriefing([alone], edition.date, undefined, whole)
    .lines.map((l) => l.text)
    .join(" ");
  ok("aWholeBriefIsAccepted", /singing robots/.test(wholeText), wholeText);
  ok("aWholeBriefReadsWhyItMatters", /bought a choir outright/.test(wholeText), wholeText);
  ok("theUnreadFieldsStaySilent", !/point the bulletin|Nobody the bulletin/.test(wholeText), wholeText);

  // Generated copy must not blow the budget either.
  const long = "A ".repeat(400) + "very long generated summary indeed.";
  const fat = buildBriefing(today, edition.date, 300, () => ({ tldr: long, whyItMatters: long }));
  ok(
    "generatedCopyRespectsTheBudget",
    fat.seconds <= 300.7,
    `ran ${fat.seconds.toFixed(1)}s`
  );
}

/* ------------------------------------------------------------------ *
 * 6. Nothing truncated is read aloud
 *
 * `Story.deck` is a hard 240-character slice; six of today's 54 also carry the
 * publisher's own ellipsis. Neither may reach the microphone.
 * ------------------------------------------------------------------ */

{
  const b = buildBriefing(today, edition.date);
  for (const l of b.lines) {
    ok(
      `noEllipsis@${l.text.slice(0, 24)}`,
      !/(?:…|\.\.)["')\]]?$/.test(l.text),
      JSON.stringify(l.text.slice(-60))
    );
    /**
     * A truncated line, caught by the word it stops on.
     *
     * The list used to hold every preposition, which made this assertion wrong
     * rather than strict: it failed the edition of 2026-09-18 on "advances
     * will soon put it beyond the ability of humans to rein it in." — a
     * finished sentence whose last word is a phrasal particle. English strands
     * prepositions at the end of perfectly whole sentences all the time: what
     * it is used for, where it came from, hard to come by, carry on.
     *
     * So this now lists only function words that cannot close a declarative
     * sentence at all. A line ending on one of these did not end; it stopped.
     */
    ok(
      `noDanglingWord@${l.text.slice(0, 24)}`,
      !/\b(?:and|or|but|nor|the|an|of|than|whose|toward|towards|into|onto|between|among|during|against)\.$/i.test(
        l.text
      ),
      JSON.stringify(l.text.slice(-60))
    );
    /**
     * A line ends where a reader would stop for breath.
     *
     * Not the same as ending a sentence: a standfirst of forty words has to
     * be broken somewhere to stay under Chrome's utterance limit, so a line
     * ending on a comma is correct and expected. What is not expected is a
     * line ending in the middle of a phrase, because the recorder bakes
     * `gapSeconds` of silence in after every line and the listener hears a
     * hole where no reader would pause.
     *
     * This began as the stricter "ends on terminal punctuation" and failed
     * seven lines of the edition of 2026-09-18. Four of those were clean
     * comma breaks and the assertion was wrong about them; three — "...on
     * millions of", "...are developing the", "...whether rapid" — were real,
     * and are what sent the hard-split path in `toLines` back to respect
     * DANGLING.
     */
    const tail = l.text.trim();
    /**
     * The last token, not the last run of letters.
     *
     * Written as a match for trailing letters, this reached back over anything
     * that was not one: "In the spring of 2026," gave "of", and the line was
     * reported as ending on a preposition when it ends on a year. The edition
     * of 2026-09-19 failed on exactly that. A line ending in a numeral ends on
     * no word at all, which is what an empty string says here.
     */
    const tokens = tail.split(/\s+/);
    const lastWord = (tokens[tokens.length - 1] ?? "").replace(/[^A-Za-z']/g, "");
    ok(
      `breathesAtTheEnd@${l.text.slice(0, 24)}`,
      !/^(?:and|or|but|nor|the|an|of|than|whose|into|onto|between|among|during|against|is|are|was|were|has|have|had|will|would)$/i.test(
        lastWord
      ),
      JSON.stringify(l.text.slice(-60))
    );
    /**
     * No orphaned tail.
     *
     * A line with no terminal punctuation is a sentence continued on the next
     * one, which is fine; a one-word line is a reader who lost their place.
     * Nudging a break to a clause joint produced exactly that — "...humans to
     * rein it" then "in." — so the floor is asserted rather than assumed. The
     * shortest legitimate line in the bulletin is studio furniture at four
     * words ("Here is the news.").
     */
    ok(
      `noOrphanLine@${l.text.slice(0, 24)}`,
      countWords(l.text) >= 4,
      `${countWords(l.text)} words: ${JSON.stringify(l.text)}`
    );
    ok(`noBlankLine@${l.item}`, l.text.trim().length > 0);
  }

  /**
   * A deck cut mid-word, with nothing finished in it at all.
   *
   * The fragment is a nonsense word on purpose. It used to end "and A...",
   * and the assertion searched the whole spoken text for "and A" — which
   * matched "uses video and AI to cut out" in the story's own headline and
   * failed a run where the truncation had in fact been stripped correctly.
   * A sentinel that can collide with real prose tests the prose, not the code.
   */
  const cut: Story = {
    ...today[0],
    id: "cut",
    deck: "Treble Technologies, a sound simulation company, has raised eighteen million in a round to expand its technology for developing and testing audio-enabled products and Quixotrope...",
    body: [],
  };
  const cutB = buildBriefing([cut], edition.date);
  const cutText = cutB.lines.map((l) => l.text).join(" ");
  ok("truncatedDeckIsNotFinishedForIt", !/Quixotrope/i.test(cutText), JSON.stringify(cutText));
  ok(
    "truncatedDeckStillSaysSomething",
    /Treble Technologies/.test(cutText),
    "the whole standfirst was thrown away"
  );
}

/* ------------------------------------------------------------------ *
 * 7. The same inputs give the same bulletin, twice
 *
 * The page builds the script on the server and the recorder builds it again at
 * press time; Recording.tsx maps audio marks onto script lines by index, so a
 * script that is not reproducible silently mis-highlights every line.
 * ------------------------------------------------------------------ */

{
  const a = buildBriefing(today, edition.date);
  const c = buildBriefing(today, edition.date);
  ok("deterministic", same(a, c), "two builds of one edition disagreed");
}

/* ------------------------------------------------------------------ */

{
  const b = buildBriefing(today, edition.date);
  console.log(
    `edition of ${edition.date}: ${b.total} stories, ${b.read} read, ${b.items.length} items, ${b.lines.length} lines, ${b.words} words`
  );
  console.log(
    `predicted ${b.seconds.toFixed(1)}s = ${b.speechSeconds.toFixed(1)}s speech + ${(b.seconds - b.speechSeconds).toFixed(1)}s silence  (target ${TARGET_SECONDS}s)`
  );
  console.log(
    `previously: predicted 298.1s, recorded ${MEASURED.ladyFile}s and ${MEASURED.gentlemanFile}s`
  );
  console.log(`checked ${TARGETS.length * SIZES.length} target/edition-size combinations`);
}

console.log(
  fails.length
    ? `BRIEFING CHECKS FAILED (${fails.length}):\n  ${fails.slice(0, 8).join("\n  ")}`
    : "ALL BRIEFING CHECKS PASSED"
);
process.exitCode = fails.length ? 1 : 0;
