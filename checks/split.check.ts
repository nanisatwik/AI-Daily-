/**
 * Where a long sentence is broken for the microphone.
 *
 * A standfirst of forty words has to be cut to stay under Chrome's utterance
 * limit, and the recorder bakes `gapSeconds` of silence in after every line —
 * so wherever the cut falls, the listener hears a pause there. An even word
 * count cut "…their AI training on millions / of newspaper articles" and
 * "…are developing the / technology", which is a quarter-second hole in the
 * middle of a phrase.
 *
 * The properties asserted here are the ones that were each broken once while
 * fixing that:
 *
 *   1. no part exceeds the utterance cap          (the original reason to split)
 *   2. no part is an orphan                       (nudging the LAST break left
 *                                                  "…to rein it" then "in.")
 *   3. no part ends on a word the next one needs  (the defect being fixed)
 *   4. a clause joint in reach is preferred       (what makes it read aloud)
 *
 * Driven through `buildBriefing` rather than `toLines`, which is private — so
 * this checks the behaviour the bulletin actually gets.
 */
import { buildBriefing } from "../lib/briefing.ts";

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} — ${d}`); };
const words = (t: string) => (t.match(/\S+/g) ?? []).length;

const MAX_LINE_WORDS = 26;
const MIN_WORDS = 4;
const DANGLING = new Set([
  "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by",
  "from", "as", "the", "a", "an", "its", "this", "that", "which", "who",
  "into", "over", "under", "after", "before", "than", "is", "are", "was",
  "were", "has", "have", "had", "will", "would", "about", "between",
]);
const bare = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");

/** One story carrying `prose` as its standfirst, and nothing else to read. */
function scriptFor(prose: string): string[] {
  const story = {
    id: "probe",
    headline: "A probe of the splitter",
    deck: prose,
    body: [prose],
    section: "research",
    sources: [{ name: "The Wire", url: "https://example.invalid", publishedAt: "2026-09-18T07:00:00.000Z" }],
    publishedAt: "2026-09-18T07:00:00.000Z",
    score: 1,
  };
  return buildBriefing([story] as never, "2026-09-18").lines.map((l) => l.text);
}

/** Only the lines that came from the prose, not the studio furniture. */
const fromProse = (lines: string[], needle: string) =>
  lines.filter((l) => l.includes(needle) || lines.indexOf(l) > 0);

const CASES: { name: string; prose: string; joint?: string }[] = [
  {
    // 33 words, no comma anywhere: the hard-split path with nothing to help it.
    name: "noPunctuation",
    prose:
      "The consortium said the agreement would let researchers across seventeen universities share the same training corpus and the same evaluation harness without negotiating a separate licence for every single institution involved.",
  },
  {
    // The real 2026-09-18 sentence that broke on "of".
    name: "realFairUse",
    prose:
      "OpenAI and its largest financial backer Microsoft have argued in the Manhattan federal court case that their AI training on millions of newspaper articles is protected as fair use because it transforms copyrighted material into new.",
    // "that", not "because". Both open a clause, but the break is only nudged
    // within a few words of the even split — a joint fifteen words away would
    // buy good phrasing with one very long line and one very short, and the
    // imbalance is the more audible fault. This asserts the nearest joint was
    // taken, not the nicest one in the sentence.
    joint: "that",
  },
  {
    // The real one that broke on "the".
    name: "realFigures",
    prose:
      "The figures offer one of the most detailed public windows into how leading companies in the industry are developing the technology amid growing concern that AI could soon reach a point at which it could feed its own development.",
    joint: "amid",
  },
  {
    // The one whose last break stranded "in." on its own line.
    name: "realReinItIn",
    prose:
      "The gathering in Scotland was convened to discuss how AI can benefit society and comes at a pivotal moment for the technology as debate swirls around whether rapid advances will soon put it beyond the ability of humans to rein it in.",
  },
  {
    // Pathological: a long run of function words around the even point, so the
    // search for a clean break has nowhere good to go. Must not hang or orphan.
    name: "functionWordPileup",
    prose:
      "The report was put together on behalf of the members of the board of the of the of the of the association and of the committee of the council of the region of the nation of the union today.",
  },
];

for (const c of CASES) {
  const lines = scriptFor(c.prose);
  const spoken = lines.filter((l) => words(l) > 0);

  for (const [i, line] of spoken.entries()) {
    ok(`${c.name}.underCap[${i}]`, words(line) <= MAX_LINE_WORDS, `${words(line)}w: ${JSON.stringify(line)}`);
    ok(`${c.name}.noOrphan[${i}]`, words(line) >= MIN_WORDS, `${words(line)}w: ${JSON.stringify(line)}`);
  }

  // A line that does not end a sentence is continued by the next one, so the
  // word it ends on has to be able to stand at a pause.
  for (const [i, line] of spoken.entries()) {
    if (/[.?!]["')\]]?$/.test(line.trim())) continue;
    const last = bare((line.trim().match(/([A-Za-z']+)[^A-Za-z']*$/) ?? [])[1] ?? "");
    ok(
      `${c.name}.noHangingWord[${i}]`,
      !DANGLING.has(last),
      `ends on "${last}": ${JSON.stringify(line.slice(-60))}`
    );
  }

  // Where a clause joint was within reach of the even split, the break took it.
  if (c.joint) {
    ok(
      `${c.name}.brokeAtJoint`,
      // Deliberately not a RegExp built from a template literal. Writing
      // "\\b" there is how this assertion first "failed": the shell collapsed
      // it to "\b", which in a template literal is a backspace character, so
      // the pattern matched nothing and accused the splitter of a fault it did
      // not have. A string comparison cannot be mangled on its way to disk.
      spoken.some((l) => {
        const first = l.trim().split(/\s+/)[0] ?? "";
        return bare(first) === c.joint;
      }),
      `no line begins with "${c.joint}": ${JSON.stringify(spoken.map((l) => l.slice(0, 28)))}`
    );
  }
}

console.log(
  fails.length ? `SPLIT CHECKS FAILED (${fails.length}):\n  ${fails.join("\n  ")}` : "ALL SPLIT CHECKS PASSED"
);
process.exitCode = fails.length ? 1 : 0;
