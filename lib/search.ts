/**
 * Search over the edition — blueprint section 17: "Search handles titles,
 * topics, entities and source filters."
 *
 * Runs entirely in the browser over an index built at compile time. No search
 * server, no query API, no running cost — which is what keeps the whole thing
 * deployable on a free tier.
 */

export type SearchDoc = {
  id: string;
  headline: string;
  deck: string;
  section: string;
  sources: string[];
  tags: string[];
  publishedAt: string;
  sourceCount: number;
};

export type SearchHit = SearchDoc & { score: number; matched: string[] };

const STOP = new Set([
  "a","an","the","and","or","but","of","to","in","on","for","with","at","by",
  "from","as","is","are","was","were","be","it","its","this","that","what",
  "how","why","when","who",
]);

export function terms(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * Field-weighted match. A term in the headline counts for far more than the
 * same term buried in a deck, and an exact phrase outranks scattered words —
 * so "open source" finds the open-source story, not every story with "open".
 */
export function search(
  docs: SearchDoc[],
  query: string,
  filters: { section?: string; source?: string } = {}
): SearchHit[] {
  const scoped = docs.filter(
    (d) =>
      (!filters.section || d.section === filters.section) &&
      (!filters.source || d.sources.includes(filters.source))
  );

  const q = query.trim().toLowerCase();
  const ts = terms(q);

  // No query: the filtered shelf, newest first.
  if (ts.length === 0) {
    return scoped
      .map((d) => ({ ...d, score: 0, matched: [] }))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }

  const hits: SearchHit[] = [];

  for (const doc of scoped) {
    const headline = doc.headline.toLowerCase();
    const deck = doc.deck.toLowerCase();
    const tags = doc.tags.join(" ").toLowerCase();
    const sources = doc.sources.join(" ").toLowerCase();

    let score = 0;
    const matched: string[] = [];

    for (const t of ts) {
      let termScore = 0;
      if (headline.includes(t)) termScore += 6;
      if (tags.includes(t)) termScore += 3;
      if (sources.includes(t)) termScore += 3;
      if (deck.includes(t)) termScore += 2;
      if (doc.section.toLowerCase().includes(t)) termScore += 2;

      if (termScore > 0) {
        score += termScore;
        matched.push(t);
      }
    }

    if (matched.length === 0) continue;

    // Every term present beats a partial match, and a literal phrase beats both.
    if (matched.length === ts.length) score *= 1.6;
    if (q.length > 3 && headline.includes(q)) score += 14;

    // Corroborated stories surface first when relevance is close.
    score += Math.min(doc.sourceCount, 5) * 0.6;

    hits.push({ ...doc, score, matched });
  }

  return hits.sort(
    (a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
  );
}

export function sectionSlug(section: string): string {
  return section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
