import type { Story } from "./digest";

/**
 * The five-minute briefing — blueprint Phase 4.
 *
 * This builds a running order, not a list of headlines: an opening that says
 * what paper this is and what day it is, a lead story given room, the rest of
 * the morning grouped by desk with the corroboration read out, a quick
 * rundown of what there was no time for, and a close.
 *
 * Nothing here is spoken by a paid service. By default every word is a word a
 * publisher filed or a line of studio furniture written by hand, and the voice
 * reading it runs either on the reader's own machine — see
 * components/Briefing.tsx — or on the press, once a day, from weights that
 * cost nothing to use.
 *
 * A caller may pass generated copy, and then some of those words are a model's
 * rather than a publisher's: see `BriefSource` below. The blueprint's rule is
 * that anything a model wrote is rendered with a visible label, always, so a
 * page that turns this on owes its readers a different line of small print
 * from the one that currently says nothing is generated.
 *
 * The module is deliberately pure — no browser APIs, no edition read at module
 * scope — so the same script can be built three times over and come out
 * identical: on the server, where the running order goes into the first HTML
 * the reader receives, in the browser, and in the press job that records it.
 * It has to be identical, because the recorded player maps audio marks onto
 * script lines by index.
 */

/* ------------------------------------------------------------------ *
 * How long a script takes to read
 * ------------------------------------------------------------------ */

/**
 * What a recorded bulletin actually sounds like, in numbers.
 *
 * This is the one place the pacing lives. services/ai/voice.ts imports the two
 * gaps from here rather than declaring its own, because the two have to agree:
 * the sizer decides how much script fits into five minutes and the recorder
 * decides how long the file is, and when they disagree the paper bills a
 * bulletin as something it is not. It did. The edition of 2026-09-17 was sized
 * at 298 seconds and came out at 5:59 in the lady's voice and 6:40 in the
 * gentleman's.
 *
 * The figures are measured rather than conventional. The recording manifest
 * stores the exact sample offset of every spoken line, so subtracting the
 * silence the recorder inserted from the distance between two marks gives what
 * a line's audio really cost. On that edition — 63 lines, 690 words —
 * `af_heart` produced 335.3 seconds of speech. Fitted against word counts that
 * is 138 words a minute plus 0.56 seconds a line, because Kokoro pads every
 * clip it generates with a little quiet at each end: at sixty-odd lines that
 * padding alone is over half a minute, and it is most of what the old estimate
 * was missing. The broadcast convention of 150 words a minute, which is what
 * this file used to assume, predicted 276 seconds for that same take.
 *
 * The fixed per-line term earns its second parameter. Held out across line
 * lengths — fitted on lines under eight words, tested on the rest — a flat
 * words-a-minute rate was 22% out where rate-plus-fixed was 13%, and the sign
 * of the error flips with the line mix, which is exactly the failure that
 * matters when an edition is short enough to be mostly studio furniture.
 *
 * WHY THESE ARE NOT THE NUMBERS THAT TAKE FITS BEST
 *
 * They were, once: 138 words a minute plus 0.56s a line reproduces the take of
 * 2026-09-17 to a tenth of a second, because it was fitted on that take and on
 * nothing else. Two mornings later it over-predicted by 6.5% — 272.6s against
 * a measured 255.9 — and the bulletin was billed at five minutes while running
 * 4:37. Under-running is the safe direction, which is why it went unnoticed;
 * it was still wrong.
 *
 * The two takes disagree about the voice itself. `af_heart` at speed 1 read
 * 123.5 words a minute on 2026-09-17 and 133.4 on 2026-09-19 — the same voice
 * and the same settings, on scripts of 11.0 and 12.6 words a line. That is the
 * per-line term showing up in the aggregate: shorter lines pay the fixed cost
 * more often per word, so they read slower.
 *
 * Which is directionally right and numerically useless, because two aggregate
 * measurements cannot pin two parameters. Solving them exactly gives 280 words
 * a minute and 2.98 seconds a line — a perfect fit to both, and nonsense. A
 * grid search walks straight to it, which is the tell.
 *
 * So the per-line term is taken from the one place it is well conditioned: a
 * regression inside a single edition, over every line in it. That gave 0.56 on
 * the 63-line take and 0.799 on the 45-line one (r2 0.909, 45 points), and
 * 0.68 is the middle of those. With it fixed, one parameter is left, and two
 * measurements can fit one parameter honestly: 147 words a minute puts the
 * error at -3.2% on the older take and +2.7% on the newer, which is as
 * symmetric as two points allow and inside the tolerance the recorder warns
 * at.
 *
 * Expect this to drift again. It is fitted on two mornings of one voice, and
 * the honest reading is that a third would move it. services/ai/voice.ts warns
 * at 4% for exactly this reason — the warning fired and nobody was reading the
 * press log, which is the part of this that actually needs fixing.
 *
 * Calibrated against `af_heart` at speed 1. The recorder brings its other
 * voices onto this pace instead of letting each one decide the length of the
 * bulletin; see the VOICES table in services/ai/voice.ts.
 *
 * lib/voices.ts carries the same two gaps as `DELIVERY.gapMs` and
 * `itemGapMs`, for the browser fallback player. They cannot be shared: this
 * module is imported both by the Next bundle and by a plain `node` process,
 * and no single import specifier satisfies both — Node needs the `.ts`
 * extension and the app's tsconfig refuses it. The numbers agree; if one is
 * changed the other must be.
 */
