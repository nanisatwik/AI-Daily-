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
      // The outlet is claimed only when the article is actually accepted.
      // Marking it seen first meant a publisher whose newest report carried a
      // stub standfirst locked out its own longer one.
      if (seen.has(a.sourceId) || a.summary.length <= 40) return false;
      seen.add(a.sourceId);
      return true;
    })
    .sort((a, b) => b.summary.length - a.summary.length)
    .slice(0, 3)
    .map((a) => a.summary);

  // One credit per PUBLISHER, newest report first. Two reports from the same
  // publication are one outlet's coverage, not two — the tally marks beside a
  // headline count independent corroboration, and the ranking counts distinct
  // publishers as well. Crediting "TechCrunch, TechCrunch" overstated both.
  //
  // Keyed on the publisher's name rather than its feed id, because one
  // publisher can be read through several feeds: IEEE Spectrum arrives here as
  // both `ieee-spectrum` and `ieee-computing`, and deduping by id credited it
  // twice and drew two tally marks for a single outlet.
  const credited = new Set<string>();
  const sources = byTime.filter((a) => {
    if (credited.has(a.sourceName)) return false;
    credited.add(a.sourceName);
    return true;
  });

  return {
    id: cluster.id,
    headline: cluster.title,
    deck: cluster.summary.slice(0, 240),
    body: body.length ? body : [cluster.summary || cluster.title],
    section: cluster.category,
    sources: sources.map((a) => ({
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

/**
 * The "more from the wire" strip under the fold.
 *
 * This returned `slice(5, 9)` — four stories — so the front page showed nine
 * of however many were published and the rest appeared nowhere on it. The
 * front page also has to reach roughly the same depth as the inner sheets,
 * since the tallest sheet sets the height for all three and the shortfall is
 * printed as blank paper: at nine stories it ran 1900px short.
 *
 * Eighteen fills the three-column strip six rows deep.
 */
export function getRemainingStories(): Story[] {
  return stories.slice(5, 23);
}

/** Stories in the given sections, excluding the front-page lead. */
export function getStoriesInSections(sections: string[]): Story[] {
  const leadId = stories[0]?.id;
  return stories.filter(
    (s) => s.id !== leadId && sections.includes(s.section)
  );
}

export type InnerSheet = { label: string; stories: Story[] };

/**
 * The inner sheets, balanced by length.
 *
 * Every sheet is the same physical page, so the tallest one sets the height of
 * all of them and any imbalance is printed as white space on the others. Fixed
 * section lists could not hold that balance: section sizes swing daily, and
 * "AI News" alone is routinely a third of the edition, so whichever list
 * contained it ran long while the other ran short. Measured on one edition,
 * that was 4802px of copy against 3649px — nearly 1500px of blank paper.
 *
 * Sections are still kept together, because a sheet that jumps between desks
 * reads like a feed rather than a page. They are laid down largest-first so
 * the split falls inside a big section rather than stranding a small one on a
 * sheet of its own, and each sheet is named after what actually landed on it.
 */
export function getInnerSheets(sheets = 2): InnerSheet[] {
  const leadId = stories[0]?.id;
  const inner = stories.filter((s) => s.id !== leadId);

  const bySection = new Map<string, Story[]>();
  for (const s of inner) {
    const list = bySection.get(s.section) ?? [];
    list.push(s);
    bySection.set(s.section, list);
  }

  const ordered = [...bySection.values()]
    .sort((a, b) => b.length - a.length)
    .flat();

  const per = Math.ceil(ordered.length / sheets);

  return Array.from({ length: sheets }, (_, i) => {
    const slice = ordered.slice(i * per, (i + 1) * per);
    const counts = new Map<string, number>();
    for (const s of slice)
      counts.set(s.section, (counts.get(s.section) ?? 0) + 1);
    const named = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([section]) => section.replace(/^AI /, ""));
    return {
      label: named.length ? named.join(" and ") : "The wire",
      stories: slice,
    };
  });
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
    // By publisher name, not feed id — one publisher may arrive on several
    // feeds, and search weights this the same way the ranking does.
    sourceCount: new Set(c.articles.map((a) => a.sourceName)).size,
    cities: c.cities ?? [],
    score: c.score,
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
