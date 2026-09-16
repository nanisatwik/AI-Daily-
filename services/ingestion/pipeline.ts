import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type {
  Article,
  EventCluster,
  Section,
} from "../../lib/types.ts";
import { CATEGORY_RULES, type Feed } from "./sources.ts";
import { extractLocations, citiesFor } from "./geo.ts";

/* ------------------------------------------------------------------ *
 * 01  Source discovery
 * ------------------------------------------------------------------ */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

export type RawItem = {
  feed: Feed;
  title: string;
  link: string;
  description: string;
  published: string | null;
  author: string | null;
};

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Feed shapes vary; pull the first usable string out of a node. */
function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    return text(o["#text"] ?? o["@_href"] ?? o["_"] ?? "");
  }
  return "";
}

export async function fetchFeed(feed: Feed, timeoutMs = 20000): Promise<RawItem[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { "user-agent": "TheAIDaily/0.1 (+ingestion)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xml = await res.text();
    const doc = parser.parse(xml);

    // RSS 2.0 and Atom in one path.
    const entries = [
      ...asArray<Record<string, unknown>>(doc?.rss?.channel?.item),
      ...asArray<Record<string, unknown>>(doc?.feed?.entry),
      ...asArray<Record<string, unknown>>(doc?.["rdf:RDF"]?.item),
    ];

    return entries
      .map((e) => ({
        feed,
        title: text(e.title),
        link: text(e.link) || text(e.id),
        description: text(e.description ?? e.summary ?? e.content),
        published: text(e.pubDate ?? e.published ?? e.updated ?? e["dc:date"]) || null,
        author: text(e.author ?? e["dc:creator"]) || null,
      }))
      .filter((i) => i.title && i.link);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * 02  Normalization
 * ------------------------------------------------------------------ */

const STOP = new Set([
  "a","an","the","and","or","but","of","to","in","on","for","with","at","by",
  "from","as","is","are","was","were","be","been","it","its","this","that",
  "these","those","new","says","say","said","after","over","into","amid","how",
  "why","what","will","can","could","may","more","than","you","your",
  // Function words that survived the first pass and were observed matching
  // unrelated headlines to each other: "You Don't Need To Train" paired with
  // "We don't need AI regulation" on {don, need}. "don" is the wreckage of an
  // apostrophe, not a word.
  "not","don","need","needs","out","off","who","when","where","which","while",
  "them","they","their","there","has","have","had","about","just","now","get",
  "got","gets","make","makes","made","one","two","all","any","own","let","lets",
  "too","very","still","back","even","also","like","want","wants","tells",
  "told","puts","put","going","goes","our","his","her","use","used","uses",
  "many","much","some","such","only","would","should","must","been","being",
]);

/**
 * Vocabulary that describes the SUBJECT of an AI story rather than identifying
 * a particular event. In this paper "model" and "agent" are as uninformative
 * as "the" — two headlines sharing them have shown no evidence of covering the
 * same thing.
 *
 * Stated rather than learned, deliberately. Inverse document frequency is the
 * textbook way to discover which words are uninformative, and it was measured
 * here and rejected: at ~120 articles a day "foundation" and "huang" each
 * appear three times and look equally rare. The corpus is far too small for
 * document frequency to carry meaning, so the field's own vocabulary is listed
 * by hand instead.
 */
const DOMAIN = new Set([
  // the field itself
  "artificial","intelligence","machine","learning","deep","neural","network",
  "networks","model","models","modeling","modelling","llm","llms","language",
  "generative","transformer","transformers","agent","agents","agentic",
  "chatbot","chatbots","bot","bots","robot","robots",
  // method vocabulary
  "training","train","trained","tuning","fine","inference","reasoning",
  "prompt","prompting","embedding","embeddings","alignment","distillation",
  "quantization","pruning","benchmark","benchmarks","evaluating","evaluation",
  "evaluate","dataset","datasets","weight","weights","parameter","parameters",
  "token","tokens","context","multimodal","cross","transfer","sparse",
  "adaptive","versus","supervised","unsupervised","reinforcement",
  // paper furniture
  "using","via","towards","toward","novel","efficient","robust","scalable",
  "framework","approach","method","methods","system","systems","study",
  "analysis","survey","research","researchers","paper","results","performance",
  "improving","improved","learn","generation","based","aware","guided",
  "driven","aided","toward","enabling","enables","leveraging",
  // generic tech and news filler that identifies nothing
  "data","source","open","first","best","top","big","tech","technology",
  "company","companies","startup","startups","industry","million","billion",
  "users","people","world","years","year","report","reports","launch",
  "launches","announces","announced","unveils","reveals",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", middot: "·", bull: "•", deg: "°",
};

/** Feeds escape aggressively and inconsistently; decode the lot, not a list. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code.startsWith("#")) {
      const n = /^#x/i.test(code)
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function stripHtml(s: string): string {
  // Decode twice: several feeds double-escape (&amp;#8217;).
  return decodeEntities(decodeEntities(s.replace(/<[^>]*>/g, " ")))
    .replace(/\s+/g, " ")
    .trim();
}

/** Publisher suffixes ("… | TechCrunch") carry no information for matching. */
export function normalizeTitle(title: string): string {
  return stripHtml(title)
    .replace(/\s+[|–—-]\s+[^|–—-]{0,40}$/, "")
    .trim();
}

export function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
  );
}

/**
 * The tokens left once the field's own vocabulary is removed — in practice the
 * names: people, companies, products, places. These are what distinguish one
 * event from another, so these are what clustering matches on.
 */
export function contentTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokenize(s)) if (!DOMAIN.has(t)) out.add(t);
  return out;
}

