/**
 * The analysis pass — the part of the brief a publisher's own sentences cannot
 * supply.
 *
 *   node services/ai/analyse.ts
 *
 * The extractive briefing in `extractive.ts` selects sentences that were
 * actually filed, which is honest and free but can only say what was reported.
 * Why it matters and who it lands on have to be written, and writing them
 * requires a model. This is that step, and it stays inside the paper's rule
 * that nothing costs money.
 *
 * DORMANT WITHOUT A KEY
 *
 * No `GEMINI_API_KEY`, no generation, and the edition prints exactly as the
 * extractive pass left it. Same contract as `lib/firebase.ts`: the feature is
 * additive, its absence is a normal state rather than a failure, and the step
 * exits 0 so a paper without it is still a paper.
 *
 * THE ARITHMETIC, FOR 54 CLUSTERS, ONCE A DAY
 *
 * Google's free tier is metered per minute and per day, and during 2026 it
 * stopped publishing the per-model numbers — the documentation now says to
 * read them off the AI Studio dashboard. The figures below were measured
 * against the API in September 2026 and are treated as perishable: they set
 * the pacing, and the run also stops the moment the API itself says the day is
 * spent, because that is the only source of truth that cannot go stale.
 *
 *   gemini-3.5-flash-lite    15 requests/minute    500 requests/day
 *   gemini-3.5-flash          5 requests/minute     20 requests/day
 *
 * That gap is the whole reason for the model choice. An edition is 54 clusters
 * and one request each, which is 11% of Flash-Lite's day and nearly three
 * times Flash's. Flash-Lite could not be the wrong call here: the work is
 * rewriting supplied text into four short fields, which is what the model is
 * for, and there is no second edition to spend the rest of the allowance on.
 *
 * At 15 a minute the run spaces itself four seconds apart, so 54 clusters take
 * a little under four minutes of mostly waiting. That is why it runs serially:
 * concurrency would not finish sooner, it would only reach the per-minute
 * limit faster and spend requests on being told so.
 *
 * WHAT IT DOES TO AN EDITION
 *
 * Every cluster it succeeds on has its extractive artifacts replaced by the
 * generated ones. Every cluster it skips, abstains on, or fails keeps the
 * extractive brief it already had. So a run that stops halfway leaves a
 * publishable edition, not a half-empty one — and because the clusters are
 * already ranked highest-first, stopping halfway means the front of the paper
 * is the part that got the analysis.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { AiArtifact, Edition, EventCluster } from "../../lib/types.ts";
import { Gemini, Misconfigured, QuotaExhausted, isConfigured } from "./gemini.ts";
import { SCHEMA, SYSTEM, evidenceFor, promptFor, readBrief, vet } from "./analysis.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EDITION = join(ROOT, "data", "edition-latest.json");

/**
 * Flash-Lite, not Flash.
 *
 * The task is rewriting supplied text into four short fields with no reasoning
 * to do, and the free tier gives Flash-Lite twenty-five times the daily
 * allowance. Override with GEMINI_MODEL if Google moves the goalposts again;
 * the pacing figures below should move with it.
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const RPM = Number(process.env.GEMINI_RPM) || 15;
const DAILY_REQUESTS = Number(process.env.GEMINI_DAILY_REQUESTS) || 500;

/**
 * A shorter run, for exercising the whole path without spending an edition's
 * worth of requests — the same affordance `BRIEFING_SECONDS` gives the voice.
 */
const LIMIT = Number(process.env.ANALYSIS_LIMIT) || Infinity;

type Outcome =
  | { kind: "written"; artifacts: AiArtifact[] }
  | { kind: "abstained"; reason: string }
  | { kind: "failed"; reason: string };

async function analyse(
  gemini: Gemini,
  cluster: EventCluster,
  now: string
): Promise<Outcome> {
  const { corpus } = evidenceFor(cluster);

  const reply = await gemini.generate(SYSTEM, promptFor(cluster), SCHEMA);

  let brief;
  try {
    brief = readBrief(reply.text);
  } catch (err) {
    return { kind: "failed", reason: err instanceof Error ? err.message : String(err) };
  }

  const verdict = vet(brief, corpus);
  if (!verdict.ok) return { kind: "abstained", reason: verdict.reason };

  /**
   * Deterministic ids, hashed from the cluster and the field.
   *
   * The edition file is committed to the repository every morning. Random ids
   * would mean a fresh run rewrote every line of it even when the copy was
   * identical, which turns the git history into noise and makes a real change
   * impossible to spot in a diff.
   */
  const id = (field: string) =>
    createHash("sha1").update(`${cluster.id}|${MODEL}|${field}`).digest("hex").slice(0, 16);

  const base = { clusterId: cluster.id, language: "en", model: MODEL, createdAt: now };

  return {
    kind: "written",
    artifacts: [
      { id: id("tldr"), type: "tldr", content: verdict.brief.tldr, ...base },
      { id: id("points"), type: "key_points", content: verdict.brief.keyPoints, ...base },
      {
        id: id("why"),
        type: "why_it_matters",
        content: verdict.brief.whyItMatters,
        ...base,
      },
      {
        id: id("who"),
        type: "who_is_affected",
        content: verdict.brief.whoIsAffected,
        ...base,
      },
    ],
  };
}

