/**
 * Every story the paper has ever printed, addressable.
 *
 * lib/digest.ts reads one `edition-latest.json`. That is right for the front
 * page and wrong for a story URL, and measurably so: across the six committed
 * editions 185 distinct stories have been printed, and until this file existed
 * only the newest 54 resolved. The other 131 were 404.
 *
 * The churn is what makes that severe rather than untidy. Overnight from
 * 2026-09-17 to 2026-09-18 just 2 of 54 ids survived into the new paper, so a
 * link a reader shared in the morning was dead by the next one — and
 * app/sitemap.ts was advertising fifty-four story URLs a day, most of which
 * stopped existing inside twenty-four hours. On a domain with no standing in
 * search yet, handing a crawler a sitemap that is mostly 404 is worse than
 * having no sitemap at all.
 *
 * The archive is already committed, so none of this costs anything: the
 * editions are bundled at compile time and read from memory, which is exactly
 * how the front page reads today's.
 *
 * Server-only by intent. lib/digest.ts already ships the current edition to the
 * browser because components render off it; this module must never be imported
 * from a client component, or every reader downloads the whole archive.
 */

import type { AiArtifact, Edition, EventCluster } from "./types";
import { toStory, briefFrom, type Brief, type Story } from "./digest";
import type { SearchDoc } from "./search";

/**
 * The editions, named one by one.
 *
 * They are imported rather than read off disk because an archived story is
 * rendered on demand inside a serverless function, where there is no repository
 * to read. A `readdir` of `data/` sails through the build — the build does have
 * the repository — and then fails on the first reader who asks for an old
 * story, which is the worst shape a bug can have: invisible until a stranger
 * finds it.
 *
 * Named one by one rather than globbed, which was tried first and measured.
 * Turbopack's `import.meta.glob` is directory-relative and will not climb out
 * of the calling file's folder: from `lib/`, `../data/edition-*.json` silently
 * matched nothing — zero editions, no error, a sitemap with eleven URLs. With
 * `{ base: "../data" }` it matched, but then it also matches
 * `edition-latest.json`, which lib/digest.ts already imports statically, and
 * Turbopack failed to instantiate the doubly-owned module on the second
 * request: "the module factory is not available". Excluding it needs a
 * character class, and Turbopack's glob parser rejects one outright —
 * `Parsing glob pattern: edition-[0-9]*.json / invalid character range` — as an
 * internal error that takes the whole route down. Three dead ends, so: a list.
 *
 * The list has to be extended when the press files a new edition, and that is
 * the price of the three dead ends above. It is paid down two ways rather than
 * hoped about. `edition-latest.json` is in the list as well, so the paper
 * actually on sale is always whole even on a morning nobody has added the
 * dated line yet — without that, tonight's run would leave all fifty-four
 * front-page links pointing at 404s, which is worse than the defect being
 * fixed. And archive.check.ts reads `data/` itself and fails by filename when a
 * dated edition on disk is missing from here, so the gap is loud rather than
 * silent.
 *
 * Keyed by path into a plain record so `buildArchive` can be handed the same
 * files read by plain `node`, which is how archive.check.ts exercises this
 * logic against the real editions rather than a transcription of them.
 * lib/briefing.ts injects its brief source on exactly the same grounds.
 */
import latest from "@/data/edition-latest.json";
import e20260912 from "@/data/edition-2026-09-12.json";
import e20260913 from "@/data/edition-2026-09-13.json";
import e20260914 from "@/data/edition-2026-09-14.json";
import e20260916 from "@/data/edition-2026-09-16.json";
import e20260917 from "@/data/edition-2026-09-17.json";
import e20260918 from "@/data/edition-2026-09-18.json";

const bundled: Record<string, unknown> = {
  "data/edition-2026-09-12.json": e20260912,
  "data/edition-2026-09-13.json": e20260913,
  "data/edition-2026-09-14.json": e20260914,
  "data/edition-2026-09-16.json": e20260916,
  "data/edition-2026-09-17.json": e20260917,
  "data/edition-2026-09-18.json": e20260918,
  "data/edition-latest.json": latest,
};

