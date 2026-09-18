/**
 * Where this paper actually lives, as an absolute origin.
 *
 * This began in app/sitemap.ts, which is the file that cannot do without it,
 * and moved here once app/layout.tsx needed it for `metadataBase`: importing
 * it from the sitemap route meant the root layout of every page in the paper
 * depended on a route, and once that route grew an import of lib/archive.ts it
 * meant pulling all six committed editions into the layout's module graph to
 * read one string. This file has no imports at all, on purpose.
 *
 * The sitemap is the one file in the app that cannot use a relative path: the
 * protocol asks for a fully qualified `<loc>`, and a crawler handed
 * `/story/dec28f19389b0566` has nothing to resolve it against. So the origin is
 * settled here and shared with app/sitemap.ts, app/robots.ts and the
 * `metadataBase` in app/layout.tsx, which need the same answer and must not be
 * able to disagree with it — a robots.txt pointing at one host and a sitemap listing another is
 * a sitemap Google refuses.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL`, not `VERCEL_URL`: the latter is the
 * per-deployment hostname and changes on every push, so a sitemap built from it
 * would advertise a hundred and ninety-six URLs on a host that stops being
 * canonical the moment the next commit lands. The literal is the last resort
 * rather than localhost, because a build with no environment should still emit
 * a usable sitemap — a hundred and ninety-six localhost URLs are worse than
 * none at all. Set NEXT_PUBLIC_SITE_URL to aim a local build at itself.
 *
 * Blank counts as unset and a trailing slash is cut, the same discipline
 * services/ai/provider.ts applies to its keys: a variable saved as a stray
 * newline would otherwise reach the XML as an origin of nothing, and one saved
 * as "https://host/" as `https://host//story/...`.
 *
 * A function rather than a constant, which matters for one reason: a `const`
 * reads the environment once, when whichever module imported it first was
 * loaded. In Next that is harmless — the environment is settled long before a
 * route renders — but it makes the value impossible to exercise, because once
 * anything has imported this file no re-import can observe a different
 * environment, and the sitemap's URLs cannot be re-derived to check that they
 * followed. Reading it per call costs nothing and keeps it testable.
 */
export function siteOrigin(): string {
  return (
    (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : "https://ai-daily-umber.vercel.app")
  ).replace(/\/+$/, "");
}
