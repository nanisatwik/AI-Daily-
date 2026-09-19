/**
 * The archive, checked.
 *
 * The defect this covers was invisible from inside the app. Every page
 * rendered, every build passed, `npx tsc` was clean, and the only symptom was
 * that 131 of the 185 stories the paper had printed answered 404 — and that a
 * link a reader shared was dead by the next morning, because only 2 of 54 ids
 * survived the 2026-09-17 to 2026-09-18 changeover. Nothing in the codebase
 * could notice that, so the numbers are computed here from the edition files on
 * disk and the real modules are made to agree with them.
 *
 * The other half is the regression risk, which is the more likely way this ends
 * badly: the archive must not have changed today's paper. So the front page's
 * story set and order, and the content of today's fifty-four story pages, are
 * asserted against `edition-latest.json` itself rather than against anything
 * lib/archive.ts computed.
 *
 * Run with plain `node archive.check.ts`.
 */

import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";


/** The repository root, so these run on any machine and on a CI runner. */
const REPO = fileURLToPath(new URL("..", import.meta.url));
const ROOT = new URL("../", import.meta.url).href;
const DATA = `${REPO}data`;

/**
 * Teach plain `node` to read the app's own modules.
 *
 * Lifted from sitemap.check.ts, for the same three reasons: lib/archive.ts
 * imports seven editions through the `@/` bundler alias, imports JSON with no
 * `with { type: "json" }` attribute, and imports `./digest` with no extension.
 * A registered resolve hook supplies all three, which is what lets this check
 * exercise the real archive against the real editions rather than a
 * transcription of either.
 */
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = ${JSON.stringify(ROOT)};
export function resolve(specifier, context, next) {
  const aliased = specifier.startsWith("@/");
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (!aliased && !relative) return next(specifier, context);

  const base = aliased ? ROOT : (context.parentURL ?? ROOT);
  let url = new URL(aliased ? specifier.slice(2) : specifier, base).href;
  const missing = !existsSync(fileURLToPath(url));
  if (missing && existsSync(fileURLToPath(url + ".ts"))) url += ".ts";
  else if (missing && !aliased) return next(specifier, context);

  const json = url.endsWith(".json");
  return {
    url,
    format: json ? "json" : undefined,
    importAttributes: json ? { type: "json" } : context.importAttributes,
    shortCircuit: true,
  };
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const {
  buildArchive,
  getArchivedStory,
  getArchivedBrief,
  getStoriesAlongside,
  getArchivePrintings,
  getPrerenderedStoryIds,
  getArchiveEditions,
} = await import(`${ROOT}lib/archive.ts`);
const {
  getDigest,
  getStory,
  getBrief,
  getAllStoryIds,
  getLeadStory,
  getSecondaryStories,
  getRemainingStories,
  getSectionIndex,
} = await import(`${ROOT}lib/digest.ts`);
const { default: sitemap } = await import(`${ROOT}app/sitemap.ts`);
const { siteOrigin } = await import(`${ROOT}lib/site.ts`);
const SITE_ORIGIN = siteOrigin();

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} ${d}`); };

type RawCluster = { id: string; title: string; articles: { sourceName: string }[] };
type RawEdition = {
  date: string;
  edition: number;
  clusters: RawCluster[];
  aiArtifacts?: { clusterId: string }[];
};

/* ===================================================================== *
 * The corpus, read straight off disk. This is the authority every
 * assertion below is measured against.
 * ===================================================================== */

const datedFiles = readdirSync(DATA)
  .filter((f) => /^edition-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();

const read = (f: string) => JSON.parse(readFileSync(`${DATA}/${f}`, "utf8")) as RawEdition;

const raw = datedFiles.map((f) => ({ file: f, ...read(f) }));
const latestRaw = read("edition-latest.json");

/** id -> the newest edition date that printed it. */
const printedIn = new Map<string, string>();
for (const e of raw) for (const c of e.clusters) printedIn.set(c.id, e.date);

const everyId = [...printedIn.keys()];
const todayIds = latestRaw.clusters.map((c) => c.id);
/** The URLs that were 404 before this change: printed once, not in today's paper. */
const previouslyDead = everyId.filter((id) => !todayIds.includes(id));

/* -- 0. the measured shape of the problem still holds ------------------ */
/**
 * Derived, not written down.
 *
 * These were four literals — 6 editions, 185 distinct ids, 54 today, 131 that
 * had been 404 — the shape the archive work was measured against on the day it
 * was written. The press files a new edition every morning, so by the very
 * next morning all four were wrong and the suite failed on the product working
 * exactly as intended: 7 editions, 237 ids, 183 recovered. A check that cries
 * wolf daily is a check somebody mutes, and a muted check is worse than none.
 *
 * What actually has to hold is the relationships between those numbers, and
 * they are the same every morning however much the paper grows.
 */
ok("corpus.editions", raw.length >= 6, `${raw.length} dated editions on disk`);
ok(
  "corpus.noDuplicateIds",
  new Set(everyId).size === everyId.length,
  `${everyId.length} ids, ${new Set(everyId).size} distinct`
);
ok(
  "corpus.todayIsInIt",
  todayIds.every((id) => printedIn.has(id)),
  "a story in today's paper is missing from the archive"
);
ok(
  "corpus.growsBeyondToday",
  everyId.length > todayIds.length,
  `${everyId.length} archived against ${todayIds.length} in today's paper`
);
ok(
  "corpus.deadIsTheRemainder",
  previouslyDead.length === everyId.length - todayIds.length,
  `${previouslyDead.length} previously 404, expected ${everyId.length - todayIds.length}`
);

