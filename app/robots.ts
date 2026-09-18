import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

/**
 * Nothing in this paper is private, so the rules are the short ones.
 *
 * The file exists for its last line rather than its first. Every story page is
 * reachable by hand — the front page carries twenty-three of the fifty-four and
 * the desks carry the rest — but reachable is not the same as enumerated: a
 * crawler has to walk seven section pages to discover the other thirty-one, and
 * it learns nothing about when they were set. The archive is not walkable by
 * hand at all: every story the paper has printed keeps its address, and no page
 * links to the hundred and thirty-one of them that are no longer in today's
 * edition. The `Sitemap:` line hands over all hundred and ninety-six URLs with
 * the edition each was printed in attached.
 *
 * The origin comes from lib/site.ts rather than being written again here,
 * because a robots.txt advertising one host and a sitemap listing another is
 * the one way this pair can fail: Google reads a cross-host sitemap reference
 * as a sitemap it is not allowed to trust.
 *
 * /api/edition is left crawlable deliberately. It serves the same edition the
 * pages are typeset from, there is nothing in it a reader cannot already see,
 * and disallowing it would only invite the guess that something there is
 * sensitive.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