export function classify(item: RawItem): Section {
  const hay = `${item.title} ${stripHtml(item.description)}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(hay))) return rule.category;
  }
  return item.feed.defaultCategory;
}

/**
 * Null when a feed gives no usable date. Defaulting to "now" would stamp a
 * publisher's entire back catalogue as today's news — which is exactly what
 * happened on the first run, flooding the edition with years-old posts.
 */
function parseDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  // Feeds occasionally carry absurd dates; refuse anything in the future.
  if (t > Date.now() + 6 * 3_600_000) return null;
  return new Date(t).toISOString();
}

/**
 * This is an AI newspaper. General-interest feeds carry plenty that is not,
 * and a keyword gate is honest about what it does — no story reaches the page
 * without a stated reason for being there.
 */
const AI_TERMS =
  /\b(a\.?i\.?|artificial intelligence|machine learning|deep learning|neural|llm|language model|foundation model|gpt|claude|gemini|llama|mistral|transformer|diffusion|inference|fine-?tun\w*|embedding|rag|agentic|ai agents?|chatbot|openai|anthropic|deepmind|hugging ?face|nvidia|tpu|gpu cluster|robot\w*|autonomous|copilot|prompt\w*|benchmark|dataset|training run|reasoning model)\b/i;

export function isAiRelevant(item: RawItem): boolean {
  // arXiv cs.AI / cs.LG are relevant by construction.
  if (item.feed.source.publisherType === "preprint") return true;
  return AI_TERMS.test(`${item.title} ${stripHtml(item.description)}`);
}

const hash = (s: string) =>
  createHash("sha1").update(s.toLowerCase()).digest("hex").slice(0, 16);

/** Null when the item carries no usable publication date. */
export function normalize(item: RawItem): Article | null {
  const publishedAt = parseDate(item.published);
  if (!publishedAt) return null;

  const title = normalizeTitle(item.title);
  const summary = stripHtml(item.description).slice(0, 420);

  return {
    id: hash(`${item.feed.source.id}:${item.link}`),
    title,
    summary,
    sourceId: item.feed.source.id,
    sourceName: item.feed.source.name,
    sourceUrl: item.link,
    author: item.author ? stripHtml(item.author).slice(0, 80) : null,
    publishedAt,
    updatedAt: null,
    imageUrl: null,
    language: "en",
    category: classify(item),
    tags: [...tokenize(title)].slice(0, 8),
    contentHash: hash(title),
    eventClusterId: "",
    locations: extractLocations(title, summary),
  };
}

/* ------------------------------------------------------------------ *
 * 03  Deduplication and event clustering
 * ------------------------------------------------------------------ */

/**
 * How many names two headlines must share to be treated as one event.
 *
 * This replaced a Jaccard similarity threshold of 0.42, which was measured
 * against a full day of the wire and found to be unreachable: across 124
 * articles from 12 publishers the strongest cross-publisher score in the whole
 * corpus was 0.200. Worse, lowering it could not have helped, because the true
 * and false pairs overlapped completely — 0.200 was two unrelated arXiv papers
 * sharing "evaluating", while the day's most widely covered story scored 0.158.
 * No cut point separates those, so the signal had to change rather than the
 * threshold.
 *
 * Two independent outlets naming the same two specific things is not
 * coincidence. One shared name usually is: "Apple" alone joined an iOS release
 * to an OpenAI lawsuit.
 */
export const MIN_SHARED_TOKENS = 2;

export function clusterArticles(
  articles: Article[],
  trustOf: (sourceId: string) => number = () => 0.5
): EventCluster[] {
  // Exact repeats of the same headline never earn a second slot.
  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    const key = `${a.sourceId}:${a.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const tokens = new Map(unique.map((a) => [a.id, contentTokens(a.title)]));
  const clusters: { articles: Article[] }[] = [];

  for (const article of unique) {
    const mine = tokens.get(article.id)!;
    let best: (typeof clusters)[number] | null = null;
    let bestShared = 0;

    for (const c of clusters) {
      // Compared against each member separately, and never against the union
      // of the cluster's tokens. A union grows every time an article joins, so
      // matching against it made a cluster HARDER to join the more
      // corroboration it had already gathered — exactly backwards.
      let shared = 0;
      for (const member of c.articles) {
        const theirs = tokens.get(member.id)!;
        let n = 0;
        for (const t of mine) if (theirs.has(t)) n++;
        if (n > shared) shared = n;
      }

      if (shared >= MIN_SHARED_TOKENS && shared > bestShared) {
        best = c;
        bestShared = shared;
      }
    }

    if (best) best.articles.push(article);
    else clusters.push({ articles: [article] });
  }

  return clusters.map((c) => {
    const id = hash(c.articles.map((a) => a.id).sort().join("|"));
    // We cannot write our own headline, so we borrow one — and it should be
    // the most trustworthy outlet's, not merely the last to file. This sorted
    // by date alone while every cluster held one article, so the mismatch
    // between the name and the comparator never showed; the moment clustering
    // began working it would have let the least authoritative outlet in a
    // cluster set the headline for all of them.
    const lead = [...c.articles].sort(
      (a, b) =>
        trustOf(b.sourceId) - trustOf(a.sourceId) ||
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    )[0];
    const times = c.articles.map((a) => Date.parse(a.publishedAt));

    for (const a of c.articles) a.eventClusterId = id;

    // The category the most reports agree on.
    const votes = new Map<Section, number>();
    for (const a of c.articles)
      votes.set(a.category, (votes.get(a.category) ?? 0) + 1);
    const category = [...votes.entries()].sort((x, y) => y[1] - x[1])[0][0];

    return {
      id,
      title: lead.title,
      summary: c.articles.find((a) => a.summary.length > 60)?.summary ?? lead.summary,
      category,
      tags: [...new Set(c.articles.flatMap((a) => a.tags))].slice(0, 10),
      firstSeenAt: new Date(Math.min(...times)).toISOString(),
      lastSeenAt: new Date(Math.max(...times)).toISOString(),
      imageUrl: c.articles.find((a) => a.imageUrl)?.imageUrl ?? null,
      articles: c.articles,
      // A cluster belongs to a city if any report in it does — corroboration
      // across outlets is itself evidence the placing is right.
      cities: [
        ...new Set(c.articles.flatMap((a) => citiesFor(a.locations))),
      ],
      score: 0,
    };
  });
}

/* ------------------------------------------------------------------ *
 * 04  Editorial ranking
 * ------------------------------------------------------------------ */

/**
 * Freshness, corroboration, source trust and novelty — the four the blueprint
 * names. Corroboration carries the most weight: independent outlets choosing
 * to cover the same event is the strongest free signal that it mattered.
 */
export function rank(
  clusters: EventCluster[],
  trustOf: (sourceId: string) => number,
  /** Editorial prominence of the publisher type — see TYPE_WEIGHT. */
  weightOf: (sourceId: string) => number,
  now = Date.now()
): EventCluster[] {
  for (const c of clusters) {
    const ageHours = (now - Date.parse(c.lastSeenAt)) / 3_600_000;
    const freshness = Math.exp(-Math.max(ageHours, 0) / 20);

    const outlets = new Set(c.articles.map((a) => a.sourceId));
    /**
     * Corroboration counts PUBLISHERS, not feeds.
     *
     * One publisher may be read through several feeds — IEEE Spectrum arrives
     * on this wire as both `ieee-spectrum` and `ieee-computing` — and counting
     * feed ids treated that as two independent outlets agreeing with each
     * other. On the edition where this was found it had lifted two stories,
     * one of them into the top five, on corroboration that did not exist.
     *
     * This is the same defect that kept Techmeme off the source list: a feed
     * that manufactures corroboration is worse than no feed. It was then
     * introduced by adding a second IEEE feed.
     */
    const publishers = new Set(c.articles.map((a) => a.sourceName));
    /**
     * Zero when one outlet reported it, because one outlet reporting something
     * is not corroboration.
     *
     * This was `outlets.size / 5`, which paid a solo report 0.2 — a fifth of
     * the credit for having none — and so squeezed the term's real range to
     * 0.2..0.6, worth 0.136 of score. Freshness spans nearly 0..1 inside a
     * single day, worth 0.27. Weight alone does not decide a front page;
     * weight times achievable range does, and on those numbers freshness
     * quietly outranked corroboration by two to one despite the smaller
     * coefficient. A three-outlet story on the day's biggest argument lost the
     * lead to a single-source cooling piece filed twenty minutes earlier.
     */
    const corroboration = Math.min((publishers.size - 1) / 3, 1);

    /**
     * Mean trust across the outlets. Note this can in principle dilute: a
     * joining outlet whose trust is below about 0.42 lowers the mean by more
     * than the extra corroboration adds back, so being picked up would cost a
     * story score. Measured, not assumed — and it cannot currently happen, as
     * the least trusted source in `sources.ts` sits at 0.60. Left as a mean
     * rather than a max deliberately: a weak outlet joining should temper the
     * average, just never enough to punish the story.
     */
    const trust =
      [...outlets].reduce((sum, id) => sum + trustOf(id), 0) /
      Math.max(outlets.size, 1);

    // A lone community post is not a lead story; a lab announcement can be.
    const novelty = Math.min(c.tags.length / 8, 1);

    // Best prominence in the cluster: one wire report picking up a preprint is
    // enough to make it a news story.
    const prominence = Math.max(...[...outlets].map(weightOf));

    c.score =
      (0.34 * corroboration + 0.3 * freshness + 0.26 * trust + 0.1 * novelty) *
      prominence;
  }

  return clusters.sort((a, b) => b.score - a.score);
}