export const PACE = {
  wordsPerMinute: 147,
  /** Leading and trailing quiet inside one generated clip. */
  perLineSeconds: 0.68,
  /** A breath between sentences. */
  gapSeconds: 0.26,
  /** A longer settling pause where the running order moves to a new item. */
  itemGapSeconds: 0.62,
} as const;

/**
 * Five minutes, as the blueprint asks — and five minutes of finished
 * recording, silence included, rather than five minutes of words with the
 * pauses billed to nobody.
 */
export const TARGET_SECONDS = 300;

/**
 * The longest a single utterance is allowed to be, in words.
 *
 * Chrome stops speaking silently after roughly fifteen seconds of one
 * utterance, taking the rest of the sentence with it and — worse — never
 * firing `onend`, which strands the whole queue. 26 words is about ten
 * seconds at rate 1 and still under fifteen at the slowest rate the panel
 * offers, so no line can reach the cliff. It also means skip lands on a
 * clause boundary rather than mid-thought.
 */
const MAX_LINE_WORDS = 26;

/**
 * How short a hard-split part may get while avoiding a mid-phrase break.
 *
 * `bestBreak` searches a window around the even split for a better place to
 * cut, and this is how far into a part that search may reach. Without a floor
 * a long run of function words — "on behalf of the members of the board of
 * the" — would let the break slide until one part was a fragment. Below it the
 * search gives up and takes the clumsy cut, on the grounds that a breath in an
 * odd place is a smaller fault than an utterance of two words.
 */
const MIN_SPLIT_WORDS = 6;

/**
 * Share of the bulletin kept back for the closing rundown.
 *
 * A briefing that spends its whole budget on full items ends by simply
 * stopping. Reserving the last stretch for headlines-only means the reader
 * hears what else was on the wire, and it is the block that gets trimmed
 * first when the arithmetic overruns.
 */
const RUNDOWN_SHARE = 0.18;

/** Stories given a second paragraph of their own, in editorial order. */
const DEPTH_ITEMS = 3;

/**
 * Utterances any one story may spend on its summary.
 *
 * A 240-character deck is two or three lines, so this never bites on today's
 * wire. It is here because the selector prices the lead before it knows
 * whether it fits and then keeps it regardless — without a ceiling, one
 * unusually long standfirst would be read out in full and the bulletin would
 * be over before the second story. It caps generated copy for the same
 * reason: a model asked for one sentence may still return five.
 */
const MAX_DECK_LINES = 4;

const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

const upperFirst = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const quantity = (n: number, one: string, many: string) =>
  `${spellNumber(n)} ${n === 1 ? one : many}`;

/** Seconds of audio one line becomes, silence excluded. */
const clipSeconds = (text: string) =>
  (countWords(text) / PACE.wordsPerMinute) * 60 + PACE.perLineSeconds;

/**
 * What one entry of the running order costs the bulletin, silence included.
 *
 * Every entry is followed by the longer settling pause, so that is charged
 * here rather than left for the final total to discover. It overcharges the
 * bulletin by exactly one item gap, since the last entry is followed by
 * nothing — 0.62s of head room, and the right direction to be wrong in.
 */
const draftSeconds = (lines: string[]) =>
  lines.length === 0
    ? 0
    : lines.reduce((n, l) => n + clipSeconds(l), 0) +
      (lines.length - 1) * PACE.gapSeconds +
      PACE.itemGapSeconds;

/* ------------------------------------------------------------------ *
 * Numbers and dates, spelled for a voice
 * ------------------------------------------------------------------ */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety",
];

/**
 * Digits left in the script are read by whatever rules the local voice
 * happens to carry, and they disagree: "54" has come out as "five four" and
 * "1925" as "one thousand nine hundred and twenty-five". Anything the script
 * itself writes is therefore spelled out. Publisher copy is left alone —
 * that is their text, and rewriting figures inside it would be editing
 * reporting rather than reading it.
 */
export function spellNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  const whole = Math.round(n);
  if (whole < 20) return ONES[whole];
  if (whole < 100) {
    const unit = whole % 10;
    return unit === 0
      ? TENS[Math.floor(whole / 10)]
      : `${TENS[Math.floor(whole / 10)]}-${ONES[unit]}`;
  }
  return String(whole);
}

const ORDINALS = [
  "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
  "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
  "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
  "nineteenth", "twentieth",
];

function spellOrdinal(day: number): string {
  if (day >= 1 && day <= 20) return ORDINALS[day];
  if (day === 30) return "thirtieth";
  const unit = day % 10;
  const tens = Math.floor(day / 10);
  if (unit === 0) return "twentieth";
  return `${TENS[tens]}-${ORDINALS[unit]}`;
}

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday",
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
];

