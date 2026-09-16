/**
 * Choosing a voice worth listening to.
 *
 * The Web Speech API does not synthesise anything itself — it reads out
 * whatever voices the operating system has installed, and it exposes no
 * quality field and no gender field to choose between them. So both have to be
 * inferred from the voice's name, which is unlovely but is the only signal
 * there is.
 *
 * Why this file exists: the paper was reading itself in Microsoft David, the
 * default en-US voice on Windows and a twenty-year-old formant synthesiser.
 * VoiceReader never set `voice` at all, so it took the system default; the
 * briefing asked for en-GB, found none on this machine, and fell through to
 * "first English voice", which is David again. Both therefore sounded like a
 * machine reading a list, which is exactly what they were.
 *
 * The honest limit: genuinely human-sounding speech means neural synthesis,
 * and the good neural engines — ElevenLabs, OpenAI, Google WaveNet — all cost
 * money per character. This project has a hard zero-cost constraint, so the
 * job here is to find the best voice already present on the reader's device
 * rather than to buy a better one. That varies enormously: desktop Chrome
 * carries Google's network voices, iOS carries the Siri voices, Android
 * carries Google's, and a bare Windows install carries only the legacy
 * Microsoft set. Ranking rather than hardcoding is what lets the same code
 * sound good on a phone and merely acceptable on a desktop.
 */

export type Timbre = "lady" | "gentleman";

export type RankedVoice = {
  voice: SpeechSynthesisVoice;
  /** Higher is better. Comparable only within one device's list. */
  score: number;
  timbre: Timbre | null;
};

/**
 * Names that mark a modern synthesiser.
 *
 * Vendors advertise the good engines in the voice name, which is the only
 * place they surface at all: Microsoft's Windows 11 voices are "(Natural)",
 * Apple's are "(Enhanced)" or "(Premium)", Google's network voices are simply
 * prefixed "Google", and Edge exposes "Online".
 */
const MODERN = [
  "natural",
  "neural",
  "premium",
  "enhanced",
  "online",
  "siri",
  "wavenet",
  "journey",
  "studio",
];

/** Synthesisers that will sound like a robot however they are driven. */
const LEGACY = ["espeak", "pico", "sapi", "compact", "flite"];

/**
 * The legacy Microsoft set, by name.
 *
 * Listed explicitly rather than matched on "microsoft", because Windows 11's
 * far better voices are also called Microsoft — "Microsoft Aria (Natural)"
 * must not be tarred with the same brush as "Microsoft David".
 */
const MS_LEGACY = [
  "david",
  "zira",
  "mark",
  "hazel",
  "susan",
  "george",
  "ravi",
  "heera",
  "irina",
  "sean",
  "linda",
  "richard",
  "james",
  "catherine",
];

const LADY = [
  "zira", "heera", "aria", "jenny", "michelle", "ana", "ashley", "cora",
  "elizabeth", "monica", "natasha", "clara", "neerja", "libby", "sonia",
  "emily", "amber", "hazel", "susan", "linda", "catherine", "eva", "yuna",
  "samantha", "victoria", "karen", "moira", "tessa", "fiona", "serena",
  "kate", "allison", "ava", "nicky", "joanna", "salli", "kendra", "kimberly",
  "female", "woman",
];

const GENTLEMAN = [
  "david", "mark", "ravi", "guy", "daniel", "alex", "fred", "tom", "oliver",
  "george", "richard", "eric", "christopher", "brandon", "jason", "tony",
  "roger", "steffan", "prabhat", "liam", "rishi", "ryan", "thomas",
  "william", "aaron", "adam", "brian", "arthur", "gordon", "james", "sean",
  "male", "man",
];

const has = (haystack: string, needles: string[]) =>
  needles.some((n) => haystack.includes(n));

/**
 * Gender is not in the API, so it is read off the name.
 *
 * Returns null rather than guessing when the name carries no clue — a voice
 * called "en-US-Standard-C" tells us nothing, and offering it as "the lady
 * announcer" on a coin toss is worse than leaving the choice unoffered.
 */
export function timbreOf(name: string): Timbre | null {
  const n = name.toLowerCase();
  // Checked before the name lists: an explicit "Female"/"Male" in the name is
  // the vendor telling us directly, and beats any first-name heuristic.
  if (/\bfemale\b/.test(n)) return "lady";
  if (/\bmale\b/.test(n)) return "gentleman";
  if (has(n, LADY)) return "lady";
  if (has(n, GENTLEMAN)) return "gentleman";
  return null;
}

export function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let score = 0;

  if (has(n, MODERN)) score += 100;
  if (n.startsWith("google")) score += 60;
  // A network voice is nearly always the better engine — the device is calling
  // out to a model rather than running a decades-old local synthesiser.
  if (!v.localService) score += 25;
  if (has(n, LEGACY)) score -= 60;
  if (has(n, MS_LEGACY) && !has(n, MODERN)) score -= 40;

  // Mild preference for the reader's own English rather than a foreign accent
  // reading English. en-GB edges en-US only because the paper is written in
  // British spelling and reads its own dates aloud in that order.
  if (v.lang === "en-GB") score += 8;
  else if (v.lang === "en-US") score += 6;
  else if (v.lang.startsWith("en")) score += 3;

  return score;
}

/** English voices, best first. Anything not English is unusable here. */
export function rankVoices(all: SpeechSynthesisVoice[]): RankedVoice[] {
  return all
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .map((v) => ({ voice: v, score: scoreVoice(v), timbre: timbreOf(v.name) }))
    .sort((a, b) => b.score - a.score);
}

export type VoicePair = {
  lady: SpeechSynthesisVoice | null;
  gentleman: SpeechSynthesisVoice | null;
  /** Best available regardless of timbre, for when neither can be identified. */
  best: SpeechSynthesisVoice | null;
  /**
   * True when the best voice on offer is a legacy synthesiser, so the UI can
   * say so plainly instead of leaving the reader to wonder why it sounds like
   * that. Nothing in the code can fix it — the device has nothing better.
   */
  onlyLegacy: boolean;
};

export function pickVoices(all: SpeechSynthesisVoice[]): VoicePair {
  const ranked = rankVoices(all);
  const first = (t: Timbre) => ranked.find((r) => r.timbre === t)?.voice ?? null;
  return {
    lady: first("lady"),
    gentleman: first("gentleman"),
    best: ranked[0]?.voice ?? null,
    onlyLegacy: ranked.length > 0 && ranked[0].score < 30,
  };
}

/**
 * Delivery, which matters as much as the voice.
 *
 * A synthesiser reads at a flat, slightly hurried clip and runs sentences
 * together, and that running-together is most of what makes it sound
 * mechanical — a newsreader breathes between sentences. So the pace is set a
 * little under default and a real gap is left between utterances. The gap
 * cannot be expressed in the API at all; it has to be waited out by the
 * caller, which is why it is a number here rather than a property.
 */
export const DELIVERY = {
  /** Broadcast pace is a shade slower than the synthesiser's default. */
  rate: 0.94,
  /**
   * Left at 1. Shifting pitch on a formant synthesiser makes it sound more
   * artificial, not less — the voice thins out rather than deepening.
   */
  pitch: 1,
  /** Milliseconds of silence between sentences. A breath, not a stall. */
  gapMs: 260,
  /** A longer settling pause where the running order moves to a new story. */
  itemGapMs: 620,
} as const;