/* -- 1. the list of imports in lib/archive.ts covers data/ ------------- */
/**
 * The one way the static import list in lib/archive.ts can rot: the press
 * files `edition-<date>.json` every night and nobody adds the line. This is
 * the assertion that makes that loud, and it names the file.
 */
{
  const onFile = new Set(raw.map((e) => e.date));
  const inArchive = new Set(
    (getArchiveEditions() as { date: string }[]).map((e) => e.date)
  );
  for (const date of onFile)
    ok(
      `imports.covers.${date}`,
      inArchive.has(date),
      `data/edition-${date}.json is on disk and not imported by lib/archive.ts`
    );
  // And nothing invented: an edition in the archive with no file behind it
  // would mean the list points at something that is not the corpus.
  for (const date of inArchive)
    ok(`imports.real.${date}`, onFile.has(date), `no data/edition-${date}.json`);
  ok(
    "imports.noDoubleCount",
    getArchiveEditions().length === raw.length,
    `${getArchiveEditions().length} editions from ${raw.length} dated files — ` +
      `edition-latest.json must collapse onto its dated twin, not count twice`
  );
}

/* ===================================================================== *
 * 2. THE DEFECT: every story the paper has printed resolves
 * ===================================================================== */

{
  const unresolved = everyId.filter((id) => !getArchivedStory(id));
  ok(
    "resolve.all185",
    unresolved.length === 0,
    `${unresolved.length} of ${everyId.length} still do not resolve: ${unresolved.slice(0, 5).join(", ")}`
  );

  const stillDead = previouslyDead.filter((id) => !getArchivedStory(id));
  ok(
    "resolve.the131",
    stillDead.length === 0,
    `${stillDead.length} of the previously dead ids are still dead`
  );

  // Not merely defined: actually printable. An empty headline or no sources is
  // a page that renders as furniture round a hole.
  for (const id of everyId) {
    const found = getArchivedStory(id) as
      | { story: { headline: string; body: string[]; sources: unknown[] }; date: string; edition: number }
      | undefined;
    if (!found) continue;
    ok(`printable.headline.${id}`, found.story.headline.length > 0);
    ok(`printable.body.${id}`, found.story.body.length > 0);
    ok(`printable.sources.${id}`, found.story.sources.length > 0);
    ok(`printable.edition.${id}`, Number.isFinite(found.edition) && found.edition > 0);
  }
}

/* -- 3. an unknown id is still unknown --------------------------------- */
/**
 * The failure mode opposite to the one being fixed: a route that answers for
 * everything renders an empty page instead of 404ing, and a crawler indexes
 * infinitely many of them. app/story/[id]/page.tsx calls `notFound()` on
 * exactly this `undefined`.
 */
