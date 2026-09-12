/**
 * Zero-cost briefing.
 *
 * No model, no API key, no bill — and no generated prose. Every line this
 * produces is a sentence a publisher actually filed, selected and attributed.
 *
 * The honest limit: this can tell a reader *what was reported* but not *why it
 * matters*. Analysis requires generation, and manufacturing it algorithmically
 * would be inventing editorial judgement and passing it off as reporting —
 * exactly what the blueprint's trust rules forbid. So those fields stay empty
 * here rather than being faked.
 *
 *   node services/ai/extractive.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { AiArtifact, Edition, EventCluster } from "../../lib/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EDITION = join(ROOT, "data", "edition-latest.json");
const METHOD = "extractive-v1";

const STOP = new Set([
  "a","an","the","and","or","but","of","to","in","on","for","with","at","by",
  "from","as","is","are","was","were","be","been","it","its","this","that",
  "these","those","has","have","had","will","would","can","could","may","said",
  "says","also","more","than","which","who","what","when","after","over","into",
]);

type Candidate = {
  text: string;
  source: string;
  /** Position within its own report; openers carry the news. */
  rank: number;
  score: number;
};

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Overlap on content words; used to keep the points from repeating. */
function similar(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

function collect(cluster: EventCluster): Candidate[] {
  // Terms the whole cluster agrees on — the substance of the event.
  const salient = new Map<string, number>();
  for (const a of cluster.articles) {
    for (const w of new Set(words(`${a.title} ${a.summary}`))) {
      salient.set(w, (salient.get(w) ?? 0) + 1);
    }
  }

  const out: Candidate[] = [];
  for (const article of cluster.articles) {
    sentences(article.summary).forEach((text, rank) => {
      const n = text.length;
      // Fragments carry no news; paragraphs are not a point.
      if (n < 45 || n > 300) return;
      // Feed boilerplate.
      if (/(read more|continue reading|subscribe|click here|\[…\]|\.\.\.$)/i.test(text))
        return;

      const ws = words(text);
      if (ws.length < 6) return;

      const salience =
        ws.reduce((sum, w) => sum + (salient.get(w) ?? 0), 0) / ws.length;
      const position = 1 / (1 + rank * 0.6);
      // Favour sentences in the 90–200 char band: a full thought, not a wall.
      const shape = 1 - Math.abs(n - 145) / 320;

      out.push({
        text,
        source: article.sourceName,
        rank,
        score: salience * 0.55 + position * 0.3 + shape * 0.15,
      });
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function brief(cluster: EventCluster): AiArtifact[] {
  const candidates = collect(cluster);
  if (candidates.length === 0) return [];

  const lead = candidates[0];

  const points: Candidate[] = [];
  const used = new Set<string>();
  const distinct = (c: Candidate) =>
    !points.some((p) => similar(p.text, c.text) > 0.5);

  // The lead sentence is already the standfirst; repeating it as the first key
  // point wastes the reader's time and makes the panel look automated.
  const rest = candidates.filter(
    (c) => c !== lead && similar(c.text, lead.text) <= 0.5
  );

  // Pass one: the strongest sentence from each publisher, so a cluster covered
  // by several outlets reads as several outlets.
  for (const c of rest) {
    if (points.length >= 4) break;
    if (used.has(c.source) || !distinct(c)) continue;
    points.push(c);
    used.add(c.source);
  }

  // Pass two: fill from whatever is left, repeat publishers included. Without
  // this a single-source cluster could never reach a second point at all.
  for (const c of rest) {
    if (points.length >= 4) break;
    if (points.includes(c) || !distinct(c)) continue;
    points.push(c);
  }

  // A brief is only worth printing when it says more than the deck already
  // does: either several outlets, or at least one further distinct sentence.
  const outlets = new Set(cluster.articles.map((a) => a.sourceName)).size;
  if (outlets < 2 && points.length < 1) return [];

  const now = new Date().toISOString();
  const base = {
    clusterId: cluster.id,
    language: "en",
    model: METHOD,
    createdAt: now,
  };
  const id = (salt: string) =>
    createHash("sha1").update(cluster.id + salt).digest("hex").slice(0, 16);

  return [
    { id: id("tldr"), type: "tldr", content: `${lead.text} — ${lead.source}`, ...base },
    {
      id: id("points"),
      type: "key_points",
      content: points.map((p) => `${p.text} — ${p.source}`),
      ...base,
    },
  ];
}

async function main() {
  const edition: Edition = JSON.parse(await readFile(EDITION, "utf8"));
  console.log(
    `Compiling briefs for ${edition.clusters.length} events, edition ${edition.edition}`
  );

  const artifacts: AiArtifact[] = [];
  let thin = 0;

  for (const cluster of edition.clusters) {
    const made = brief(cluster);
    if (made.length === 0) thin++;
    artifacts.push(...made);
  }

  edition.aiArtifacts = artifacts;
  await writeFile(EDITION, JSON.stringify(edition, null, 2), "utf8");
  await writeFile(
    join(ROOT, "data", `edition-${edition.date}.json`),
    JSON.stringify(edition, null, 2),
    "utf8"
  );

  console.log(
    `${edition.clusters.length - thin} briefed, ${thin} too thin to brief — $0.00 spent`
  );
}

main().catch((err) => {
  console.error("Briefing failed:", err);
  process.exit(1);
});
