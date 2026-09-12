/**
 * Core data model, following section 11 of the product blueprint.
 *
 * The governing rule from the blueprint: original source data and AI-generated
 * artifacts are kept apart, so summaries, translations and narration scripts
 * can be regenerated without ever overwriting what a publisher actually said.
 */

export type Section =
  | "AI News"
  | "AI Research"
  | "AI Startups"
  | "Robotics"
  | "AI Policy"
  | "AI Business"
  | "Developer";

export const SECTIONS: Section[] = [
  "AI News",
  "AI Research",
  "AI Startups",
  "Robotics",
  "AI Policy",
  "AI Business",
  "Developer",
];

export type PublisherType =
  | "wire"
  | "publication"
  | "lab"
  | "preprint"
  | "community"
  | "vendor";

export type Source = {
  id: string;
  name: string;
  url: string;
  publisherType: PublisherType;
  /** 0..1. Feeds editorial ranking; not a truth claim about any one story. */
  trust: number;
};

export type Article = {
  id: string;
  title: string;
  /** Publisher's own standfirst. Never AI-written — see AiArtifact for that. */
  summary: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  author: string | null;
  publishedAt: string;
  updatedAt: string | null;
  imageUrl: string | null;
  language: string;
  category: Section;
  tags: string[];
  /** Normalised-title fingerprint used for exact duplicate rejection. */
  contentHash: string;
  eventClusterId: string;
};

/**
 * Several publishers covering one event. The blueprint requires these be
 * grouped so the homepage is not flooded with copies of a single story, while
 * every individual source stays attributed.
 */
export type EventCluster = {
  id: string;
  /** Best headline in the cluster, by source trust then recency. */
  title: string;
  summary: string;
  category: Section;
  tags: string[];
  /** Earliest report in the cluster. */
  firstSeenAt: string;
  lastSeenAt: string;
  imageUrl: string | null;
  articles: Article[];
  /** Editorial score: freshness, corroboration, source trust, novelty. */
  score: number;
};

export type AiArtifactType =
  | "tldr"
  | "key_points"
  | "why_it_matters"
  | "who_is_affected"
  | "explainer"
  | "narration";

/** Anything a model produced. Rendered with a visible label, always. */
export type AiArtifact = {
  id: string;
  clusterId: string;
  type: AiArtifactType;
  language: string;
  content: string | string[];
  model: string;
  createdAt: string;
};

export type Edition = {
  date: string;
  edition: number;
  /** Everything pulled from the wire before deduplication. */
  itemsIngested: number;
  /** Distinct events remaining afterwards. */
  eventsPublished: number;
  generatedAt: string;
  clusters: EventCluster[];
  aiArtifacts: AiArtifact[];
};

export function clusterSourceCount(cluster: EventCluster): number {
  return new Set(cluster.articles.map((a) => a.sourceId)).size;
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).length / 220));
}
