/**
 * The sitemap and robots.txt, checked.
 *
 * A sitemap fails silently. Nothing on the page looks wrong, the build passes,
 * and the only symptom is that Search Console quietly reports "Couldn't fetch"
 * or indexes ten URLs out of a hundred and ninety-six — weeks later. So the things asserted
 * here are the ones that would actually cost the paper its readers: a story
 * missing from the file, a story in it twice, a relative or localhost `<loc>`,
 * the literal `[id]` or the word `undefined` in a URL, a `<lastmod>` no crawler
 * can parse, and a robots.txt pointing at a different host from the sitemap it
 * advertises — which Google treats as a sitemap it may not trust.
 *
 * Run with plain `node sitemap.check.ts`.
 */

import { register } from "node:module";

const ROOT = new URL("../", import.meta.url).href;

/**
 * Teach plain `node` to read the app's own modules.
 *
 * app/sitemap.ts imports `@/lib/digest`, which imports
 * `@/data/edition-latest.json`; app/robots.ts imports `./sitemap`. That is
 * three things node cannot do unaided: resolve a bundler alias, import JSON
 * with no `with { type: "json" }` attribute, and resolve a specifier with no
 * file extension. A registered resolve hook supplies all three, which is what
 * lets this check exercise the real sitemap against the real edition rather
 * than a transcription of either. lib/briefing.ts records the alternative —
 * modules kept pure so node can load them unassisted — and that is not open to
 * the sitemap, whose whole job is to read the edition.
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
  // Anything this hook cannot actually find on disk is handed back rather than
  // forced, so a real resolution failure still reports itself as one.
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

const { default: sitemap } = await import(`${ROOT}app/sitemap.ts`);
const { siteOrigin } = await import(`${ROOT}lib/site.ts`);
// A function, not a constant: a `const` would read the environment once
// at first import and no re-import could then observe a different one,
// which is exactly what the env cases below need to vary.
const SITE_ORIGIN = siteOrigin();
const { default: robots } = await import(`${ROOT}app/robots.ts`);
const { getDigest, getAllStoryIds, getSectionIndex } = await import(
  `${ROOT}lib/digest.ts`
);
/**
 * The sitemap's story list moved from today's edition to the archive.
 *
 * Three assertions below were written when `<loc>` meant "in today's paper"
 * and had to be re-aimed: the two counts, and `<lastmod>`, which is now the
 * edition that printed each story rather than today on all of them. That was
 * the point of the change — 131 of the 185 stories were being stamped as
 * modified this morning when they were set days ago. Everything else in this
 * file is untouched and still holds over a file three times the length:
 * absolute https URLs on one host, no duplicates, nothing unrendered, the
 * desks matching what the build produced, and robots.txt agreeing.
 *
 * archive.check.ts is where the archive itself is checked.
 */