/**
 * An edition file: `edition-<date>.json`, or the copy of the current one.
 *
 * Nothing else in `data/` qualifies, and the two forms are then collapsed by
 * the date inside the file. `edition-latest.json` is byte-for-byte the newest
 * dated file — checked: identical sha256 for 2026-09-18 — so treating them as
 * two editions would count that day twice, 54 duplicate ids and 54 duplicate
 * `<loc>` entries. services/ingestion/run.ts draws the same distinction when it
 * numbers the edition, having once held the number frozen by counting the copy.
 */
const EDITION_FILE = /(?:^|[\\/])edition-(?:\d{4}-\d{2}-\d{2}|latest)\.json$/;

/**
 * An edition, or nothing, without ever throwing.
 *
 * `data/` is not all editions. `digest-2026-09-10.json` is an older shape —
 * `{ date, edition, totalItems, stories }`, so it carries a plausible date and
 * edition number and no clusters at all — and `source-health.json` is feed
 * telemetry. The name pattern keeps both out today; this check is what keeps a
 * nightly run that died mid-write from taking the entire build down for one bad
 * file, when the honest outcome is one missing day and a paper that still
 * prints.
 *
 * The day is matched as a calendar date because app/sitemap.ts turns it into
 * `${date}T00:00:00Z`, and `<lastmod>` is the one field a crawler will reject
 * the whole file over.
 */
function asEdition(mod: unknown): Edition | null {
  const value = (mod as { default?: unknown } | null)?.default ?? mod;
  const e = value as Partial<Edition> | null;
  if (!e || typeof e !== "object") return null;
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;
  if (typeof e.edition !== "number" || !Number.isFinite(e.edition)) return null;
  if (!Array.isArray(e.clusters) || e.clusters.length === 0) return null;
  const printable = (e.clusters as EventCluster[]).every(
    (c) => c && typeof c.id === "string" && c.id.length > 0 && Array.isArray(c.articles)
  );
  return printable ? (value as Edition) : null;
}

/**
 * A searchable column, and the morning it was printed.
 *
 * `SearchDoc` is what lib/search.ts scores; the date and the edition are what
 * a result prints so a reader can see they are looking at an older paper.
 */
export type ArchiveSearchDoc = SearchDoc & { date: string; edition: number };

/** An id, and the edition whose printing of it this page shows. */
export type Printing = { id: string; date: string; edition: number };

export type Archive = {
  /** Editions on file, oldest first. */
  editions: { date: string; edition: number }[];
  /** Every id ever printed, newest edition first, once each. */
  printings: Printing[];
  /** The story as its latest edition set it, with that edition's dateline. */
  story(id: string): { story: Story; date: string; edition: number } | undefined;
  /** The analysis that ran the night the story was printed, if any. */
  brief(id: string): Brief | null;
  /** Other stories from the same edition, in that edition's own order. */
  alongside(id: string, count: number): Story[];
  /** Ids printed in the newest `editionsBack` editions. */
  recentIds(editionsBack: number): string[];
  /** Every searchable column in the newest `editionsBack` editions. */
  searchIndex(editionsBack: number): ArchiveSearchDoc[];
};

/**
 * How many editions' worth of story pages the build prerenders.
 *
 * This is the whole growth question, so it is a number rather than a habit. At
 * roughly 54 new stories a night the archive gains ~18,000 pages a year;
 * measured on this build, static generation runs about 23ms a page, so a year
 * in would spend seven minutes and about 1.8GB of build output printing pages
 * nobody asked for, every deploy, on a free plan. Prerendering the lot is a
 * cliff the paper walks off at a date nobody chooses.
 *
 * So the build prerenders a window and `dynamicParams` (true by default —
 * app/story/[id]/page.tsx leaves it alone deliberately) renders the rest the
 * first time somebody asks, after which the render is cached and served like
 * any other static page. The data is bundled and a deployment is immutable, so
 * an archived column can never go stale; that is the same fact app/sitemap.ts
 * states as `changeFrequency: "never"`.
 *
 * Three editions, because that is where the measured churn puts the warm links.
 * Today's 54 are the ones the front page and the desks link, and they must be
 * prerendered or the paper gets slower than it is now. Only 2 of 54 ids
 * survived the last changeover, so yesterday's paper is a genuinely different
 * ~52 URLs — the ones readers shared yesterday and are still clicking. The
 * morning before that is the tail of the same curve. Measured now: 137 ids,
 * 155 build pages against 72, and it stays near there forever instead of
 * climbing by 54 a day.
 *
 * The trade-off is paid once, by whoever asks for an old story first: their
 * request renders the page instead of collecting it. Measured against
 * `next start`, that request comes back `x-nextjs-cache: MISS` with
 * `s-maxage=31536000` and every one after it is a HIT, byte-identical to a
 * prerendered page — so the cost is one render per archived story, ever, not
 * one per reader.
 *
 * The remaining ceiling is bundle size rather than build time: an edition is
 * ~237KB of JSON, so the archive adds ~87MB a year to the server bundle
 * against Vercel's 250MB, which buys about two years. When that binds the fix
 * is to stop bundling every edition and read them from object storage, not to
 * prerender fewer.
 */
