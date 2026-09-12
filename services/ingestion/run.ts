/**
 * Ingestion entry point. Fetches every permitted feed, normalises, clusters
 * near-duplicate coverage into events, ranks editorially, and writes a dated
 * edition the frontend reads at build time.
 *
 *   node services/ingestion/run.ts
 */

import { writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Article, Edition } from "../../lib/types.ts";
import { FEEDS } from "./sources.ts";
import {
  fetchFeed,
  normalize,
  clusterArticles,
  rank,
  isAiRelevant,
} from "./pipeline.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(ROOT, "data");
/** Anything older than this is not today's news. */
const MAX_AGE_HOURS = 72;
const MAX_EVENTS = 24;
/**
 * No single publisher may dominate an edition. arXiv alone files hundreds of
 * preprints a day; left uncapped it buries every other source and leaves
 * nothing for the clustering step to corroborate against.
 */
const MAX_PER_SOURCE = 30;

const trustOf = (sourceId: string) =>
  FEEDS.find((f) => f.source.id === sourceId)?.source.trust ?? 0.5;

async function nextEditionNumber(): Promise<number> {
  try {
    const files = await readdir(DATA_DIR);
    const editions = files.filter((f) => /^edition-.*\.json$/.test(f));
    return 148 + editions.length;
  } catch {
    return 148;
  }
}

async function main() {
  const started = Date.now();
  console.log(`Ingesting ${FEEDS.length} feeds...`);

  const results = await Promise.allSettled(FEEDS.map((f) => fetchFeed(f)));

  const raw = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const name = FEEDS[i].source.name;
    if (r.status === "fulfilled") {
      console.log(`  ok    ${name.padEnd(24)} ${r.value.length} items`);
      raw.push(...r.value);
    } else {
      // One dead feed must never take down the edition.
      console.log(`  FAIL  ${name.padEnd(24)} ${r.reason?.message ?? r.reason}`);
    }
  }

  const cutoff = Date.now() - MAX_AGE_HOURS * 3_600_000;

  const onTopic = raw.filter(isAiRelevant);
  const dated = onTopic
    .map(normalize)
    .filter((a): a is Article => a !== null)
    .filter((a) => Date.parse(a.publishedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  // Newest N per publisher, so one prolific feed cannot own the edition.
  const perSource = new Map<string, number>();
  const articles: Article[] = dated.filter((a) => {
    const n = perSource.get(a.sourceId) ?? 0;
    if (n >= MAX_PER_SOURCE) return false;
    perSource.set(a.sourceId, n + 1);
    return true;
  });

  console.log(
    `\n${raw.length} ingested → ${onTopic.length} on-topic → ${dated.length} dated within ${MAX_AGE_HOURS}h → ${articles.length} after per-source cap`
  );

  const clusters = rank(clusterArticles(articles), trustOf);
  const published = clusters.slice(0, MAX_EVENTS);

  const merged = clusters.filter((c) => c.articles.length > 1).length;
  console.log(
    `${clusters.length} distinct events (${merged} had corroborating coverage), publishing top ${published.length}`
  );

  const date = new Date().toISOString().slice(0, 10);
  const edition: Edition = {
    date,
    edition: await nextEditionNumber(),
    itemsIngested: raw.length,
    eventsPublished: published.length,
    generatedAt: new Date().toISOString(),
    clusters: published,
    aiArtifacts: [],
  };

  await mkdir(DATA_DIR, { recursive: true });
  const out = join(DATA_DIR, `edition-${date}.json`);
  await writeFile(out, JSON.stringify(edition, null, 2), "utf8");
  await writeFile(
    join(DATA_DIR, "edition-latest.json"),
    JSON.stringify(edition, null, 2),
    "utf8"
  );

  console.log(`\nWrote ${out} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log("\nTop 5 by editorial score:");
  for (const c of published.slice(0, 5)) {
    const outlets = new Set(c.articles.map((a) => a.sourceId)).size;
    console.log(
      `  ${c.score.toFixed(3)}  [${c.category}]  ${outlets} src  ${c.title.slice(0, 78)}`
    );
  }
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