/**
 * "2026-09-16" spoken as "Wednesday the sixteenth of September".
 *
 * Built from the date string with integer arithmetic and `Date.UTC`, never
 * from `toLocaleDateString`. The script is assembled on the server and again
 * in the browser, and those two run in different time zones and different
 * ICU builds — a locale formatter would produce two different opening lines
 * and React would throw the server's HTML away. The year is left off because
 * it is the one part of the date a reader already knows.
 */
export function spokenDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} the ${spellOrdinal(d)} of ${MONTHS[m - 1]}`;
}

/** Seconds as a clock, for the panel's own labels. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Publisher copy, made speakable
 * ------------------------------------------------------------------ */

/**
 * Feed labels observed prefixing a standfirst in this wire.
 *
 * Listed rather than matched by shape: a general `/^[A-Z][a-z]+:\s/` rule
 * also eats "Anthropic: …" and "Google: …", which is the subject of the
 * story being thrown away.
 */
const FEED_LABELS = /^(Tool|Paper|Video|Link|Quote|Note|Sponsor|Podcast):\s+/;

const SCALES: Record<string, string> = {
  k: "thousand", m: "million", b: "billion", t: "trillion",
};

/**
 * Strip what a feed wrote for somebody looking at a web page, and rewrite the
 * symbols a voice cannot pronounce.
 *
 * "The article … appeared first on The Decoder" is a link back to the
 * publisher, not a sentence; read aloud it is gibberish. "$53M" comes out as
 * "dollar fifty-three em". Neither is a licence to change what was reported:
 * every rule here either removes publisher furniture or expands a symbol into
 * the words it already stands for.
 */
function speakable(text: string): string {
  return text
    .replace(
      /\s*\bthe (?:post|article)\b[^.!?]*?\bappeared first on\b[^.!?]*[.!?]?/gi,
      " "
    )
    .replace(/\s*\bthis (?:article|post) is brought to you by\b[^.!?]*[.!?]?/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\[(?:…|\.\.\.)\]/g, " ")
    .replace(FEED_LABELS, "")
    // Money, largest form first: "$20million" must not fall through to the
    // bare-figure rule and come out as "20 dollars million".
    .replace(
      /([$€£])\s?([\d.,]+)\s*(thousand|million|billion|trillion|[kmbt])\b/gi,
      (_m, symbol: string, figure: string, scale: string) =>
        `${figure} ${SCALES[scale.toLowerCase()] ?? scale.toLowerCase()} ${currency(symbol)}`
    )
    .replace(
      /([$€£])\s?([\d.,]+)/g,
      (_m, symbol: string, figure: string) => `${figure} ${currency(symbol)}`
    )
    .replace(/(\d)\s*%/g, "$1 percent")
    .replace(/\s*&\s*/g, " and ")
    // Dashes have no sound of their own and a voice runs straight through
    // them; a comma buys back the pause the punctuation stood for. The spaced
    // hyphen is in here because feeds use it as a dash — "released X today -
    // two new models" appears three times in a single edition.
    .replace(/\s*[–—]+\s*/g, ", ")
    .replace(/\s+-+\s+/g, ", ")
    // The only slash in this wire's publisher list is a subreddit, and
    // "r slash MachineLearning" is not how anyone says it aloud.
    .replace(/\br\/(\w+)/g, "the $1 subreddit")
    .replace(/(\w)\/(\w)/g, "$1 slash $2")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*\.\s*\./g, ".")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const currency = (symbol: string) =>
  symbol === "€" ? "euros" : symbol === "£" ? "pounds" : "dollars";

const TERMINATED = /[.!?]["')\]]?$/;

/**
 * An ellipsis is a publisher saying "there is more", not a full stop.
 *
 * Six of today's fifty-four standfirsts end in one, and `speakable` collapses
 * "..." to ".." on its way past, which TERMINATED then happily accepts — so
 * "…testing audio-enabled products and A.." was reaching the microphone as
 * though it were a finished sentence. Both spellings are refused here.
 */
const TRUNCATED = /(?:…|\.\.)["')\]]?$/;

/**
 * Words a sentence cannot end on.
 *
 * Cutting an unfinished standfirst back by its last token leaves whatever
 * preceded the fragment, and on a 240-character slice that is very often a
 * conjunction or a preposition: "…testing audio-enabled products and." The
 * reader hears an unfinished thought, which is the thing the trimming was
 * supposed to prevent.
 */
const DANGLING = new Set([
  "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by",
  "from", "as", "the", "a", "an", "its", "this", "that", "which", "who",
  "into", "over", "under", "after", "before", "than", "is", "are", "was",
  "were", "has", "have", "had", "will", "would", "about", "between",
]);

const bareWord = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Words that open a clause, and so make a good place to break just before.
 *
 * A sentence too long for one utterance has to be cut somewhere, and an even
 * word count cuts wherever it happens to land — "...on millions / of newspaper
 * articles", straight through a noun phrase. A reader breaking the same
 * sentence aloud would stop at the joint: before the "that", before the "and".
 * These are those joints, as far as a word list can find them without parsing
 * the sentence.
 */
const CLAUSE_OPENERS = new Set([
  "that", "which", "who", "whose", "whom", "because", "while", "after",
  "before", "although", "though", "when", "where", "since", "unless",
  "until", "whether", "if", "and", "but", "or", "so", "yet", "despite",
  "including", "according", "amid", "as",
]);

/**
 * Where to break a run of words that has no punctuation to break on.
 *
 * `target` is the even-split point, which keeps the parts the same length and
 * is what this used to use unconditionally. The window around it is searched
 * for somewhere better, nearest first, because a break two words from even
 * that lands on a clause joint reads far better than an even one mid-phrase,
 * and nobody can hear two words of imbalance.
 *
 * Preference order: immediately before a clause opener; failing that, anywhere
 * that does not leave a function word hanging at the end; failing both, the
 * even point, on the grounds that a clumsy breath beats an orphaned tail.
 */
function bestBreak(words: string[], from: number, target: number, left: number): number {
  const WINDOW = 5;
  const lowest = Math.max(MIN_SPLIT_WORDS, target - WINDOW);
  const highest = Math.min(left - MIN_SPLIT_WORDS, MAX_LINE_WORDS, target + WINDOW);

  const candidates: number[] = [];
  for (let take = lowest; take <= highest; take++) candidates.push(take);
  candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));

  const opener = candidates.find((take) =>
    CLAUSE_OPENERS.has(bareWord(words[from + take]))
  );
  if (opener !== undefined) return opener;

  const clean = candidates.find(
    (take) => !DANGLING.has(bareWord(words[from + take - 1]))
  );
  return clean ?? target;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["'(“]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Keep only sentences that actually finished.
 *
 * `Story.deck` is a hard 240-character slice of the standfirst, and on a
 * typical edition about half of them land mid-word: "…the update also adds
 * Claude Docs and Cla". The eye forgives that on paper. A voice says "Cla"
 * and the item ends in a stammer, so the spoken copy stops at the last full
 * stop instead.
 *
 * When there is no full stop at all — a single unfinished sentence — the tail
 * is cut back to a word boundary with its last token dropped, because that
 * token is the one most likely to be a fragment, and then back again past any
 * word a sentence cannot end on.
 */
function wholeSentences(text: string): string[] {
  const all = splitSentences(text);
  const finished = all.filter((s) => TERMINATED.test(s) && !TRUNCATED.test(s));
  if (finished.length > 0) return finished;
  if (all.length === 0) return [];

  const words = all[0].split(/\s+/);
  if (words.length < 6) return [];
  const kept = words.slice(0, words.length - 1);
  while (kept.length > 0 && DANGLING.has(bareWord(kept[kept.length - 1]))) kept.pop();
  // Below five words there is no longer a sentence left to salvage, only the
  // opening of one, and silence is better than a stub.
  if (kept.length < 5) return [];
  return [`${kept.join(" ").replace(/[\s.,;:—–-]+$/, "")}.`];
}

/**
 * Break a sentence that would outlast Chrome's utterance limit.
 *
 * Splitting on sentences alone is not enough: wire standfirsts routinely run
 * to forty words in one sentence, which is sixteen seconds and past the
 * cliff. Clause punctuation is tried first so the break falls where a reader
 * would draw breath, and a hard word count is the backstop for the sentence
 * that contains no commas at all.
 */
function toLines(sentence: string): string[] {
  if (countWords(sentence) <= MAX_LINE_WORDS) return [sentence];

  const out: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = "";
  };

  for (const clause of sentence.split(/(?<=[,;:])\s+/)) {
    if (countWords(clause) > MAX_LINE_WORDS) {
      flush();
      const words = clause.split(/\s+/);
      /**
       * Split into equal parts rather than filling greedily to the cap. Greedy
       * filling left a 28-word clause as 26 words and then "GPT-Live family."
       * on its own, and a two-word utterance after a full breath sounds like
       * the reader lost their place. Two fourteens do not.
       *
       * The break is then nudged to the nearest clause joint — see
       * `bestBreak`. Counting words alone put seven breaks mid-phrase in the
       * edition of 2026-09-18 — "...their AI training on millions of",
       * "...companies in the industry are developing the" — and because the
       * recorder bakes `gapSeconds` of silence in after every line, each one
       * is an audible quarter-second hole where no reader would breathe.
       *
       * A word list finds clause joints and not every bad break: "whether
       * rapid / advances will..." still splits an adjective from its noun,
       * which needs a parser to see.
       */
      let i = 0;
      while (i < words.length) {
        const left = words.length - i;
        // Recomputed each time so that moving one boundary does not leave the
        // tail lopsided, and no part can exceed the cap.
        const parts = Math.max(1, Math.ceil(left / MAX_LINE_WORDS));
        const target = Math.min(left, Math.ceil(left / parts));
        /**
         * The last part is never nudged. There is no following phrase for a
         * word to belong to, so there is no mid-phrase break to avoid — and
         * moving it only strands a tail. Nudging it turned "...humans to rein
         * it in." into "...humans to rein it" and then "in." on its own,
         * which is the orphan this split was written to prevent.
         */
        const take = target < left ? bestBreak(words, i, target, left) : target;
        out.push(words.slice(i, i + take).join(" "));
        i += take;
      }
      continue;
    }
    if (countWords(buffer) + countWords(clause) > MAX_LINE_WORDS) flush();
    buffer = buffer ? `${buffer} ${clause}` : clause;
  }
  flush();

  return out.length > 0 ? out : [sentence];
}

const spokenProse = (text: string) => wholeSentences(speakable(text)).flatMap(toLines);

/* ------------------------------------------------------------------ *
 * Generated copy, where the editor has produced any
 * ------------------------------------------------------------------ */

/**
 * The part of lib/digest.ts's `Brief` that a bulletin can read out.
 *
 * Declared here as a structural subset rather than imported, because
 * lib/digest.ts reads the edition at module scope through a bundler alias and
 * the recorder runs under plain `node`, where that alias does not exist. A
 * `Brief` satisfies this shape, so a caller hands `getBrief` straight over.
 */
export type SpokenBrief = {
  tldr?: string | null;
  whyItMatters?: string | null;
};

/**
 * Where generated copy comes from, if it exists at all.
 *
 * Injected rather than read, for the same reason — and because this module is
 * also in the client bundle, where pulling the edition in at module scope
 * would ship the whole day's news to every reader of the briefing page.
 *
 * Absent in any of its forms — no function, no entry for this story, null
 * fields, blank strings, a lookup that throws — the bulletin is word for word
 * the one it has always been. An edition that never went through the editor,
 * because nobody supplied a key, has to sound exactly as good as one that was
 * never offered the choice.
 */
export type BriefSource = (storyId: string) => SpokenBrief | null | undefined;

/**
 * A publisher credit signed onto the end of a generated summary.
 *
 * The extractive briefer writes "… — TechCrunch", and a bulletin that has just
 * said "Reported by two outlets, Tech.eu and TechCrunch" does not need to say
 * it again. Read aloud it is worse than redundant: `speakable` turns the dash
 * into a comma, so the sentence ends on a publisher's name for no reason. Only
 * a short, capitalised, unpunctuated tail is taken, so a summary that genuinely
 * ends in a dashed clause survives.
 */
const CREDIT_TAIL = /\s+[—–]\s+[A-Z0-9][^—–!?]{0,40}[^\s.!?]$/;

/**
 * Model-written copy, made speakable.
 *
 * Deliberately not `spokenProse`. That exists to defend against `Story.deck`
 * being a 240-character slice, and it throws away anything that does not end
 * in a full stop. A generated summary is a whole thought that simply may not
 * have been punctuated — "Treble's platform is used by voice AI developers" is
 * one of today's — and cutting its last word off would be inventing a
 * truncation that is not there. So this closes the sentence rather than
 * trimming it.
 */
function generatedProse(text: string | null | undefined): string[] {
  if (typeof text !== "string") return [];
  const clean = speakable(text.replace(CREDIT_TAIL, ""));
  if (!clean) return [];

  const sentences = splitSentences(clean);
  if (sentences.length === 0) return [];

  const last = sentences.length - 1;
  if (!TERMINATED.test(sentences[last]) || TRUNCATED.test(sentences[last])) {
    sentences[last] = `${sentences[last].replace(/[\s.,;:—–-]+$/, "")}.`;
  }

  return sentences.filter((s) => /[a-z0-9]/i.test(s)).flatMap(toLines);
}

/** A headline is a fragment; a voice needs it closed to land the cadence. */
function spokenHeadline(headline: string): string {
  const clean = speakable(headline).replace(/[\s:;,-]+$/, "");
  return TERMINATED.test(clean) ? clean : `${clean}.`;
}

/**
 * "AI Policy" is a page furniture label. Spoken, a paper has desks.
 */
export function deskName(section: string): string {
  return `the ${section.replace(/^AI\s+/i, "").toLowerCase()} desk`;
}

/**
 * Outlets behind a story, one entry per name.
 *
 * `Story.sources` is already one credit per feed, but a publisher can file
 * through more than one: "IEEE Spectrum" reaches this wire as both
 * `ieee-spectrum` and `ieee-computing`, and on today's edition two clusters
 * would have the bulletin announce "reported by two outlets, IEEE Spectrum
 * and IEEE Spectrum". That is the overstatement digest.ts already refuses
 * when it collapses two reports from one outlet into one credit — a name the
 * reader hears twice is one outlet, not two. Deduplicating here rather than
 * only in the sentence keeps the spoken tally and the printed tally marks
 * telling the same story.
 */
function outlets(story: Story): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const source of story.sources) {
    const name = speakable(source.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

/**
 * The corroboration, read out.
 *
 * Naming a few of the outlets is the spoken equivalent of the tally marks
 * beside a headline: with no page in front of them, it is the reader's only
 * way to weigh how well attested a claim is.
 */
function spokenSources(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `A single report, from ${names[0]}.`;
  if (names.length === 2) {
    return `Reported by two outlets, ${names[0]} and ${names[1]}.`;
  }
  const [a, b, c] = names;
  return `Reported by ${spellNumber(names.length)} outlets, among them ${a}, ${b} and ${c}.`;
}

/**
 * A publisher paragraph that says something the deck did not.
 *
 * `Story.body` and `Story.deck` are drawn from the same pool of standfirsts,
 * so the longest body paragraph is very often the deck again — reading both
 * would have the bulletin repeat itself word for word on its biggest story.
 * Overlap on content words is the same test the extractive briefer uses to
 * keep its key points distinct.
 */
function extraParagraph(story: Story): string | null {
  const deckWords = new Set(contentWords(story.deck));
  if (deckWords.size === 0) return story.body[0] ?? null;

  for (const para of story.body) {
    const mine = new Set(contentWords(para));
    if (mine.size === 0) continue;
    let shared = 0;
    for (const w of mine) if (deckWords.has(w)) shared++;
    if (shared / Math.min(mine.size, deckWords.size) <= 0.5) return para;
  }
  return null;
}

const SMALL_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "it",
  "its", "this", "that", "has", "have", "had", "will", "would", "can",
  "could", "may", "said", "says", "also", "more", "than", "which", "who",
]);

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SMALL_WORDS.has(w));
}

/* ------------------------------------------------------------------ *
 * The running order
 * ------------------------------------------------------------------ */

export type ItemKind = "open" | "lead" | "story" | "rundown" | "close";

export type BriefingItem = {
  kind: ItemKind;
  /** What the running order prints for this entry. */
  title: string;
  /** Filed-to desk, or null for studio furniture. */
  section: string | null;
  /** Independent outlets behind it, for the tally marks. */
  sources: number;
  /** Set on story entries, so the running order can link to the column. */
  storyId: string | null;
  /**
   * Non-null on the first entry of a new desk, so the running order can head
   * the group the way a page carries a section banner.
   */
  desk: string | null;
  /** Half-open range of `Briefing.lines` this entry speaks. */
  from: number;
  to: number;
  /** Predicted running time of this entry, its pauses included. */
  seconds: number;
};

export type BriefingLine = {
  text: string;
  /** Index into `Briefing.items`. */
  item: number;
  /**
   * This line's audio plus the pause that follows it, so that the per-line,
   * per-item and whole-bulletin totals are all the same arithmetic.
   */
  seconds: number;
};

export type Briefing = {
  items: BriefingItem[];
  lines: BriefingLine[];
  /** Predicted length of the finished recording, silence included. */
  seconds: number;
  /**
   * The same bulletin with the silence taken back out.
   *
   * Kept separate because a player that offers a speed control needs both: at
   * 1.5× the words take two thirds as long and the breaths take exactly as
   * long as they always did, so neither number alone can say how long the
   * bulletin will run.
   */
  speechSeconds: number;
  words: number;
  /** Stories that made the bulletin. */
  read: number;
  /** Stories in the edition, so the close can be honest about the rest. */
  total: number;
};

/**
 * A short fingerprint of a script, so a recording can prove it is of this one.
 *
 * The recorded player maps audio marks onto script lines by index, which is
 * only meaningful if the script the press recorded and the script the page
 * built are the same script. They were not once: the recorder carried its own
 * copy of `toStory` that had drifted from lib/digest.ts, and a 63-line
 * recording played against a 59-line script on the live site — every
 * highlight, every seek and the whole running order pointing at the wrong
 * sentence. The copy was fixed, but "keep these two in step by hand" is the
 * kind of invariant that holds until it doesn't, so this makes a mismatch
 * detectable instead of merely regrettable.
 *
 * FNV-1a, and deliberately not `crypto`: this has to produce the same digits
 * in the press's plain `node` process, in the Next server render and in the
 * browser, and a 32-bit integer hash is the same arithmetic everywhere.
 * Collisions do not matter here — this is not guarding against a forgery, only
 * against two scripts that were meant to be identical and are not.
 *
 * The line boundary is folded in as well. Without it the same words divided
 * differently — which is exactly what a change to `toLines` produces — would
 * fingerprint the same, and that is the drift most likely to happen.
 */
export function scriptFingerprint(lines: { text: string }[]): string {
  let hash = 0x811c9dc5;
  const feed = (code: number) => {
    hash ^= code;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const line of lines) {
    for (let i = 0; i < line.text.length; i++) feed(line.text.charCodeAt(i));
    feed(10);
  }
  return hash.toString(16).padStart(8, "0");
}

type Draft = Omit<BriefingItem, "from" | "to" | "seconds"> & { lines: string[] };

/**
 * Opening and closing furniture.
 *
 * Built twice: once with a provisional story count to price it, and again
 * once selection has settled on the real one. The alternative is circular —
 * the budget for stories depends on what the furniture costs, and what the
 * furniture says depends on how many stories fit. Two passes is cheaper than
 * iterating, and the word count barely moves between them because the
 * difference is one spelled-out numeral.
 */
function furniture(
  date: string,
  read: number,
  total: number,
  seconds: number
): { open: string[]; close: string[] } {
  const day = spokenDate(date);
  const left = Math.max(total - read, 0);
  const minutes = Math.max(1, Math.round(seconds / 60));

  return {
    open: [
      day ? `The AI Daily, ${day}.` : "The AI Daily.",
      total === 0 ? "The wire is quiet." : "Here is the news.",
      // Sentence-cased because a spelled-out numeral opens the line and the
      // panel prints every word it speaks; "fifty-four stories came over the
      // wire" sounds right and looks like a typesetting mistake.
      total === 0
        ? "Nothing has reached us yet this morning."
        : upperFirst(
            `${quantity(total, "story", "stories")} came over the wire. This briefing carries ${spellNumber(read)} of them, and runs about ${quantity(minutes, "minute", "minutes")}.`
          ),
    ],
    close: [
      "That is the briefing.",
      left > 0
        ? upperFirst(
            `${spellNumber(left)} more ${left === 1 ? "story is" : "stories are"} waiting in today's edition, every one of them with its sources named.`
          )
        : total === 0
          ? "Come back when the presses have run."
          : "The whole of today's edition is on the page in front of you, every story with its sources named.",
      "This has been the wireless bulletin of The AI Daily.",
    ],
  };
}