const PRERENDER_EDITIONS = 3;

/**
 * How many editions the index searches.
 *
 * The second growth question, kept beside the first so they are answered in
 * one place. There is no server, so the index is shipped to the browser and
 * searched there — which makes its size a download rather than a query cost.
 *
 * Measured on 2026-09-19: 510 bytes a story, 118KB for the whole archive as it
 * stands. At fifty-four columns a morning that is 0.8MB after a month and
 * 9.6MB after a year, and nobody should pay ten megabytes to look something
 * up. Thirty editions is about a month of paper and roughly 0.8MB, which is
 * the most this is willing to send.
 *
 * Today the archive is seven editions, so the window binds nothing and the
 * index is the whole of it. It starts biting in about three weeks, and when it
 * does the honest fix is not a bigger number here — it is searching somewhere
 * other than the reader's browser.
 */
export const SEARCH_EDITIONS = 30;

/**
 * Build an archive from a set of imported edition modules, keyed by path.
 *
 * A record rather than a list so the caller can be the bundled imports above
 * or, in archive.check.ts, the same files read off disk by `node` — and so the
 * filename, which is what decides whether a file is an edition at all, travels
 * with its contents.
 */
export function buildArchive(modules: Record<string, unknown>): Archive {
  /**
   * One edition per date, keyed by the date inside the file.
   *
   * The filename decides what counts as an edition; the `date` field decides
   * which edition it is, because that is the field the paper prints and the
   * field `<lastmod>` carries. Keying on it is what collapses
   * `edition-latest.json` onto its dated twin instead of printing 2026-09-18
   * twice. Paths are walked in sorted order so `edition-latest.json` is settled
   * last and a disagreement resolves in favour of the paper on the press —
   * which is the one a reader is holding.
   */
  const byDate = new Map<string, Edition>();
  for (const path of Object.keys(modules).sort()) {
    if (!EDITION_FILE.test(path)) continue;
    const edition = asEdition(modules[path]);
    if (edition) byDate.set(edition.date, edition);
  }

  // ISO days sort as strings, so this is the order the press ran them.
  const editions = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  /**
   * Where each id is printed from: its most recent appearance.
   *
   * 44 of the 185 ids ran in more than one edition — b5c02ddb6de498e0 held the
   * page for three mornings running. Laying the editions down oldest first lets
   * the later printing overwrite the earlier one, which is the one a reader
   * should get: a cluster only ever gains corroborating publishers, and the
   * analysis attached to it is the newest that was written.
   */
  const source = new Map<string, { edition: Edition; cluster: EventCluster }>();
  for (const edition of editions)
    for (const cluster of edition.clusters as EventCluster[])
      source.set(cluster.id, { edition, cluster });

  /**
   * Newest edition first, each id once.
   *
   * Emitting only where this edition is the id's latest printing is what makes
   * the list duplicate-free by construction rather than by a later `Set` —
   * app/sitemap.ts spreads it straight into the file, and two `<loc>` entries
   * for one page is a warning nobody reads.
   */
  const printings: Printing[] = [];
  for (let i = editions.length - 1; i >= 0; i--) {
    const edition = editions[i];
    for (const cluster of edition.clusters as EventCluster[])
      if (source.get(cluster.id)?.edition === edition)
        printings.push({ id: cluster.id, date: edition.date, edition: edition.edition });
  }

  /**
   * Columns are set on lookup, not up front.
   *
   * `toStory` is cheap for one story and 18,000 of them is a year's archive
   * projected on every cold start, to answer a request about one.
   */
  const story = (id: string) => {
    const found = source.get(id);
    if (!found) return undefined;
    return {
      story: toStory(found.cluster),
      date: found.edition.date,
      edition: found.edition.edition,
    };
  };

  return {
    editions: editions.map((e) => ({ date: e.date, edition: e.edition })),
    printings,
    story,
    brief: (id) => {
      const found = source.get(id);
      if (!found) return null;
      return briefFrom(
        (found.edition.aiArtifacts ?? []) as AiArtifact[],
        id
      );
    },
    alongside: (id, count) => {
      const found = source.get(id);
      if (!found) return [];
      return (found.edition.clusters as EventCluster[])
        .filter((c) => c.id !== id)
        .slice(0, count)
        .map(toStory);
    },
    searchIndex: (editionsBack) => {
      if (editions.length === 0) return [];
      const from = editions[Math.max(0, editions.length - editionsBack)].date;
      /*
       * Built from `printings`, so a story that ran for three mornings is
       * indexed once, under its latest printing — the same rule the story
       * pages resolve by. Two hits for one event would be the index
       * contradicting the paper.
       */
      const out: ArchiveSearchDoc[] = [];
      for (const printing of printings) {
        if (printing.date < from) continue;
        const found = source.get(printing.id);
        if (!found) continue;
        const c = found.cluster;
        out.push({
          id: c.id,
          headline: c.title,
          deck: (c.summary ?? "").slice(0, 200),
          section: c.category,
          sources: [...new Set(c.articles.map((a) => a.sourceName))],
          tags: c.tags ?? [],
          publishedAt: c.lastSeenAt,
          // The three the ranking needs. By publisher name rather than feed
          // id, exactly as lib/digest.ts getSearchIndex counts them: one
          // publisher may arrive on several feeds.
          sourceCount: new Set(c.articles.map((a) => a.sourceName)).size,
          cities: c.cities ?? [],
          score: c.score,
          date: printing.date,
          edition: printing.edition,
        });
      }
      return out;
    },
    recentIds: (editionsBack) => {
      if (editions.length === 0) return [];
      // Counted in editions rather than in days because the press skips days —
      // there is no 2026-09-15 — and a window measured in dates would quietly
      // shrink to two papers whenever it straddled the gap.
      const from = editions[Math.max(0, editions.length - editionsBack)].date;
      return printings.filter((p) => p.date >= from).map((p) => p.id);
    },
  };
}