for (const bogus of [
  "0000000000000000",
  "not-a-real-id",
  "",
  "b5c02ddb6de498e",     // one character short of a real id
  "b5c02ddb6de498e00",   // one character long
  "../../etc/passwd",
])
  ok(`unknown.${bogus || "(empty)"}`, getArchivedStory(bogus) === undefined);

/* ===================================================================== *
 * 4. an id printed more than once resolves to its LATEST printing
 * ===================================================================== */
/**
 * 44 of the 185 ran on more than one morning. The later printing is the one a
 * reader should get: a cluster only gains corroborating publishers, and the
 * analysis attached to it is the newest that was written. Resolving to the
 * first appearance would be invisible on the page and would quietly show fewer
 * sources than the paper actually carried.
 */
{
  const appearances = new Map<string, string[]>();
  for (const e of raw)
    for (const c of e.clusters)
      appearances.set(c.id, [...(appearances.get(c.id) ?? []), e.date]);
  const multi = [...appearances.entries()].filter(([, d]) => d.length > 1);

  // A count, not a constant: how many events run for more than one morning is
  // a property of the news, not of this code. What must be true is that some
  // do — with none, every assertion below about "the latest printing wins"
  // would be vacuously passing.
  ok("multi.count", multi.length > 0, `${multi.length} ids ran more than once`);

  for (const [id, dates] of multi) {
    const newest = dates[dates.length - 1];
    const got = getArchivedStory(id) as { date: string } | undefined;
    ok(
      `multi.latest.${id}`,
      got?.date === newest,
      `resolved to ${got?.date}, printed ${dates.join(" and ")}`
    );
  }

  // And the source count is the newest printing's, not an older one's — the
  // fact the tally marks beside the headline draw.
  for (const [id, dates] of multi.slice(0, 20)) {
    const newestEdition = raw.find((e) => e.date === dates[dates.length - 1])!;
    const cluster = newestEdition.clusters.find((c) => c.id === id)!;
    const expected = new Set(cluster.articles.map((a) => a.sourceName)).size;
    const got = getArchivedStory(id) as { story: { sources: unknown[] } } | undefined;
    ok(
      `multi.sources.${id}`,
      got?.story.sources.length === expected,
      `${got?.story.sources.length} credits against ${expected} publishers in the ${dates[dates.length - 1]} printing`
    );
  }
}

/* -- 5. every story carries the edition that printed it ---------------- */
// The dateline on the page and `<lastmod>` in the sitemap both come from this.
for (const id of everyId) {
  const got = getArchivedStory(id) as { date: string; edition: number } | undefined;
  ok(`printedOn.${id}`, got?.date === printedIn.get(id), `${got?.date} not ${printedIn.get(id)}`);
  const ed = raw.find((e) => e.date === got?.date);
  ok(`printedNo.${id}`, got?.edition === ed?.edition, `No. ${got?.edition} not ${ed?.edition}`);
}

/* -- 5b. "Elsewhere in this edition" means THIS edition ---------------- */
/**
 * Added after a deliberate sabotage walked past every other assertion here.
 * Pointing `alongside` at the newest edition instead of the story's own passed
 * the whole file, because for today's fifty-four the two are the same thing —
 * and on an archived page it would print three of tonight's headlines under a
 * heading that says they ran alongside a column from six mornings ago. So this
 * is asserted over the archive, not over today, and against the edition file.
 */
for (const id of everyId) {
  const date = printedIn.get(id)!;
  const edition = raw.find((e) => e.date === date)!;
  const expected = edition.clusters
    .filter((c) => c.id !== id)
    .slice(0, 3)
    .map((c) => c.id);
  const got = (getStoriesAlongside(id, 3) as { id: string }[]).map((s) => s.id);
  ok(
    `alongside.sameEdition.${id}`,
    got.join(",") === expected.join(","),
    `got ${got.join(",")} — the ${date} edition ran ${expected.join(",")}`
  );
}

