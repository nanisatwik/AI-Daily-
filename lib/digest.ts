import type { Edition, EventCluster, Section } from "./types";
import type { SearchDoc } from "./search";
import raw from "@/data/edition-latest.json";

const edition = raw as unknown as Edition;

/**
 * View model the editorial components render.
 *
 * Note what is absent: a fabricated article body. A feed gives a publisher's
 * own standfirst and nothing more, and the blueprint's trust rules forbid
 * presenting generated prose as reporting. So the page shows the publisher's
 * words, attributed, with a path to the original — and nothing invented.
 */
export type Story = {
  id: string;
  headline: string;
  deck: string;
  /** Publisher-written standfirsts. Never model output. */
  body: string[];
  section: Section;
  sources: { name: string; url: string; publishedAt: string }[];
  publishedAt: string;
  score: number;
};

function toStory(cluster: EventCluster): Story {
  const byTime = [...cluster.articles].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
  );

  // One standfirst per distinct publisher, longest first — the fullest account
  // of the event, in the words of the outlets that reported it.
  const seen = new Set<string>();
  const body = byTime
    .filter((a) => {
      if (seen.has(a.sourceId)) return false;
      seen.add(a.sourceId);
      return a.summary.length > 40;
    })
    .sort((a, b) => b.summary.length - a.summary.length)
    .slice(0, 3)
    .map((a) => a.summary);

  return {
    id: cluster.id,
    headline: cluster.title,
    deck: cluster.summary.slice(0, 240),
    body: body.length ? body : [cluster.summary || cluster.title],
    section: cluster.category,
    sources: byTime.map((a) => ({
      name: a.sourceName,
      url: a.sourceUrl,
      publishedAt: a.publishedAt,
    })),
    publishedAt: cluster.lastSeenAt,
    score: cluster.score,
  };
}

const stories: Story[] = edition.clusters.map(toStory);

export type Digest = {
  date: string;
  edition: number;
  totalItems: number;
  stories: Story[];
};

const digest: Digest = {
  date: edition.date,
  edition: edition.edition,
  totalItems: edition.itemsIngested,
  stories,
};

export function getDigest(): Digest {
  return digest;
}

export function getLeadStory(): Story {
  return stories[0];
}

export function getSecondaryStories(): Story[] {
  return stories.slice(1, 5);
}

export function getRemainingStories(): Story[] {
  return stories.slice(5, 9);
}

/** Stories in the given sections, excluding the front-page lead. */
export function getStoriesInSections(sections: string[]): Story[] {
  const leadId = stories[0]?.id;
  return stories.filter(
    (s) => s.id !== leadId && sections.includes(s.section)
  );
}

export function getStory(id: string): Story | undefined {
  return stories.find((s) => s.id === id);
}

/**
 * Model-written material for a story, kept deliberately separate from the
 * Story type. Nothing here may be rendered without a visible AI label — the
 * blueprint treats that as non-negotiable, and so does this codebase.
 */
export type Brief = {
  tldr: string | null;
  keyPoints: string[];
  whyItMatters: string | null;
  whoIsAffected: string | null;
  model: string;
};

export function getBrief(storyId: string): Brief | null {
  const mine = (edition.aiArtifacts ?? []).filter((a) => a.clusterId === storyId);
  if (mine.length === 0) return null;

  const pick = (type: string) => mine.find((a) => a.type === type)?.content;
  const asText = (v: unknown) => (typeof v === "string" ? v : null);

  const keyPoints = pick("key_points");

  return {
    tldr: asText(pick("tldr")),
    keyPoints: Array.isArray(keyPoints) ? keyPoints : [],
    whyItMatters: asText(pick("why_it_matters")),
    whoIsAffected: asText(pick("who_is_affected")),
    model: mine[0].model,
  };
}

/** True once an edition has been through enrichment. */
export function hasBriefs(): boolean {
  return (edition.aiArtifacts ?? []).length > 0;
}

export function getAllStoryIds(): string[] {
  return stories.map((s) => s.id);
}

/** Compile-time index shipped to the browser; keeps search serverless. */
export function getSearchIndex(): SearchDoc[] {
  return edition.clusters.map((c) => ({
    id: c.id,
    headline: c.title,
    deck: c.summary.slice(0, 200),
    section: c.category,
    sources: [...new Set(c.articles.map((a) => a.sourceName))],
    tags: c.tags,
    publishedAt: c.lastSeenAt,
    sourceCount: new Set(c.articles.map((a) => a.sourceId)).size,
  }));
}

/** Sections that actually carry stories today, with counts. */
export function getSectionIndex(): { section: Section; count: number }[] {
  const counts = new Map<Section, number>();
  for (const s of stories) counts.set(s.section, (counts.get(s.section) ?? 0) + 1);
  return [...counts.entries()]
    .map(([section, count]) => ({ section, count }))
    .sort((a, b) => b.count - a.count);
}

export function getStoriesForSection(section: string): Story[] {
  return stories.filter((s) => s.section === section);
}

/** Every distinct publisher in the edition. */
export function getSourceIndex(): string[] {
  return [
    ...new Set(edition.clusters.flatMap((c) => c.articles.map((a) => a.sourceName))),
  ].sort();
}

export function formatEditionDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = new Date(edition.generatedAt).getTime();
  const hours = Math.round((now - then) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