const ARCHIVE = buildArchive(bundled);

/** The story as printed, with the edition that printed it. */
export function getArchivedStory(id: string) {
  return ARCHIVE.story(id);
}

/** The analysis from the night this story was printed, if a model wrote any. */
export function getArchivedBrief(id: string): Brief | null {
  return ARCHIVE.brief(id);
}

/** "Elsewhere in this edition", meaning the story's own edition. */
export function getStoriesAlongside(id: string, count = 3): Story[] {
  return ARCHIVE.alongside(id, count);
}

/**
 * Every story URL the route will serve, with the edition each was printed in.
 *
 * app/sitemap.ts reads this and app/story/[id]/page.tsx takes its
 * `generateStaticParams` window from the same list, so the sitemap still cannot
 * advertise a URL the route will not answer — which was the property that file
 * was built around when there was only one edition to answer for.
 */
export function getArchivePrintings(): Printing[] {
  return ARCHIVE.printings;
}

/** The prerender window. See PRERENDER_EDITIONS for why it is a window. */
export function getPrerenderedStoryIds(): string[] {
  return ARCHIVE.recentIds(PRERENDER_EDITIONS);
}

/**
 * The index the reader searches, bounded by SEARCH_EDITIONS.
 *
 * Newest printing first, which is also the order lib/search.ts falls back to
 * when there is no query — so an empty index page opens on this morning's
 * paper rather than on whatever the archive happens to hold.
 */
export function getArchiveSearchIndex(): ArchiveSearchDoc[] {
  return ARCHIVE.searchIndex(SEARCH_EDITIONS);
}

/** Editions on file, oldest first. For the checks and for counting. */
export function getArchiveEditions(): { date: string; edition: number }[] {
  return ARCHIVE.editions;
}