/* ===================================================================== *
 * 6. TODAY'S PAPER IS UNCHANGED
 * ===================================================================== */
/**
 * Measured against `edition-latest.json` directly, because "unchanged" has to
 * mean unchanged from the file the front page has always read, not unchanged
 * from whatever the archive now believes.
 */
{
  const digest = getDigest() as { date: string; edition: number; stories: { id: string }[] };

  ok("today.date", digest.date === latestRaw.date, digest.date);
  ok("today.edition", digest.edition === latestRaw.edition, String(digest.edition));
  ok(
    "today.orderExact",
    digest.stories.map((s) => s.id).join(",") === todayIds.join(","),
    "the front page's story order is not the edition's cluster order"
  );
  ok(
    "today.allStoryIds",
    (getAllStoryIds() as string[]).join(",") === todayIds.join(","),
    "getAllStoryIds no longer reads today's edition"
  );

  // The front-page slices, which decide what is the lead, what is beside it and
  // what fills the strip under the fold.
  ok("today.lead", (getLeadStory() as { id: string }).id === todayIds[0]);
  ok(
    "today.secondary",
    (getSecondaryStories() as { id: string }[]).map((s) => s.id).join(",") ===
      todayIds.slice(1, 5).join(",")
  );
  ok(
    "today.remaining",
    (getRemainingStories() as { id: string }[]).map((s) => s.id).join(",") ===
      todayIds.slice(5, 23).join(","),
    "the eighteen that fill the three-column strip"
  );
  ok(
    "today.sections",
    (getSectionIndex() as { count: number }[]).reduce((n, s) => n + s.count, 0) === 54,
    "the desks no longer add up to the edition"
  );

  /**
   * And today's fifty-four story PAGES are byte-for-byte the same content.
   *
   * This is the assertion that would catch the archive quietly re-setting
   * today's columns out of `edition-2026-09-18.json` differently from
   * `edition-latest.json` — a copy of the same file today, but nothing enforces
   * that tomorrow, and the difference would show as changed source credits on
   * every page of the paper on sale.
   */
  for (const id of todayIds) {
    const viaDigest = getStory(id);
    const viaArchive = (getArchivedStory(id) as { story: unknown } | undefined)?.story;
    ok(
      `today.story.${id}`,
      JSON.stringify(viaArchive) === JSON.stringify(viaDigest),
      "the archive sets this column differently from the front page"
    );
    ok(
      `today.brief.${id}`,
      JSON.stringify(getArchivedBrief(id)) === JSON.stringify(getBrief(id)),
      "the AI panel differs from the one today's edition carries"
    );
    ok(
      `today.alongside.${id}`,
      JSON.stringify(getStoriesAlongside(id, 3)) ===
        JSON.stringify(digest.stories.filter((s) => s.id !== id).slice(0, 3)),
      '"Elsewhere in this edition" changed for a story in today\'s edition'
    );
  }

  // A brief must come from the story's own night. 2026-09-16 ran no analysis at
  // all and 2026-09-18 ran seventy-eight, so reading today's artifacts for an
  // archived story would attach tonight's words to an old column.
  for (const e of raw) {
    const withBrief = e.clusters.filter(
      (c) => (e.aiArtifacts ?? []).some((a) => a.clusterId === c.id)
    );
    for (const c of withBrief.slice(0, 6)) {
      if (printedIn.get(c.id) !== e.date) continue;
      ok(
        `brief.ownNight.${c.id}`,
        getArchivedBrief(c.id) !== null,
        `printed ${e.date}, which wrote ${(e.aiArtifacts ?? []).length} artifacts, yet has no panel`
      );
    }
    const noArtifacts = (e.aiArtifacts ?? []).length === 0;
    if (noArtifacts)
      for (const c of e.clusters.slice(0, 8))
        if (printedIn.get(c.id) === e.date)
          ok(
            `brief.noneThatNight.${c.id}`,
            getArchivedBrief(c.id) === null,
            `${e.date} wrote no analysis, so this story must carry no panel`
          );
  }
}

/* ===================================================================== *
 * 7. the prerender window
 * ===================================================================== */
