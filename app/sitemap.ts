import type { MetadataRoute } from "next";
import { getDigest, getSectionIndex } from "@/lib/digest";
import { getArchivePrintings } from "@/lib/archive";
import { sectionSlug } from "@/lib/search";
import { siteOrigin } from "@/lib/site";

/**
 * Every route the paper prints, so a crawler can find the hundred and
 * eighty-five story pages without walking the paper by hand.
 *
 * Slugs and ids are read through the very functions the routes use for their
 * own `generateStaticParams` — `getSectionIndex`, and `getArchivePrintings`,
 * from which app/story/[id]/page.tsx takes its prerender window — so the
 * sitemap cannot advertise a URL the route will not answer, nor miss one it
 * would. A second copy of "which desks exist today" would drift the first
 * morning the wire brought in a section nobody expected, and the sections are
 * decided by what arrives rather than by a fixed list.
 *
 * The story list is the archive rather than today's edition, and that is the
 * point of this revision. Advertising the fifty-four ids in `edition-latest`
 * was advertising a set that measurably does not survive the night — 2 of 54
 * ids carried over from 2026-09-17 to 2026-09-18 — so a crawler was handed
 * fifty-two fresh URLs a day and fifty-two fresh 404s the day after. It also
 * hid 131 pages the paper had genuinely printed. Not every one of these is
 * prerendered now; they are all served, the older ones rendered on first
 * request and then cached, which is the property `<loc>` actually asks about.
 *
 * `lastModified` is the edition that printed the story, not today. A nightly
 * run re-typesets today's paper, so today's date is honest for the front page
 * and the desks; it is a lie about a column set six mornings ago, and it is the
 * particular lie that teaches a crawler to stop believing `<lastmod>` on this
 * host. A story's own `publishedAt` is when the wire last carried the event,
 * which is a third fact and not the one being asked for. The `Z` is
 * deliberate: `${date}T00:00:00`, the form lib/digest.ts uses for the printed
 * dateline, is local midnight, and the press and Vercel's builders do not share
 * a time zone — unpinned, the same edition would be stamped a day early west of
 * Greenwich.
 *
 * `changeFrequency` says what it means. The front page and the desks are a new
 * paper every morning; a story page is a printed column, its headline, deck and
 * credits fixed by the run that set them, so `never` tells a crawler it may
 * index one once and keep it. That is most of the value of this file, since a
 * hundred and eighty-five of the hundred and ninety-six URLs are stories.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const digest = getDigest();
  // Read once per render, so every URL in one sitemap names one host.
  const SITE_ORIGIN = siteOrigin();
  const lastModified = new Date(`${digest.date}T00:00:00Z`);

  /**
   * Priority is only ever read as a ranking inside one site, so it is set in
   * the order a reader would want these: the front page first, then a story,
   * then the desk that collects stories, and last the index and the reader's
   * own cut — tools for getting about the paper rather than things to read.
   * /api/edition is absent on purpose: it is a data endpoint, not a page
   * anybody could land on.
   */
  const standing: MetadataRoute.Sitemap = [
    {
      url: `${SITE_ORIGIN}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_ORIGIN}/briefing`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_ORIGIN}/search`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.4,
    },
    {
      url: `${SITE_ORIGIN}/yours`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.3,
    },
  ];

  const sections: MetadataRoute.Sitemap = getSectionIndex().map(({ section }) => ({
    url: `${SITE_ORIGIN}/section/${sectionSlug(section)}`,
    lastModified,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  /**
   * One entry per id, stamped with the edition that printed it.
   *
   * `getArchivePrintings` already resolves an id that ran on several mornings
   * to its latest appearance — 44 of the 185 did — so the list is one URL per
   * story by construction and needs no deduplication here.
   *
   * Today's fifty-four keep `priority` 0.7 and the rest drop to 0.5. Priority
   * is only ever read as a ranking inside one site, and this is the true
   * ranking: an archived column is worth indexing and worth keeping, but if a
   * crawler has budget for part of this paper it should spend it on the paper
   * that is on sale.
   */
  const stories: MetadataRoute.Sitemap = getArchivePrintings().map(
    ({ id, date }) => ({
      url: `${SITE_ORIGIN}/story/${id}`,
      lastModified: new Date(`${date}T00:00:00Z`),
      changeFrequency: "never",
      priority: date === digest.date ? 0.7 : 0.5,
    })
  );

  return [...standing, ...sections, ...stories];
}
