/**
 * Geo-tagging — the LOCAL pillar.
 *
 * Works on explicit place names and on the institutions and companies that
 * imply a place: a story about MIT is a Boston story whether or not it says
 * "Boston". Every tag carries a confidence and the text that produced it, so a
 * wrong guess can be traced rather than just disbelieved.
 *
 * Deliberately conservative. A story wrongly filed under a reader's own city is
 * far more damaging to trust than one that simply never appears there.
 */

export type GeoTag = {
  city: string;
  state: string | null;
  country: string;
  /** 0..1 — how sure we are the story is actually *about* this place. */
  confidence: number;
  /** The phrase that matched, so a bad tag can be traced to its cause. */
  evidence: string;
};

type Hub = {
  city: string;
  state: string | null;
  country: string;
  /** Lower-cased phrases. Longer and rarer phrases score higher. */
  aliases: string[];
};

/** The AI hubs named in the blueprint, plus the districts people actually write. */
const HUBS: Hub[] = [
  {
    city: "San Francisco",
    state: "California",
    country: "United States",
    aliases: [
      "san francisco", "bay area", "silicon valley", "palo alto",
      "mountain view", "menlo park", "cupertino", "santa clara",
      "sunnyvale", "berkeley", "oakland", "san jose",
    ],
  },
  {
    city: "Boston",
    state: "Massachusetts",
    country: "United States",
    aliases: ["boston", "cambridge, massachusetts", "cambridge, ma", "somerville", "kendall square"],
  },
  {
    city: "New York",
    state: "New York",
    country: "United States",
    aliases: ["new york city", "new york", "manhattan", "brooklyn", "nyc"],
  },
  {
    city: "Seattle",
    state: "Washington",
    country: "United States",
    aliases: ["seattle", "redmond", "bellevue"],
  },
  {
    city: "Austin",
    state: "Texas",
    country: "United States",
    aliases: ["austin, texas", "austin, tx"],
  },
  {
    city: "Los Angeles",
    state: "California",
    country: "United States",
    aliases: ["los angeles", "santa monica", "pasadena"],
  },
  {
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    aliases: ["bengaluru", "bangalore"],
  },
  {
    city: "Hyderabad",
    state: "Telangana",
    country: "India",
    aliases: ["hyderabad"],
  },
  {
    city: "Toronto",
    state: "Ontario",
    country: "Canada",
    aliases: ["toronto", "waterloo, ontario", "mississauga"],
  },
  {
    city: "London",
    state: null,
    country: "United Kingdom",
    aliases: ["london"],
  },
  {
    city: "Singapore",
    state: null,
    country: "Singapore",
    aliases: ["singapore"],
  },
];

/**
 * Institutions and firms whose location is not in dispute. Weighted below a
 * literal place name: a company can be written about anywhere, and a
 * headquarters is weaker evidence than a dateline.
 */
type Anchor = { pattern: RegExp; city: string; weight: number; label: string };

const ANCHORS: Anchor[] = [
  { pattern: /\bMIT\b|massachusetts institute of technology|\bharvard\b/i, city: "Boston", weight: 0.72, label: "MIT / Harvard" },
  { pattern: /\bstanford\b|\bberkeley\b|\bUCSF\b/i, city: "San Francisco", weight: 0.7, label: "Stanford / Berkeley" },
  { pattern: /\bopenai\b|\banthropic\b/i, city: "San Francisco", weight: 0.5, label: "SF-headquartered lab" },
  { pattern: /\bmicrosoft\b|\bamazon\b(?!\s+rainforest)/i, city: "Seattle", weight: 0.45, label: "Seattle-headquartered firm" },
  { pattern: /\bgoogle\b|\bnvidia\b|\bmeta\b(?!\s*data)|\bapple\b/i, city: "San Francisco", weight: 0.42, label: "Bay Area firm" },
  { pattern: /\bdeepmind\b|\bcambridge university\b|\boxford\b/i, city: "London", weight: 0.6, label: "UK institution" },
  { pattern: /\bIIT\b|\bIISc\b/i, city: "Bengaluru", weight: 0.55, label: "Indian institute" },
  { pattern: /\bcolumbia university\b|\bNYU\b|\bcornell tech\b/i, city: "New York", weight: 0.7, label: "NYC university" },
  { pattern: /\bvector institute\b|\buniversity of toronto\b/i, city: "Toronto", weight: 0.75, label: "Toronto institution" },
];

const hubByCity = new Map(HUBS.map((h) => [h.city, h]));

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Confidence rises with how specific the phrase is. "bay area" is a strong
 * signal; "london" appears in plenty of stories that are not about London.
 */
function aliasConfidence(alias: string, inTitle: boolean): number {
  const specific = alias.includes(",") || alias.split(" ").length > 1;
  let score = specific ? 0.82 : 0.6;
  // A place in the headline is what the story is about; in the body it may be
  // an aside.
  if (inTitle) score += 0.14;
  return Math.min(score, 0.96);
}

export function extractLocations(title: string, body: string): GeoTag[] {
  const hay = `${title} ${body}`;
  const titleLower = title.toLowerCase();
  const hayLower = hay.toLowerCase();

  const best = new Map<string, GeoTag>();

  const offer = (city: string, confidence: number, evidence: string) => {
    const hub = hubByCity.get(city);
    if (!hub) return;
    const existing = best.get(city);
    if (existing && existing.confidence >= confidence) return;
    best.set(city, {
      city: hub.city,
      state: hub.state,
      country: hub.country,
      confidence: Number(confidence.toFixed(2)),
      evidence,
    });
  };

  for (const hub of HUBS) {
    for (const alias of hub.aliases) {
      const re = new RegExp(`\\b${escape(alias)}\\b`, "i");
      if (!re.test(hayLower)) continue;
      offer(hub.city, aliasConfidence(alias, re.test(titleLower)), alias);
    }
  }

  for (const anchor of ANCHORS) {
    if (!anchor.pattern.test(hay)) continue;
    const inTitle = anchor.pattern.test(title);
    offer(anchor.city, anchor.weight + (inTitle ? 0.08 : 0), anchor.label);
  }

  return [...best.values()].sort((a, b) => b.confidence - a.confidence);
}

/** Above this a story is shown on a city edition; below it, only recorded. */
export const LOCAL_THRESHOLD = 0.6;

/**
 * Tolerates a missing list: editions written before geo-tagging existed have
 * no `locations` field, and re-processing one must not take the run down.
 */
export function citiesFor(tags: GeoTag[] | undefined | null): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t) => t.confidence >= LOCAL_THRESHOLD).map((t) => t.city);
}

export const AI_HUBS = HUBS.map((h) => ({
  city: h.city,
  state: h.state,
  country: h.country,
}));