/**
 * The window is the growth decision, so what is asserted is the property that
 * makes it safe rather than the number: it must be a subset of what the route
 * will serve, it must contain every id the front page links or the paper gets
 * slower than it was, and it must be far short of the whole archive or there
 * was no point.
 */
{
  const window = getPrerenderedStoryIds() as string[];
  const printings = getArchivePrintings() as { id: string; date: string }[];
  const servable = new Set(printings.map((p) => p.id));

  ok("window.noStrangers", window.every((id) => servable.has(id)), "prerendering an id the archive cannot serve");
  ok("window.unique", new Set(window).size === window.length, "a duplicate param makes the build print a page twice");
  for (const id of todayIds)
    ok(`window.today.${id}`, window.includes(id), "a front-page link would render on demand");
  ok(
    "window.isAWindow",
    window.length < everyId.length,
    `${window.length} of ${everyId.length} — prerendering the lot is the thing being avoided`
  );
  {
    // Derived from PRERENDER_EDITIONS rather than written down: the window is
    // whatever the newest three editions hold, and that changes every morning.
    const newest = raw.slice(-3);
    const expected = new Set(newest.flatMap((e) => e.clusters.map((c) => c.id))).size;
    ok(
      "window.measured",
      window.length === expected,
      `${window.length} prerendered, expected ${expected} from the newest three editions`
    );
  }

  // Every id outside the window still resolves; that is what dynamicParams buys.
  const outside = everyId.filter((id) => !window.includes(id));
  ok("window.outsideStillResolves", outside.every((id) => !!getArchivedStory(id)), `${outside.length} outside`);
  ok(
    "window.outsideCount",
    outside.length === everyId.length - window.length,
    `${outside.length} on demand, expected ${everyId.length - window.length}`
  );
}