const { getArchivePrintings } = await import(`${ROOT}lib/archive.ts`);
const { sectionSlug } = await import(`${ROOT}lib/search.ts`);

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} ${d}`); };

const entries = sitemap();
const urls = entries.map((e: { url: string }) => e.url);
const digest = getDigest();
const ids: string[] = getAllStoryIds();
const sections = getSectionIndex();
const printings: { id: string; date: string }[] = getArchivePrintings();
/** Every story URL the route will answer for, and the day it was printed. */
const printedOn = new Map(printings.map((p) => [p.id, p.date]));

/* -- 1. the count is the archive's count ------------------------------- */

const STANDING = 4; // home, /briefing, /search, /yours
ok(
  "count.total",
  entries.length === STANDING + sections.length + printings.length,
  `got ${entries.length}, expected ${STANDING + sections.length + printings.length}`
);
const storyUrls = urls.filter((u: string) => u.includes("/story/"));
ok(
  "count.stories",
  storyUrls.length === printings.length,
  `${storyUrls.length} story URLs against ${printings.length} stories the paper has printed`
);
// Today's edition must still be a subset of it — a sitemap that covered the
// archive and dropped the paper on sale would pass every count above.
for (const id of ids)
  ok(`count.todayIncluded.${id}`, printedOn.has(id), "today's story is not in the archive");
// The edition file is the authority on both numbers; if the digest ever stopped
// agreeing with it, every count above would be checking one copy against
// itself.
ok("count.editionIsFiftyFour", ids.length === digest.stories.length, `${ids.length}`);

/* -- 2. every story exactly once --------------------------------------- */
// Over the whole archive, not just today: an id printed on three mornings is
// still one page and must still be one `<loc>`.

for (const id of printings.map((p) => p.id)) {
  const hits = urls.filter((u: string) => u.endsWith(`/story/${id}`));
  ok(`story.${id}`, hits.length === 1, `appears ${hits.length} times`);
}

/* -- 3. no duplicate URLs anywhere ------------------------------------- */
// Two `<loc>` entries for one page is the failure a spread operator over three
// lists invites, and Google reports it as a warning nobody reads.
{
  const seen = new Set<string>();
  const dupes = urls.filter((u: string) => (seen.has(u) ? true : (seen.add(u), false)));
  ok("unique.all", dupes.length === 0, `duplicated: ${dupes.join(", ")}`);
}

/* -- 4. absolute, https, one host, no doubled slash -------------------- */
// The protocol has no notion of a relative `<loc>`; a crawler handed
// "/story/abc" has nothing to resolve it against and drops the entry.
for (const u of urls) {
  let parsed: URL | null = null;
  try {
    parsed = new URL(u);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    ok(`url.parses.${u}`, false, "not a URL at all");
    continue;
  }
  ok(`url.https.${u}`, parsed.protocol === "https:", `got ${parsed.protocol}`);
  ok(
    `url.host.${u}`,
    `${parsed.protocol}//${parsed.host}` === SITE_ORIGIN,
    `host ${parsed.host} is not ${SITE_ORIGIN}`
  );
  ok(`url.noDoubleSlash.${u}`, !parsed.pathname.includes("//"), parsed.pathname);
}

/* -- 5. nothing unrendered in a URL ------------------------------------ */
/**
 * The failure this catches is a template that reached the file with a hole in
 * it: `/story/undefined` from a missing id, or the literal `/story/[id]` from
 * enumerating the route instead of its params. Both are URLs that parse, that
 * are https, and that 404 on all hundred and ninety-six crawls.
 */
for (const u of urls) {
  for (const bad of ["undefined", "null", "NaN", "[", "]", "%5B"]) {
    ok(`url.clean.${u}`, !u.includes(bad), `contains ${bad}`);
  }
}

/* -- 6. lastModified is a date, and it is the edition's date ----------- */

const editionDay = digest.date; // "2026-09-18"
for (const e of entries as { url: string; lastModified?: string | Date }[]) {
  const when = e.lastModified;
  ok(`lastmod.present.${e.url}`, when !== undefined);
  const parsed = when instanceof Date ? when : new Date(String(when));
  const valid = Number.isFinite(parsed.getTime());
  ok(`lastmod.valid.${e.url}`, valid, String(when));
  // Guarded, because `new Date("not a date").toISOString()` throws rather than
  // returning anything — which it did, and took the whole run down with it
  // instead of reporting one bad stamp among a hundred and ninety-six.
  if (!valid) continue;
  /**
   * Pinned to UTC on purpose, so the stamp does not slide a day west of
   * Greenwich. Asserted as the UTC calendar day rather than as a string, which
   * is the thing that would have caught `T00:00:00` without the Z.
   *
   * A story is stamped with the edition that printed it; everything else — the
   * front page, the desks, the index, the reader's own cut — is re-typeset
   * nightly and so is genuinely today's.
   */
  const storyId = e.url.includes("/story/") ? e.url.split("/story/")[1] : null;
  const expected = storyId ? printedOn.get(storyId) : editionDay;
  ok(
    `lastmod.editionDay.${e.url}`,
    parsed.toISOString().startsWith(String(expected)),
    `${parsed.toISOString()} is not ${expected}`
  );
}

/* -- 7. changeFrequency and priority say something sensible ----------- */

type Entry = {
  url: string;
  changeFrequency?: string;
  priority?: number;
};
const byUrl = new Map<string, Entry>((entries as Entry[]).map((e) => [e.url, e]));

const home = byUrl.get(`${SITE_ORIGIN}/`);
ok("front.present", home !== undefined, "the front page is not in the sitemap");
ok("front.daily", home?.changeFrequency === "daily", String(home?.changeFrequency));
ok("front.priority", home?.priority === 1, String(home?.priority));

