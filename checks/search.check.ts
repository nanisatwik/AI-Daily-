/**
 * The index reaches the archive.
 *
 * 237 stories have been printed and every one of them keeps its address, but
 * the index was built from `getDigest()` — today's edition — so 183 of them
 * were reachable and unfindable. A reader could only get to an archived column
 * by already knowing its URL, which is not an index.
 *
 * The other half of this is cost, and it is the reason the index is bounded.
 * The docs are shipped to the browser, because there is no server to search on.
 * Measured on the edition of 2026-09-19: 510 bytes a story, 118KB for the whole
 * archive today, and 9.6MB after a year of printing fifty-four a morning. So
 * the window is a constant next to the prerender window, and both growth
 * questions are answered in the same place.
 */

import { register } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The repository root, so this runs on any machine and on a CI runner. */
const REPO = fileURLToPath(new URL("..", import.meta.url));
const ROOT = new URL("../", import.meta.url).href;

/**
 * Teach plain `node` to read the app's own modules — the `@/` alias, JSON
 * without an import attribute, and extensionless specifiers. Same hook the
 * archive and sitemap suites register, for the same three reasons.
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

const { getArchiveSearchIndex, SEARCH_EDITIONS, getArchiveEditions } =
  await import(`${ROOT}lib/archive.ts`);
const { search } = await import(`${ROOT}lib/search.ts`);
const { getSearchIndex } = await import(`${ROOT}lib/digest.ts`);

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => {
  if (!c) fails.push(`${n} — ${d}`);
};

/* -- the editions on disk, read independently of the module ------------ */
const editions = readdirSync(`${REPO}data`)
  .filter((f) => /^edition-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(`${REPO}data/${f}`, "utf8")))
  .sort((a, b) => a.date.localeCompare(b.date));

const latest = editions[editions.length - 1];
const todayIds = new Set(latest.clusters.map((c: { id: string }) => c.id));

const docs = getArchiveSearchIndex();

/* -- 1. it is the archive, not today ----------------------------------- */
{
  const todayOnly = getSearchIndex().length;
  ok(
    "reachesBeyondToday",
    docs.length > todayOnly,
    `${docs.length} searchable against ${todayOnly} in today's paper — the index is still only today`
  );

  const archiveOnly = docs.filter((d: { id: string }) => !todayIds.has(d.id));
  ok(
    "archiveOnlyStoriesAreIndexed",
    archiveOnly.length > 0,
    "no story outside today's edition is in the index"
  );

  /*
   * The point of the whole story, stated as a search: take a column that is
   * NOT in today's paper and find it by its own headline. Before this change
   * every one of these returned nothing.
   */
  let found = 0;
  const sample = archiveOnly.slice(0, 12);
  for (const doc of sample as { id: string; headline: string }[]) {
    const hits = search(docs, doc.headline.slice(0, 40), {});
    if (hits.some((h: { id: string }) => h.id === doc.id)) found++;
  }
  ok(
    "archiveOnlyStoriesAreFindable",
    found === sample.length,
    `${found} of ${sample.length} archived columns were findable by their own headline`
  );
}

/* -- 2. every doc says which edition printed it ------------------------ */
{
  const dates = new Set(editions.map((e: { date: string }) => e.date));
  const bad = (docs as { id: string; date?: string; edition?: number }[]).filter(
    (d) => !d.date || !dates.has(d.date) || typeof d.edition !== "number"
  );
  ok(
    "everyDocCarriesItsPrinting",
    bad.length === 0,
    `${bad.length} docs with no printing, or one that is not an edition on disk`
  );

  ok(
    "printingsVary",
    new Set((docs as { date: string }[]).map((d) => d.date)).size > 1,
    "every doc claims the same edition, so the printing is not being read"
  );
}

/* -- 3. today outranks an older printing of the same thing ------------- */
{
  /*
   * A term both a today column and an archived one match. Section names are
   * the reliable one: they are printed on every column and repeat across
   * mornings. A reader searching "policy" wants this morning's policy first.
   */
  const hits = search(docs, latest.clusters[0].category, {});
  ok("rankingReturnsSomething", hits.length > 1, `${hits.length} hits`);

  /*
   * Relevance first, recency as the tiebreak — NOT "everything from today
   * before anything older".
   *
   * The first version of this asserted the stronger thing, and the stronger
   * thing is wrong: it would bury an exact match on an archived headline under
   * every weak match from this morning, so a reader who typed an old headline
   * verbatim would not find it. What must hold is that two columns matching a
   * term equally well are ordered newest paper first.
   */
  let outOfOrder = 0;
  for (let i = 1; i < hits.length; i++) {
    const prev = hits[i - 1] as { score: number; date: string };
    const here = hits[i] as { score: number; date: string };
    if (prev.score === here.score && here.date > prev.date) outOfOrder++;
  }
  ok(
    "equalRelevanceIsNewestFirst",
    outOfOrder === 0,
    `${outOfOrder} pairs scored the same with the older paper placed first`
  );

  /*
   * And the tiebreak has to be doing something: if every hit on this term were
   * from one morning, the assertion above would pass while proving nothing.
   */
  const spread = new Set((hits as { date: string }[]).map((h) => h.date)).size;
  ok("rankingSpansEditions", spread > 1, `every hit came from one edition (${spread})`);
}

/* -- 4. the window is real, and the growth is bounded ------------------ */
{
  ok(
    "windowIsANumber",
    typeof SEARCH_EDITIONS === "number" && SEARCH_EDITIONS > 0,
    `got ${SEARCH_EDITIONS}`
  );

  const onFile = getArchiveEditions().length;
  const expected = editions
    .slice(-SEARCH_EDITIONS)
    .reduce(
      (set: Set<string>, e: { clusters: { id: string }[] }) => {
        for (const c of e.clusters) set.add(c.id);
        return set;
      },
      new Set<string>()
    ).size;

  ok(
    "windowMatchesTheEditions",
    docs.length === expected,
    `${docs.length} indexed, expected ${expected} from the newest ${SEARCH_EDITIONS} of ${onFile} editions`
  );

  /*
   * And it has to actually bound something eventually. A window wider than
   * any plausible archive is a window in name only — the payload measured at
   * 510 bytes a story, so a year unbounded is 9.6MB in the reader's browser.
   */
  ok(
    "windowWouldBite",
    SEARCH_EDITIONS <= 60,
    `${SEARCH_EDITIONS} editions is ${(SEARCH_EDITIONS * 54 * 510) / 1024 / 1024} MB at today's rate — too much to ship`
  );
}

console.log(
  fails.length
    ? `SEARCH CHECKS FAILED (${fails.length}):\n  ${fails.join("\n  ")}`
    : `ALL SEARCH CHECKS PASSED — ${docs.length} columns searchable across ${Math.min(
        SEARCH_EDITIONS,
        getArchiveEditions().length
      )} editions`
);
process.exitCode = fails.length ? 1 : 0;