/* ===================================================================== *
 * 8. the sitemap
 * ===================================================================== */
{
  const entries = sitemap() as {
    url: string;
    lastModified?: string | Date;
    changeFrequency?: string;
    priority?: number;
  }[];
  const urls = entries.map((e) => e.url);
  const storyEntries = entries.filter((e) => e.url.includes("/story/"));

  ok(
    "sitemap.everyStory",
    storyEntries.length === everyId.length,
    `${storyEntries.length} story URLs against ${everyId.length} printed`
  );
  for (const id of everyId)
    ok(
      `sitemap.has.${id}`,
      urls.filter((u) => u.endsWith(`/story/${id}`)).length === 1,
      `appears ${urls.filter((u) => u.endsWith(`/story/${id}`)).length} times`
    );

  // No duplicates anywhere. An id printed on three mornings must still be one
  // `<loc>`, and edition-latest.json must not have doubled today's fifty-four.
  {
    const seen = new Set<string>();
    const dupes = urls.filter((u) => (seen.has(u) ? true : (seen.add(u), false)));
    ok("sitemap.unique", dupes.length === 0, `duplicated: ${dupes.slice(0, 4).join(", ")}`);
  }

  /**
   * `lastModified` is the edition that printed the story.
   *
   * The thing this catches is the old behaviour: one date stamped on all of
   * them, which for 131 of the 185 was a claim that a column set days ago
   * changed this morning. Compared as the UTC calendar day, which is also what
   * would catch a `T00:00:00` with no `Z` sliding a day west of Greenwich.
   */
  for (const e of storyEntries) {
    const id = e.url.split("/story/")[1];
    const expected = printedIn.get(id);
    const when = e.lastModified instanceof Date ? e.lastModified : new Date(String(e.lastModified));
    const valid = Number.isFinite(when.getTime());
    ok(`sitemap.lastmod.valid.${id}`, valid, String(e.lastModified));
    if (!valid) continue;
    ok(
      `sitemap.lastmod.${id}`,
      when.toISOString().startsWith(String(expected)),
      `${when.toISOString().slice(0, 10)} is not the ${expected} edition`
    );
  }

  // Not all one date — the assertion that the fix actually landed rather than
  // the stamps merely being parseable.
  ok(
    "sitemap.lastmodVaries",
    new Set(
      storyEntries.map((e) =>
        (e.lastModified instanceof Date ? e.lastModified : new Date(String(e.lastModified)))
          .toISOString()
          .slice(0, 10)
      )
    ).size === new Set(printedIn.values()).size,
    "the stamps do not cover every edition the archive holds"
  );

  // The standing pages and the desks are still today's paper, daily.
  for (const e of entries.filter((x) => !x.url.includes("/story/"))) {
    const when = e.lastModified instanceof Date ? e.lastModified : new Date(String(e.lastModified));
    ok(
      `sitemap.standing.${e.url}`,
      when.toISOString().startsWith(latestRaw.date),
      `${when.toISOString()} is not today`
    );
  }

  // Still absolute, still one host, still nothing unrendered — the properties
  // sitemap.check.ts was written around, re-asserted over a much longer file.
  for (const u of urls) {
    let parsed: URL | null = null;
    try { parsed = new URL(u); } catch { parsed = null; }
    ok(`sitemap.url.${u}`, parsed !== null, "not a URL at all");
    if (!parsed) continue;
    ok(`sitemap.host.${u}`, `${parsed.protocol}//${parsed.host}` === SITE_ORIGIN, parsed.host);
    ok(`sitemap.noDoubleSlash.${u}`, !parsed.pathname.includes("//"), parsed.pathname);
    for (const bad of ["undefined", "null", "NaN", "[", "]", "%5B"])
      ok(`sitemap.clean.${u}`, !u.includes(bad), `contains ${bad}`);
  }

  {
    // 4 standing pages, one per desk, one per story ever printed. The desk
    // count comes off the sitemap itself because the desks are discovered from
    // the wire and a morning that brings a new one is not a fault.
    const desks = entries.filter((e) => e.url.includes("/section/")).length;
    ok(
      "sitemap.total",
      entries.length === 4 + desks + everyId.length,
      `${entries.length} URLs, expected ${4 + desks + everyId.length} (4 standing + ${desks} desks + ${everyId.length} stories)`
    );
  }
  for (const e of storyEntries)
    ok(`sitemap.never.${e.url}`, e.changeFrequency === "never", String(e.changeFrequency));
  ok(
    "sitemap.priority.today",
    storyEntries
      .filter((e) => todayIds.includes(e.url.split("/story/")[1]))
      .every((e) => e.priority === 0.7)
  );
  ok(
    "sitemap.priority.archive",
    storyEntries
      .filter((e) => !todayIds.includes(e.url.split("/story/")[1]))
      .every((e) => e.priority === 0.5)
  );
}

/* ===================================================================== *
 * 9. what must be ignored, and what must not take the build down
 * ===================================================================== */
