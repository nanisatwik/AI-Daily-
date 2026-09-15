/**
 * Reader preferences — blueprint Phase 2.
 *
 * Kept entirely on the reader's own device. A news reader needs an account for
 * exactly two things: syncing between devices, and surviving a cleared
 * browser. Everything else — topics, cities, clippings, briefing time — is
 * data only the reader needs, so there is no reason to take custody of it.
 *
 * What that buys: no signup, no server, no database, no privacy policy, and
 * it works offline. What it costs: preferences do not follow you to another
 * device. That is the trade, and it is the right way round until somebody
 * actually asks for sync.
 */

export type Preferences = {
  /**
   * Section names to weight up. Empty means no preference, not "none".
   *
   * Plain strings rather than the Section union on purpose: these arrive from
   * localStorage and from clicks, neither of which can be trusted to still
   * match the union after a rename. Matching is done by value.
   */
  topics: string[];
  /** AI hubs to weight up, by city name. */
  cities: string[];
  /** Local time for the morning briefing, "HH:MM". */
  briefingTime: string;
  /** Cluster ids the reader has clipped. */
  clippings: string[];
  /** Cluster ids already read, used to settle ties. */
  read: string[];
  /** False until the reader has been through, or dismissed, onboarding. */
  onboarded: boolean;
};

export const DEFAULTS: Preferences = {
  topics: [],
  cities: [],
  briefingTime: "07:30",
  clippings: [],
  read: [],
  onboarded: false,
};

const KEY = "ai-daily.preferences.v1";
/** Reading history is a tiebreaker, not an archive. */
const MAX_READ = 300;

/** Anything on disk is untrusted: it may be old, hand-edited, or corrupt. */
function coerce(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const o = raw as Record<string, unknown>;

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const time =
    typeof o.briefingTime === "string" && /^\d{2}:\d{2}$/.test(o.briefingTime)
      ? o.briefingTime
      : DEFAULTS.briefingTime;

  return {
    topics: strings(o.topics),
    cities: strings(o.cities),
    briefingTime: time,
    clippings: strings(o.clippings),
    read: strings(o.read).slice(-MAX_READ),
    onboarded: o.onboarded === true,
  };
}

export function load(): Preferences {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? coerce(JSON.parse(raw)) : { ...DEFAULTS };
  } catch {
    // Private mode, a full quota, or a bad write. Defaults are always usable.
    return { ...DEFAULTS };
  }
}

export function save(prefs: Preferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...prefs, read: prefs.read.slice(-MAX_READ) })
    );
  } catch {
    // Storage being unavailable must never break reading the paper.
  }
}

/* ------------------------------------------------------------------ *
 * Personalised ranking
 * ------------------------------------------------------------------ */

export type Rankable = {
  id: string;
  section: string;
  cities?: string[];
  /** Editorial score from the ingestion pipeline, 0..1-ish. */
  score: number;
  publishedAt: string;
};

/**
 * Preference nudges the editorial order; it does not replace it.
 *
 * The blueprint is explicit that a major story must still surface even if it
 * misses every preference — a reader who only picked "Robotics" should still
 * be told the government moved on AI regulation. So matches are a bonus on top
 * of the editorial score rather than a filter applied before it, and the bonus
 * is deliberately smaller than the gap between a big story and a small one.
 */
export function personalise<T extends Rankable>(
  stories: T[],
  prefs: Preferences
): T[] {
  const topics = new Set(prefs.topics);
  const cities = new Set(prefs.cities);
  const read = new Set(prefs.read);

  const scored = stories.map((s) => {
    let bonus = 0;
    if (topics.size && topics.has(s.section)) bonus += 0.18;
    if (cities.size && (s.cities ?? []).some((c) => cities.has(c))) bonus += 0.24;
    // Already-read stories sink, but never below unread ones they outrank by a
    // wide margin — the reader may want to find it again.
    if (read.has(s.id)) bonus -= 0.12;
    return { story: s, rank: s.score + bonus };
  });

  return scored
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        Date.parse(b.story.publishedAt) - Date.parse(a.story.publishedAt)
    )
    .map((x) => x.story);
}

/** True when the reader has told us enough for personalisation to mean anything. */
export function hasPreferences(prefs: Preferences): boolean {
  return prefs.topics.length > 0 || prefs.cities.length > 0;
}