function storyDraft(
  story: Story,
  kind: "lead" | "story",
  desk: string | null,
  withDepth: boolean,
  brief: SpokenBrief | null
): Draft {
  const lines: string[] = [];
  if (desk) lines.push(`From ${desk}.`);
  if (kind === "lead") lines.push("First, our lead story.");

  lines.push(spokenHeadline(story.headline));

  const named = outlets(story);
  const credit = spokenSources(named);
  if (credit) lines.push(credit);

  /**
   * A written summary in preference to the publisher's standfirst.
   *
   * The standfirst is a 240-character slice of whatever the feed put in its
   * description field, which on this wire means a first-person blog paragraph,
   * an arXiv abstract filed against the wrong cluster, or a sentence stopped
   * mid-word. A generated `tldr` is one sentence about the story. Where one
   * exists it is simply the better copy to read out; where it does not, this
   * is the line the bulletin has always spoken.
   */
  const summary = generatedProse(brief?.tldr);
  lines.push(
    ...(summary.length > 0 ? summary : spokenProse(story.deck)).slice(0, MAX_DECK_LINES)
  );

  if (withDepth) {
    // One paragraph, not the whole column: the point of a briefing is that it
    // ends. The full body is a click away on the story page.
    //
    // "Why it matters" is what a second paragraph is reaching for anyway, and
    // it says it in a sentence rather than in the second-longest standfirst
    // some publisher happened to file.
    const why = generatedProse(brief?.whyItMatters);
    if (why.length > 0) {
      lines.push(...why.slice(0, 2));
    } else {
      const extra = extraParagraph(story);
      if (extra) lines.push(...spokenProse(extra).slice(0, 2));
    }
  }

  return {
    kind,
    title: story.headline,
    section: story.section,
    sources: named.length,
    storyId: story.id,
    desk,
    lines,
  };
}