/**
 * `data/` is not all editions. `digest-2026-09-10.json` is an older shape that
 * still carries a date and an edition number, so a name check alone would let
 * it in and `toStory` would then read `.clusters` off undefined at module
 * scope — which is a build that fails, not a page that misses. Fed straight to
 * the real `buildArchive` rather than described.
 */
{
  const oldShape = JSON.parse(readFileSync(`${DATA}/digest-2026-09-10.json`, "utf8"));
  const health = JSON.parse(readFileSync(`${DATA}/source-health.json`, "utf8"));
  /*
   * The newest dated edition, found rather than named. Pinned to a literal
   * filename this fixture went stale the morning after it was written: the
   * copy test pairs it with `edition-latest.json` and asserts the archive
   * collapses the two into one edition, which is only true when they are the
   * same day. Against a newer `latest` it saw two editions and 106 stories and
   * reported a fault in code that was fine.
   */
  const good = {
    [`data/edition-${latestRaw.date}.json`]: read(`edition-${latestRaw.date}.json`),
  };

  const cases: [string, Record<string, unknown>][] = [
    ["oldDigestShape", { "data/digest-2026-09-10.json": oldShape }],
    ["sourceHealth", { "data/source-health.json": health }],
    ["oldShapeRenamed", { "data/edition-2026-09-10.json": oldShape }],
    ["truncated", { "data/edition-2026-09-20.json": { date: "2026-09-20", edition: 157 } }],
    ["emptyClusters", { "data/edition-2026-09-20.json": { date: "2026-09-20", edition: 157, clusters: [] } }],
    ["clusterWithNoId", { "data/edition-2026-09-20.json": { date: "2026-09-20", edition: 157, clusters: [{ articles: [] }] } }],
    ["badDate", { "data/edition-2026-09-20.json": { date: "not a day", edition: 157, clusters: [{ id: "x", articles: [] }] } }],
    ["nullModule", { "data/edition-2026-09-20.json": null }],
    ["readme", { "data/README.md": "hello" }],
  ];

  for (const [name, bad] of cases) {
    let built: { editions: unknown[]; printings: unknown[] } | null = null;
    try {
      built = buildArchive({ ...good, ...bad }) as { editions: unknown[]; printings: unknown[] };
    } catch (err) {
      ok(`ignore.${name}.noThrow`, false, `threw: ${String(err)}`);
      continue;
    }
    ok(
      `ignore.${name}`,
      built.editions.length === 1 && built.printings.length === 54,
      `${built.editions.length} editions and ${built.printings.length} stories — the good edition alone is 1 and 54`
    );
  }

  // An archive with nothing in it must be empty, not a crash. A build that
  // cannot find its data should print an empty paper and say so, not 500.
  ok("ignore.nothingAtAll", (buildArchive({}) as { printings: unknown[] }).printings.length === 0);

  /**
   * And the copy does not double-count. Handed the newest dated file and
   * `edition-latest.json`, which are byte-identical today, the archive must
   * show one edition of 54 stories — not two of 108.
   */
  const withCopy = buildArchive({
    ...good,
    "data/edition-latest.json": latestRaw,
  }) as { editions: unknown[]; printings: { id: string }[] };
  ok("copy.oneEdition", withCopy.editions.length === 1, `${withCopy.editions.length}`);
  ok(
    "copy.noDupes",
    withCopy.printings.length === todayIds.length,
    `${withCopy.printings.length} stories, expected ${todayIds.length}`
  );
  ok(
    "copy.sameIds",
    withCopy.printings.map((p) => p.id).join(",") === todayIds.join(",")
  );

  /**
   * The copy also has to be able to stand in alone. That is the whole reason it
   * is imported: on the morning the press files a new edition and nobody has
   * added the import line, today's fifty-four front-page links must still
   * resolve rather than all becoming 404 at once.
   */
  const copyOnly = buildArchive({ "data/edition-latest.json": latestRaw }) as {
    editions: { date: string }[];
    printings: { id: string }[];
  };
  ok("copy.standsAlone", copyOnly.printings.length === 54, `${copyOnly.printings.length}`);
  ok("copy.carriesItsDate", copyOnly.editions[0]?.date === latestRaw.date, copyOnly.editions[0]?.date);
}

/* -- 10. latest-wins holds under either file order --------------------- */
// Object key order is not something to rely on, and the newest printing must
// win regardless of the order the modules happen to arrive in.
{
  const forwards = Object.fromEntries(raw.map((e) => [`data/${e.file}`, e]));
  const backwards = Object.fromEntries([...raw].reverse().map((e) => [`data/${e.file}`, e]));
  const idsOf = (m: Record<string, unknown>) =>
    (buildArchive(m) as { printings: { id: string; date: string }[] }).printings
      .map((p) => `${p.id}:${p.date}`)
      .sort()
      .join(",");
  ok("order.independent", idsOf(forwards) === idsOf(backwards), "resolution depends on key order");
}

const total =
  (getArchivePrintings() as unknown[]).length;
console.log(
  fails.length
    ? `ARCHIVE CHECKS FAILED (${fails.length}):\n  ${fails.slice(0, 40).join("\n  ")}`
    : `ALL ARCHIVE CHECKS PASSED — ${total} stories across ${getArchiveEditions().length} editions ` +
      `(${previouslyDead.length} of them previously 404), ` +
      `${(getPrerenderedStoryIds() as unknown[]).length} prerendered, ` +
      `${(sitemap() as unknown[]).length} sitemap URLs, today's ${todayIds.length} unchanged`
);
process.exitCode = fails.length ? 1 : 0;
