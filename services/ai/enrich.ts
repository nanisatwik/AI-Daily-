/**
 * AI enrichment — blueprint section 12.
 *
 * Reads the published edition and generates, per event cluster: a TL;DR, key
 * points, why it matters, and who is affected.
 *
 * Two rules govern this file, both from the blueprint's trust requirements:
 *
 *   1. Retrieval before generation. The model is given only the headlines and
 *      standfirsts the publishers actually filed. It is never asked what it
 *      knows about the news, so it has nothing to invent from.
 *   2. Artifacts are stored apart from source data, never merged into it. That
 *      is what lets the UI label them honestly and lets us regenerate them
 *      without touching a word any publisher wrote.
 *
 *   node services/ai/enrich.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AiArtifact, Edition, EventCluster } from "../../lib/types.ts";

const MODEL = "claude-opus-5";
/**
 * Summarising supplied text is not intelligence-sensitive work, and this runs
 * over every cluster every day. `low` keeps the thinking budget — and the bill
 * — down. Raise it if the copy starts reading thin.
 */
const EFFORT = "low" as const;
/** Polite to the API and keeps a failure from taking the whole edition down. */
const CONCURRENCY = 4;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EDITION = join(ROOT, "data", "edition-latest.json");

const Brief = z.object({
  tldr: z.string().describe("One sentence, under 30 words, plain language."),
  keyPoints: z
    .array(z.string())
    .describe("Three to five points, each one line, drawn only from the sources."),
  whyItMatters: z
    .string()
    .describe("Two sentences on the consequence. No speculation beyond the sources."),
  whoIsAffected: z
    .string()
    .describe("One sentence naming who this lands on."),
  confident: z
    .boolean()
    .describe(
      "False when the supplied reports are too thin to summarise responsibly."
    ),
});

/**
 * Stable across every request in the run, so it caches. Volatile per-cluster
 * material goes in the user turn, after the cache breakpoint.
 */
const SYSTEM = `You are a wire editor for a newspaper called The AI Daily.

You will be given the headline and the standfirsts that publishers filed about a single news event. Write a short editorial brief on that event.

Rules, without exception:
- Use only what is in the supplied reports. Do not add background, figures, dates, names, or context from your own knowledge.
- Never invent a quote, a statistic, a company, or an outcome.
- If the supplied reports are too thin to summarise responsibly, set confident to false and keep every field brief and hedged.
- Write plainly, in the register of a serious newspaper. No marketing language, no hype, no adjectives doing work the facts should do.
- Do not editorialise about whether the development is good or bad.`;

function promptFor(cluster: EventCluster): string {
  const outlets = [...new Set(cluster.articles.map((a) => a.sourceName))];
  const reports = cluster.articles
    .slice(0, 5)
    .map((a) => `[${a.sourceName}] ${a.title}\n${a.summary}`)
    .join("\n\n");

  return `EVENT: ${cluster.title}
SECTION: ${cluster.category}
CARRIED BY: ${outlets.join(", ")}

REPORTS AS FILED:
${reports}`;
}

async function enrichCluster(
  client: Anthropic,
  cluster: EventCluster
): Promise<AiArtifact[]> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: EFFORT, format: zodOutputFormat(Brief) },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: promptFor(cluster) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `declined (${response.stop_details?.category ?? "unknown"})`
    );
  }

  const brief = response.parsed_output;
  if (!brief) throw new Error("no parseable output");

  const now = new Date().toISOString();
  const base = { clusterId: cluster.id, language: "en", model: MODEL, createdAt: now };

  const artifacts: AiArtifact[] = [
    { id: randomUUID(), type: "tldr", content: brief.tldr, ...base },
    { id: randomUUID(), type: "key_points", content: brief.keyPoints, ...base },
    { id: randomUUID(), type: "why_it_matters", content: brief.whyItMatters, ...base },
    { id: randomUUID(), type: "who_is_affected", content: brief.whoIsAffected, ...base },
  ];

  // A model that says it lacks evidence is doing its job; publish nothing.
  return brief.confident ? artifacts : [];
}

/** Run with bounded concurrency; one failed cluster never fails the edition. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

async function main() {
  const edition: Edition = JSON.parse(await readFile(EDITION, "utf8"));
  console.log(
    `Enriching ${edition.clusters.length} events from edition ${edition.edition} (${edition.date})`
  );

  const client = new Anthropic();

  // Probe credentials once before spending anything. Without this the auth
  // failure surfaces per request and buries the real problem under 24 copies
  // of the same message. countTokens is free and exercises the same auth path.
  try {
    await client.messages.countTokens({
      model: MODEL,
      messages: [{ role: "user", content: "ping" }],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `\nCannot authenticate, so nothing was sent and nothing was spent.\n` +
        `  ${detail.split("\n")[0]}\n\n` +
        `Set a key and re-run:\n` +
        `  $env:ANTHROPIC_API_KEY = "sk-ant-..."\n\n` +
        `The newspaper runs fine without this step — enrichment is additive.`
    );
    process.exit(1);
  }

  const started = Date.now();

  const results = await mapLimit(edition.clusters, CONCURRENCY, async (c, i) => {
    const artifacts = await enrichCluster(client, c);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${artifacts.length ? "ok      " : "no data "} ${c.title.slice(0, 62)}`
    );
    return artifacts;
  });

  const artifacts: AiArtifact[] = [];
  let failed = 0;
  let abstained = 0;

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.length === 0) abstained++;
      artifacts.push(...r.value);
    } else {
      failed++;
      console.log(
        `  ${String(i + 1).padStart(2)}. FAILED   ${edition.clusters[i].title.slice(0, 52)} — ${r.reason?.message ?? r.reason}`
      );
    }
  });

  edition.aiArtifacts = artifacts;
  await writeFile(EDITION, JSON.stringify(edition, null, 2), "utf8");
  await writeFile(
    join(ROOT, "data", `edition-${edition.date}.json`),
    JSON.stringify(edition, null, 2),
    "utf8"
  );

  const enriched = edition.clusters.length - failed - abstained;
  console.log(
    `\n${enriched} enriched, ${abstained} abstained for thin sourcing, ${failed} failed — ${((Date.now() - started) / 1000).toFixed(1)}s`
  );
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error(
      "No valid credentials. Set ANTHROPIC_API_KEY, then re-run.\n" +
        "The newspaper works without this step — enrichment is additive."
    );
  } else if (err instanceof Anthropic.RateLimitError) {
    console.error("Rate limited. Wait and re-run; already-written artifacts are kept.");
  } else {
    console.error("Enrichment failed:", err);
  }
  process.exit(1);
});