/**
 * Build the bulletin.
 *
 * The story count is never stated: it falls out of the budget. Furniture is
 * priced first, the remainder is split between full items and the closing
 * rundown, and stories are taken in editorial order for as long as the next
 * one still fits. On a typical edition of this paper — decks averaging a
 * little over forty spoken words — that lands at a dozen or so full items and
 * a handful of headlines, which is about what a five-minute bulletin has
 * always carried.
 *
 * Selection happens in score order and grouping happens afterwards, in that
 * order for a reason: grouping first and then filling would let the fourth
 * story on the largest desk beat the best story on a smaller one.
 *
 * `targetSeconds` is the length of the finished recording, pauses and all.
 * The budget is spent in that currency throughout, which is the whole of the
 * fix for a bulletin that was billed at five minutes and ran six.
 */
export function buildBriefing(
  stories: Story[],
  date: string,
  targetSeconds: number = TARGET_SECONDS,
  briefs?: BriefSource
): Briefing {
  const total = stories.length;

  /**
   * Generated copy for a story, if the editor has run and the caller passed a
   * way to reach it.
   *
   * Wrapped rather than called directly: the editor is a separate job that may
   * be half-written or half-run, and a lookup that throws should cost one
   * story its better copy, not take the bulletin off air. The briefing is the
   * last thing on the page that ought to be fragile.
   */
  const briefFor = (id: string): SpokenBrief | null => {
    if (!briefs) return null;
    try {
      return briefs(id) ?? null;
    } catch {
      return null;
    }
  };

  if (total === 0) {
    const bare = furniture(date, 0, 0, 0);
    return assemble([
      { kind: "open", title: "Opening", section: null, sources: 0, storyId: null, desk: null, lines: bare.open },
      { kind: "close", title: "Close", section: null, sources: 0, storyId: null, desk: null, lines: bare.close },
    ], 0, 0);
  }

  const priced = furniture(date, total, total, targetSeconds);
  const budget =
    targetSeconds - draftSeconds(priced.open) - draftSeconds(priced.close);

  const fullBudget = budget * (1 - RUNDOWN_SHARE);

  // Pass one: how many stories can be read properly. The lead is always in,
  // even on the freak edition whose lead alone overruns the budget — a
  // briefing with no stories in it is not a briefing.
  const chosen: { story: Story; depth: boolean }[] = [];
  const desksSeen = new Set<string>();
  let spent = 0;

  for (const story of stories) {
    const depth = chosen.length < DEPTH_ITEMS;
    const draft = storyDraft(
      story,
      chosen.length === 0 ? "lead" : "story",
      // Priced as though it opens a desk when the desk is new, so the
      // announcements cannot quietly push the bulletin over its target.
      desksSeen.has(story.section) ? null : deskName(story.section),
      depth,
      briefFor(story.id)
    );
    const cost = draftSeconds(draft.lines);
    if (chosen.length > 0 && spent + cost > fullBudget) break;
    chosen.push({ story, depth });
    desksSeen.add(story.section);
    spent += cost;
  }

  // Pass two: headlines only, filling whatever the full items left.
  const rundown: Story[] = [];
  for (const story of stories.slice(chosen.length)) {
    const cost = draftSeconds([spokenHeadline(story.headline)]);
    if (spent + cost > budget) break;
    rundown.push(story);
    spent += cost;
  }

  /* ----- now lay the selection out as a bulletin ----- */

  const [lead, ...rest] = chosen;

  // Desks ordered by their best story, so the bulletin still moves from the
  // most important desk to the least even though it reads them in blocks.
  const byDesk = new Map<string, { story: Story; depth: boolean }[]>();
  for (const pick of rest) {
    const list = byDesk.get(pick.story.section) ?? [];
    list.push(pick);
    byDesk.set(pick.story.section, list);
  }

  const drafts: Draft[] = [];

  drafts.push(
    storyDraft(
      lead.story,
      "lead",
      deskName(lead.story.section),
      lead.depth,
      briefFor(lead.story.id)
    )
  );

  for (const [section, picks] of byDesk) {
    picks.forEach((pick, i) => {
      // The lead has already announced its own desk, so its stablemates do
      // not announce it again.
      const heads = i === 0 && section !== lead.story.section;
      drafts.push(
        storyDraft(
          pick.story,
          "story",
          heads ? deskName(section) : null,
          pick.depth,
          briefFor(pick.story.id)
        )
      );
    });
  }

  rundown.forEach((story, i) => {
    drafts.push({
      kind: "rundown",
      title: story.headline,
      section: story.section,
      sources: outlets(story).length,
      storyId: story.id,
      desk: i === 0 ? "in brief" : null,
      lines:
        i === 0
          ? ["And briefly, also on the wire this morning.", spokenHeadline(story.headline)]
          : [spokenHeadline(story.headline)],
    });
  });

  // Final trim. Grouping changes which items carry a desk announcement, and
  // the "and briefly" hand-off costs a line the pricing pass never saw, so
  // the laid-out bulletin can run a few seconds long. Headlines come off the
  // back of the rundown until it fits, which is the same thing a producer
  // does to a script that overruns.
  const furnitureCost = draftSeconds(priced.open) + draftSeconds(priced.close);
  const bodyCost = () => drafts.reduce((n, d) => n + draftSeconds(d.lines), 0);
  while (furnitureCost + bodyCost() > targetSeconds) {
    const last = drafts.map((d) => d.kind).lastIndexOf("rundown");
    if (last === -1) break;
    drafts.splice(last, 1);
  }

  // The real opening and closing, written now that the count and the run time
  // are known rather than estimated. Both were priced above from a provisional
  // pass whose only difference is a spelled-out numeral, so substituting them
  // moves the total by a word or two and never by a line.
  const read = drafts.filter((d) => d.storyId !== null).length;
  const spoken = furniture(date, read, total, furnitureCost + bodyCost());

  return assemble(
    [
      {
        kind: "open",
        title: "The AI Daily",
        section: null,
        sources: 0,
        storyId: null,
        desk: null,
        lines: spoken.open,
      },
      ...drafts,
      {
        kind: "close",
        title: "And that is the news",
        section: null,
        sources: 0,
        storyId: null,
        desk: null,
        lines: spoken.close,
      },
    ],
    read,
    total
  );
}