// A printed column does not change. Telling a crawler otherwise invites it to
// re-fetch fifty-four static pages daily for nothing.
for (const u of storyUrls) {
  ok(`story.never.${u}`, byUrl.get(u)?.changeFrequency === "never", String(byUrl.get(u)?.changeFrequency));
}

for (const e of entries as Entry[]) {
  ok(
    `priority.range.${e.url}`,
    typeof e.priority === "number" && e.priority > 0 && e.priority <= 1,
    String(e.priority)
  );
}

/* -- 8. the desks in the file are the desks that exist today ----------- */
/**
 * The sitemap and app/section/[slug]/page.tsx read the same
 * `getSectionIndex`, so this asserts the reuse rather than the arithmetic: a
 * second hand-written list of sections would pass every check above and still
 * advertise a desk the build never prerendered. Sections are decided by what
 * the wire brought in, so the list is different on different mornings.
 */
{
  const inFile = urls
    .filter((u: string) => u.includes("/section/"))
    .map((u: string) => u.split("/section/")[1])
    .sort();
  const expected = sections
    .map((s: { section: string }) => sectionSlug(s.section))
    .sort();
  ok(
    "sections.match",
    inFile.join(",") === expected.join(","),
    `${inFile.join(",")} against ${expected.join(",")}`
  );
  ok("sections.some", expected.length > 0, "an edition with no desks at all");
}

/* -- 9. robots.txt agrees with the sitemap ----------------------------- */

const r = robots();
const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
ok("robots.allEmpty", rules?.userAgent === "*", String(rules?.userAgent));
ok("robots.allows", rules?.allow === "/", String(rules?.allow));
ok(
  "robots.noDisallow",
  rules?.disallow === undefined,
  `nothing in this paper is private, yet: ${String(rules?.disallow)}`
);
ok(
  "robots.sitemap",
  r.sitemap === `${SITE_ORIGIN}/sitemap.xml`,
  `${String(r.sitemap)} against ${SITE_ORIGIN}/sitemap.xml`
);
// A sitemap reference on a different host is one Google will not trust, and it
// is exactly what two independent copies of the origin would eventually give.
ok(
  "robots.sameHost",
  new URL(String(r.sitemap)).host === new URL(SITE_ORIGIN).host
);

/* -- 10. the origin follows the environment --------------------------- */
/**
 * `metadataBase`, the `<loc>` entries and the `Sitemap:` line all come from one
 * constant read at module scope, so this reloads the module under a different
 * environment to prove the variable actually reaches the URLs — and that a
 * value saved with a trailing slash does not arrive as `https://host//story`.
 * The query string is only there to defeat the module cache.
 */
{
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000/";
    const fresh = await import(`${ROOT}app/sitemap.ts?env=1`);
    const local: string[] = fresh.default().map((e: { url: string }) => e.url);
    ok("env.origin", siteOrigin() === "http://localhost:3000", siteOrigin());
    ok(
      "env.reachesUrls",
      local.every((u) => u.startsWith("http://localhost:3000/")),
      local.find((u) => !u.startsWith("http://localhost:3000/")) ?? ""
    );
    ok(
      "env.trailingSlashTrimmed",
      local.every((u) => !new URL(u).pathname.includes("//")),
      local.find((u) => new URL(u).pathname.includes("//")) ?? ""
    );
    ok("env.countUnchanged", local.length === entries.length);

    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    const blank = await import(`${ROOT}app/sitemap.ts?env=2`);
    ok(
      "env.blankIsUnset",
      siteOrigin() === "https://ai-daily-umber.vercel.app",
      `a variable saved as whitespace must not become the origin: ${siteOrigin()}`
    );
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
}

console.log(
  fails.length
    ? `SITEMAP CHECKS FAILED (${fails.length}):\n  ${fails.slice(0, 40).join("\n  ")}`
    : `ALL SITEMAP CHECKS PASSED — ${entries.length} URLs (${printings.length} stories, ${ids.length} of them in today's edition, ${sections.length} desks, ${STANDING} standing), lastmod ${editionDay} on today's paper and its own edition on each story, origin ${SITE_ORIGIN}`
);
process.exitCode = fails.length ? 1 : 0;
