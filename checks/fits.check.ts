/**
 * The guard that stops a recording playing against the wrong script.
 *
 * The player maps marks onto lines by index, so a mismatch does not degrade —
 * it misleads, confidently, at every highlight and every seek. That shipped:
 * the recorder's copy of `toStory` had drifted and a 63-line recording played
 * against a 59-line script on the live site. `recordingFits` is meant to make
 * that state detectable; these are the cases it has to get right.
 */
import { scriptFingerprint } from "../lib/briefing.ts";
import {
  recordingFits,
  type RecordingManifest,
} from "../lib/recording.ts";
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";


/** The repository root, so these run on any machine and on a CI runner. */
const REPO = fileURLToPath(new URL("..", import.meta.url));
const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} — ${d}`); };

const line = (text: string) => ({ text });
const SCRIPT = [line("Here is the news."), line("First, our lead story."), line("That is the briefing.")];
const PRINT = scriptFingerprint(SCRIPT);

const manifest = (
  lines: number,
  script: string | undefined,
  voices = ["lady", "gentleman"]
): RecordingManifest => ({
  date: "2026-09-18",
  edition: 155,
  ...(script === undefined ? {} : { script }),
  voices: Object.fromEntries(
    voices.map((v) => [
      v,
      { file: `/briefing/${v}.mp3`, seconds: 300, marks: Array.from({ length: lines }, (_, i) => ({ at: i, item: 0 })) },
    ])
  ),
});

/* -- the fingerprint itself --------------------------------------------- */
ok("print.stable", scriptFingerprint(SCRIPT) === PRINT, "same script must hash the same twice");
ok(
  "print.text",
  scriptFingerprint([line("Here is the news."), line("First, our lead story."), line("That is the news.")]) !== PRINT,
  "changed wording must change the fingerprint"
);
/**
 * The case the line boundary exists for. These are the same characters in the
 * same order, divided differently — which is precisely what a change to
 * `toLines` produces, and the drift most likely to actually happen.
 */
ok(
  "print.boundaries",
  scriptFingerprint([line("Here is the"), line("news.")]) !==
    scriptFingerprint([line("Here is"), line("the news.")]),
  "the same words split differently must not fingerprint the same"
);
ok("print.order", scriptFingerprint([...SCRIPT].reverse()) !== PRINT, "running order must matter");
ok("print.short", /^[0-9a-f]{8}$/.test(PRINT), `got ${PRINT}`);

/* -- what fits ----------------------------------------------------------- */
ok("fits.exact", recordingFits(manifest(3, PRINT), SCRIPT, PRINT));
ok(
  "fits.noFingerprintButRightLength",
  recordingFits(manifest(3, undefined), SCRIPT, PRINT),
  "a manifest written before the field existed is still a good recording"
);

/* -- what does not ------------------------------------------------------- */
ok(
  "rejects.wrongLineCount",
  !recordingFits(manifest(4, undefined), SCRIPT, PRINT),
  "63 marks against 59 lines is the failure that shipped"
);
ok(
  "rejects.wrongFingerprint",
  !recordingFits(manifest(3, "deadbeef"), SCRIPT, PRINT),
  "same line count, different words — the drift a count cannot see"
);
ok(
  "rejects.oneVoiceOutOfStep",
  !recordingFits(
    {
      ...manifest(3, PRINT),
      voices: {
        ...manifest(3, PRINT).voices,
        gentleman: { file: "/briefing/gentleman.mp3", seconds: 300, marks: [{ at: 0, item: 0 }] },
      },
    },
    SCRIPT,
    PRINT
  ),
  "both takes are of one script, so both must match it"
);
ok("rejects.noVoices", !recordingFits(manifest(3, PRINT, []), SCRIPT, PRINT), "nothing to play is not a fit");

/* -- and the recording actually on disk ---------------------------------- */
{
  const live = JSON.parse(
    readFileSync(`${REPO}public/briefing/manifest.json`, "utf8")
  ) as RecordingManifest;
  const counts = Object.entries(live.voices).map(([v, c]) => `${v}:${c.marks.length}`);
  ok(
    "live.voicesAgree",
    new Set(Object.values(live.voices).map((c) => c.marks.length)).size === 1,
    `the takes disagree on how many lines were read — ${counts.join(" ")}`
  );
  console.log(
    `on disk: edition of ${live.date}, ${counts.join(", ")} marks, ` +
      `script ${live.script ?? "(not recorded — written by the next press run)"}`
  );
}

console.log(fails.length ? `FITS CHECKS FAILED (${fails.length}):\n  ${fails.join("\n  ")}` : "ALL FITS CHECKS PASSED");
process.exitCode = fails.length ? 1 : 0;