function assemble(drafts: Draft[], read: number, total: number): Briefing {
  const lines: BriefingLine[] = [];
  const items: BriefingItem[] = [];

  drafts.forEach((draft, index) => {
    const from = lines.length;
    for (const text of draft.lines) {
      lines.push({ text, item: index, seconds: clipSeconds(text) });
    }
    const { lines: _spoken, ...meta } = draft;
    items.push({ ...meta, from, to: lines.length, seconds: 0 });
  });

  const speechSeconds = lines.reduce((n, l) => n + l.seconds, 0);

  /**
   * The silence, charged to the line it follows.
   *
   * Written in here rather than allowed for per line, because only the
   * laid-out bulletin knows where one entry ends and the next begins — and
   * that is the difference between a breath and a settling pause. Charging it
   * backwards means the per-line, per-item and whole-bulletin totals are all
   * the same arithmetic, so the running time printed beside an entry and the
   * running time of the file agree instead of drifting apart.
   */
  for (let i = 0; i < lines.length - 1; i++) {
    lines[i].seconds +=
      lines[i + 1].item !== lines[i].item ? PACE.itemGapSeconds : PACE.gapSeconds;
  }

  for (const item of items) {
    item.seconds = lines
      .slice(item.from, item.to)
      .reduce((n, l) => n + l.seconds, 0);
  }

  return {
    items,
    lines,
    seconds: items.reduce((n, i) => n + i.seconds, 0),
    speechSeconds,
    words: lines.reduce((n, l) => n + countWords(l.text), 0),
    read,
    total,
  };
}