async function main() {
  // A key sitting in `.env.local`, where `.env.example` tells the reader to put
  // it, is not visible to a plain `node` process. Loaded only when the variable
  // is not already set, so CI's repository secret always wins and a stale local
  // file can never shadow it.
  if (!process.env.GEMINI_API_KEY) {
    try {
      (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(
        join(ROOT, ".env.local")
      );
    } catch {
      // No such file. That is the ordinary case on a CI runner.
    }
  }

  if (!isConfigured()) {
    console.log(
      "No GEMINI_API_KEY, so no analysis was generated and none was needed.\n" +
        "  The edition prints with the extractive briefs it already has.\n" +
        "  A free key, no card required: https://aistudio.google.com/apikey"
    );
    return;
  }

  const edition: Edition = JSON.parse(await readFile(EDITION, "utf8"));

  // Ranked highest-first by the ingestion pass, so taking the head of the list
  // is taking the front of the paper. Nothing here re-sorts it.
  const planned = edition.clusters.slice(
    0,
    Math.min(edition.clusters.length, LIMIT, DAILY_REQUESTS)
  );

  console.log(
    `Analysing ${planned.length} of ${edition.clusters.length} events with ${MODEL}\n` +
      `  free tier: ${RPM} requests/minute, ${DAILY_REQUESTS}/day — this run needs ${planned.length}, ` +
      `about ${Math.ceil((planned.length * 60) / RPM / 60)} min at that pace`
  );

  const gemini = new Gemini({
    apiKey: (process.env.GEMINI_API_KEY ?? "").trim(),
    model: MODEL,
    rpm: RPM,
    budget: DAILY_REQUESTS,
  });

  const now = new Date().toISOString();
  const started = Date.now();
  const generated = new Map<string, AiArtifact[]>();

  let abstained = 0;
  let failed = 0;
  let halted: string | null = null;
  let fatal: Error | null = null;

  for (const [i, cluster] of planned.entries()) {
    const n = String(i + 1).padStart(2);
    let outcome: Outcome;

    try {
      outcome = await analyse(gemini, cluster, now);
    } catch (err) {
      // The day's allowance is gone, or the key is not usable. Either way the
      // loop ends here and everything already written is kept.
      if (err instanceof QuotaExhausted) {
        halted = err.message;
        break;
      }
      if (err instanceof Misconfigured) {
        fatal = err;
        break;
      }
      outcome = {
        kind: "failed",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    const headline = cluster.title.slice(0, 58);
    if (outcome.kind === "written") {
      generated.set(cluster.id, outcome.artifacts);
      console.log(`  ${n}. written   ${headline}`);
    } else if (outcome.kind === "abstained") {
      abstained++;
      console.log(`  ${n}. kept      ${headline} — ${outcome.reason}`);
    } else {
      failed++;
      console.log(`  ${n}. failed    ${headline} — ${outcome.reason}`);
    }
  }

  /**
   * Generated briefs replace extractive ones cluster by cluster, never field by
   * field.
   *
   * `lib/digest.ts` reads one `model` for the whole panel and the panel prints
   * it as provenance — "compiled from sources" or "written by". A cluster
   * holding two of each kind would have that label decided by array order, and
   * would credit a machine with a publisher's sentence or the reverse.
   *
   * Rebuilt in cluster order rather than appended, so the committed file has a
   * stable shape and a diff shows the day's news rather than a reshuffle.
   */
  const existing = new Map<string, AiArtifact[]>();
  for (const artifact of edition.aiArtifacts ?? []) {
    const list = existing.get(artifact.clusterId) ?? [];
    list.push(artifact);
    existing.set(artifact.clusterId, list);
  }
  for (const [clusterId, artifacts] of generated) existing.set(clusterId, artifacts);

  edition.aiArtifacts = edition.clusters.flatMap((c) => existing.get(c.id) ?? []);

  await writeFile(EDITION, JSON.stringify(edition, null, 2), "utf8");
  await writeFile(
    join(ROOT, "data", `edition-${edition.date}.json`),
    JSON.stringify(edition, null, 2),
    "utf8"
  );

  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `\n${generated.size} analysed, ${abstained} left extractive, ${failed} failed — ` +
      `${gemini.requestsSpent} requests, ${gemini.tokensSpent} tokens, ${seconds}s`
  );
  console.log(
    `Free-tier allowance after this run: about ${gemini.budgetRemaining} of ${DAILY_REQUESTS} requests left today.`
  );

  if (halted) {
    console.log(
      `\nStopped early — the day's free allowance is spent (${halted}).\n` +
        `  Everything written before it stopped is kept; the rest of the edition stays extractive.\n` +
        `  The quota resets at midnight Pacific.`
    );
  }

  if (fatal) {
    console.error(
      `\nThe key was refused, so nothing further was asked and nothing was spent.\n` +
        `  ${fatal.message}\n\n` +
        `Check GEMINI_API_KEY against https://aistudio.google.com/apikey.\n` +
        `The newspaper prints without this step — analysis is additive.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Analysis failed:", err);
  process.exit(1);
});
