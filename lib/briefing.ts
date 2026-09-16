import type { Story } from "./digest";

/**
 * The five-minute briefing — blueprint Phase 4.
 *
 * This builds a running order, not a list of headlines: an opening that says
 * what paper this is and what day it is, a lead story given room, the rest of
 * the morning grouped by desk with the corroboration read out, a quick
 * rundown of what there was no time for, and a close.
 *
 * Nothing here is spoken by a paid service. Every word is a word a publisher
 * filed or a line of studio furniture written by hand, and the voice reading
 * it already lives on the reader's machine — see components/Briefing.tsx.
 *
 * The module is deliberately pure and free of browser APIs so the same script
 * can be built on the server: the running order is rendered in the first HTML
 * the reader receives, which is what keeps the panel from flickering into
 * existence after hydration.
 */

/* ------------------------------------------------------------------ *
 * How long a script takes to read
 * ------------------------------------------------------------------ */

/**
 * Words a minute at rate 1.
 *
 * 150 is the broadcast convention — the figure scripts have been timed
 * against since actual wireless — and it is close enough to the default
 * SpeechSynthesis voices to plan against. It is an estimate and cannot be
 * anything else: every platform ships different voices, and none of them
 * expose a duration before speaking. The panel says "about five minutes"
 * rather than a running clock for that reason.
 */
export const WORDS_PER_MINUTE = 150;

/**
 * The silence between two utterances.
 *
 * `speechSynthesis` queues utterances rather than streaming one signal, so
 * every line boundary costs a real gap while the engine picks the next one up.
 * At roughly seventy lines that is most of half a minute — a tenth of the
 * budget — so it is charged for rather than ignored. Measured loosely in
 * Chrome; it is an allowance, not a constant of nature.
 */
const LINE_GAP_SECONDS = 0.35;

/** Five minutes, as the blueprint asks. */
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
 * Share of the bulletin kept back for the closing rundown.
 *
 * A briefing that spends its whole budget on full items ends by simply
 * stopping. Reserving the last stretch for headlines-only means the reader
 * hears what else was on the wire, and it is the block that gets trimmed
 * first when the arithmetic overruns.
 */
const RUNDOWN_SHARE = 0.18;

/** Stories given an extra publisher sentence, in editorial order. */
const DEPTH_ITEMS = 3;

/**
 * Utterances any one story may spend on the publisher's standfirst.
 *
 * A 240-character deck is two or three lines, so this never bites on today's
 * wire. It is here because the selector prices the lead before it knows
 * whether it fits and then keeps it regardless — without a ceiling, one
 * unusually long standfirst would be read out in full and the bulletin would
 * be over before the second story.
 */
const MAX_DECK_LINES = 4;

const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

const upperFirst = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const quantity = (n: number, one: string, many: string) =>
  `${spellNumber(n)} ${n === 1 ? one : many}`;

const secondsFor = (lines: string[]) =>
  (lines.reduce((n, l) => n + countWords(l), 0) / WORDS_PER_MINUTE) * 60 +
  lines.length * LINE_GAP_SECONDS;

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
 * token is the one most likely to be a fragment.
 */
function wholeSentences(text: string): string[] {
  const all = splitSentences(text);
  const finished = all.filter((s) => TERMINATED.test(s));
  if (finished.length > 0) return finished;
  if (all.length === 0) return [];

  const words = all[0].split(/\s+/);
  if (words.length < 6) return [];
  return [`${words.slice(0, Math.max(5, words.length - 1)).join(" ")}.`];
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
      // Split into equal parts rather than filling greedily to the cap. Greedy
      // filling left a 28-word clause as 26 words and then "GPT-Live family."
      // on its own, and a two-word utterance after a full breath sounds like
      // the reader lost their place. Two fourteens do not.
      const per = Math.ceil(words.length / Math.ceil(words.length / MAX_LINE_WORDS));
      for (let i = 0; i < words.length; i += per) {
        out.push(words.slice(i, i + per).join(" "));
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
  seconds: number;
};

export type BriefingLine = {
  text: string;
  /** Index into `Briefing.items`. */
  item: number;
  seconds: number;
};

export type Briefing = {
  items: BriefingItem[];
  lines: BriefingLine[];
  /** Estimated run at rate 1. */
  seconds: number;
  words: number;
  /** Stories that made the bulletin. */
  read: number;
  /** Stories in the edition, so the close can be honest about the rest. */
  total: number;
};

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
  withDepth: boolean
): Draft {
  const lines: string[] = [];
  if (desk) lines.push(`From ${desk}.`);
  if (kind === "lead") lines.push("First, our lead story.");

  lines.push(spokenHeadline(story.headline));

  const named = outlets(story);
  const credit = spokenSources(named);
  if (credit) lines.push(credit);

  lines.push(...spokenProse(story.deck).slice(0, MAX_DECK_LINES));

  if (withDepth) {
    const extra = extraParagraph(story);
    // One paragraph, not the whole column: the point of a briefing is that it
    // ends. The full body is a click away on the story page.
    if (extra) lines.push(...spokenProse(extra).slice(0, 2));
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
 */
export function buildBriefing(
  stories: Story[],
  date: string,
  targetSeconds: number = TARGET_SECONDS
): Briefing {
  const total = stories.length;

  if (total === 0) {
    const bare = furniture(date, 0, 0, 0);
    return assemble([
      { kind: "open", title: "Opening", section: null, sources: 0, storyId: null, desk: null, lines: bare.open },
      { kind: "close", title: "Close", section: null, sources: 0, storyId: null, desk: null, lines: bare.close },
    ], 0, 0);
  }

  const priced = furniture(date, total, total, targetSeconds);
  const budget =
    targetSeconds - secondsFor(priced.open) - secondsFor(priced.close);

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
      depth
    );
    const cost = secondsFor(draft.lines);
    if (chosen.length > 0 && spent + cost > fullBudget) break;
    chosen.push({ story, depth });
    desksSeen.add(story.section);
    spent += cost;
  }

  // Pass two: headlines only, filling whatever the full items left.
  const rundown: Story[] = [];
  for (const story of stories.slice(chosen.length)) {
    const cost = secondsFor([spokenHeadline(story.headline)]);
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

  drafts.push(storyDraft(lead.story, "lead", deskName(lead.story.section), lead.depth));

  for (const [section, picks] of byDesk) {
    picks.forEach((pick, i) => {
      // The lead has already announced its own desk, so its stablemates do
      // not announce it again.
      const heads = i === 0 && section !== lead.story.section;
      drafts.push(
        storyDraft(pick.story, "story", heads ? deskName(section) : null, pick.depth)
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
  const furnitureCost = secondsFor(priced.open) + secondsFor(priced.close);
  const bodyCost = () => drafts.reduce((n, d) => n + secondsFor(d.lines), 0);
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
      lines.push({ text, item: index, seconds: secondsFor([text]) });
    }
    const { lines: _spoken, ...meta } = draft;
    items.push({
      ...meta,
      from,
      to: lines.length,
      seconds: secondsFor(draft.lines),
    });
  });

  return {
    items,
    lines,
    seconds: items.reduce((n, i) => n + i.seconds, 0),
    words: lines.reduce((n, l) => n + countWords(l.text), 0),
    read,
    total,
  };
}
