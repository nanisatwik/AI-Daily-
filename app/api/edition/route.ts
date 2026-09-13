import {
  getDigest,
  getBrief,
  getSectionIndex,
  getSourceIndex,
} from "@/lib/digest";

/**
 * The whole edition, as one JSON document.
 *
 * force-static means this is baked at build time and served from the CDN as a
 * file — no function invocation, no cold start, no per-request cost. It is the
 * same deploy the website rides on, so adding mobile clients costs nothing.
 *
 * Deliberately not a query API. A day's paper is two dozen events; shipping the
 * lot in one request and filtering on the device is faster than any round trip
 * and removes an entire tier of infrastructure. Revisit only if an edition ever
 * grows past a few hundred KB.
 */
export const dynamic = "force-static";

export async function GET() {
  const digest = getDigest();

  const stories = digest.stories.map((s) => {
    const brief = getBrief(s.id);
    return {
      id: s.id,
      headline: s.headline,
      deck: s.deck,
      body: s.body,
      section: s.section,
      publishedAt: s.publishedAt,
      // How many outlets carried it — the corroboration signal the paper
      // prints as tally marks, and the field to rank by on a client.
      sourceCount: new Set(s.sources.map((x) => x.name)).size,
      sources: s.sources,
      url: `/story/${s.id}`,
      brief: brief
        ? {
            provenance: brief.model.startsWith("extractive")
              ? "compiled-from-sources"
              : "machine-written",
            method: brief.model,
            tldr: brief.tldr,
            keyPoints: brief.keyPoints,
            whyItMatters: brief.whyItMatters,
            whoIsAffected: brief.whoIsAffected,
          }
        : null,
    };
  });

  return Response.json(
    {
      edition: {
        number: digest.edition,
        date: digest.date,
        itemsIngested: digest.totalItems,
        eventsPublished: stories.length,
      },
      sections: getSectionIndex(),
      publishers: getSourceIndex(),
      stories,
      // Clients must be able to tell reporting from generated text without
      // reading the docs, so provenance travels with the payload.
      notice:
        "Headlines, decks and sources are as filed by the publishers named. Any brief marked compiled-from-sources is publishers' own sentences, selected; one marked machine-written is model output. Neither is original reporting.",
    },
    {
      headers: {
        // Public, immutable for the day: a phone app, another site, or a
        // script can all read it without a key.
        "cache-control": "public, max-age=1800, s-maxage=3600",
        "access-control-allow-origin": "*",
      },
    }
  );
}
