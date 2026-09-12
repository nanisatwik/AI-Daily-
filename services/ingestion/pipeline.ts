import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type {
  Article,
  EventCluster,
  Section,
} from "../../lib/types.ts";
import { CATEGORY_RULES, type Feed } from "./sources.ts";

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
  };
}

/* ------------------------------------------------------------------ *
 * 03  Deduplication and event clustering
 * ------------------------------------------------------------------ */

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Two headlines describing one event. Tuned to group, not to over-merge. */
export const CLUSTER_AT = 0.42;

export function clusterArticles(articles: Article[]): EventCluster[] {
  // Exact repeats of the same headline never earn a second slot.
  const seen = new Set<string>();
  const unique = articles.filter((a) => {
    const key = `${a.sourceId}:${a.contentHash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const tokens = new Map(unique.map((a) => [a.id, tokenize(a.title)]));
  const clusters: { articles: Article[]; tokens: Set<string> }[] = [];

  for (const article of unique) {
    const mine = tokens.get(article.id)!;
    let best: (typeof clusters)[number] | null = null;
    let bestScore = CLUSTER_AT;

    for (const c of clusters) {
      const score = jaccard(mine, c.tokens);
      if (score >= bestScore) {
        best = c;
        bestScore = score;
      }
    }

    if (best) {
      best.articles.push(article);
      for (const t of mine) best.tokens.add(t);
    } else {
      clusters.push({ articles: [article], tokens: new Set(mine) });
    }
  }

  return clusters.map((c) => {
    const id = hash(c.articles.map((a) => a.id).sort().join("|"));
    const byTrust = [...c.articles].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
    const lead = byTrust[0];
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
  now = Date.now()
): EventCluster[] {
  for (const c of clusters) {
    const ageHours = (now - Date.parse(c.lastSeenAt)) / 3_600_000;
    const freshness = Math.exp(-Math.max(ageHours, 0) / 20);

    const outlets = new Set(c.articles.map((a) => a.sourceId));
    const corroboration = Math.min(outlets.size / 5, 1);

    const trust =
      [...outlets].reduce((sum, id) => sum + trustOf(id), 0) /
      Math.max(outlets.size, 1);

    // A lone community post is not a lead story; a lab announcement can be.
    const novelty = Math.min(c.tags.length / 8, 1);

    c.score =
      0.34 * corroboration + 0.3 * freshness + 0.26 * trust + 0.1 * novelty;
  }

  return clusters.sort((a, b) => b.score - a.score);
}
