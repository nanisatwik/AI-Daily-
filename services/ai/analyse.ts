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
 * No provider configured, no generation, and the edition prints exactly as the
 * extractive pass left it. Same contract as `lib/firebase.ts`: the feature is
 * additive, its absence is a normal state rather than a failure, and the step
 * exits 0 so a paper without it is still a paper.
 *
 * WHICHEVER MODEL WILL HAVE US
 *
 * There were two providers by the second day of this feature existing, and not
 * by design. Gemini was wired up and checked, and then Google put the project
 * behind a manual review gate — `Status: Restricted`, `permission_denied: Your
 * project has been denied access` — which no setting undoes and which a great
 * many people hit the same week. Resting a pillar of the paper on one
 * company's policy was the actual mistake; see provider.ts, which now holds
 * the choice and the free-tier arithmetic for each.
 *
 * An edition is 54 clusters and one request each, so the allowance matters more
 * than the model does: Groq's free plan permits a thousand requests a day and
 * Gemini's five hundred, against an edition's fifty-four. Either is ample; what
 * is not ample is depending on exactly one of them.
 *
 * The run is serial on purpose. Concurrency would not finish sooner — it would
 * only reach the per-minute limit faster and spend requests on being told so.
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { AiArtifact, Edition, EventCluster } from "../../lib/types.ts";
import {
  Misconfigured,
  QuotaExhausted,
  chooseProvider,
  hasKey,
  providers,
  signupLines,
  type Model,
} from "./provider.ts";
import { SCHEMA, SYSTEM, evidenceFor, promptFor, readBrief, vet } from "./analysis.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EDITION = join(ROOT, "data", "edition-latest.json");

/**
 * The model, its pace and its daily allowance come from whichever provider
 * answered — see provider.ts.
 *
 * They were constants here while Gemini was the only thing to be constant
 * about. Then Google restricted the project and a second provider became
 * necessary, at which point a hardcoded model was the thing standing between a
 * refusal and a working paper.
 */

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
  model: Model,
  modelName: string,
  cluster: EventCluster,
  now: string
): Promise<Outcome> {
  const { corpus } = evidenceFor(cluster);

  const reply = await model.generate(SYSTEM, promptFor(cluster), SCHEMA);

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
    createHash("sha1").update(`${cluster.id}|${modelName}|${field}`).digest("hex").slice(0, 16);

  const base = {
    clusterId: cluster.id,
    language: "en",
    model: modelName,
    createdAt: now,
  };

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
  // it, is not visible to a plain `node` process. Consulted only when no
  // provider's key is already set, so CI's repository secret always wins and a
  // stale local file can never shadow it.
  if (!providers().some((p) => hasKey(p.keyName))) {
    try {
      (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.(
        join(ROOT, ".env.local")
      );
    } catch {
      // No such file. That is the ordinary case on a CI runner.
    }
  }

  const provider = chooseProvider();
  if (!provider) {
    console.log(
      "No model is configured, so no analysis was generated and none was needed.\n" +
        "  The edition prints with the extractive briefs it already has.\n" +
        "  Either of these is free and asks for no card:\n" +
        signupLines()
    );
    return;
  }

  const edition: Edition = JSON.parse(await readFile(EDITION, "utf8"));

  // Ranked highest-first by the ingestion pass, so taking the head of the list
  // is taking the front of the paper. Nothing here re-sorts it.
  const planned = edition.clusters.slice(
    0,
    Math.min(edition.clusters.length, LIMIT, provider.dailyRequests)
  );

  console.log(
    `Analysing ${planned.length} of ${edition.clusters.length} events with ` +
      `${provider.label} ${provider.model}\n` +
      `  free tier: ${provider.rpm} requests/minute, ${provider.dailyRequests}/day — ` +
      `this run needs ${planned.length}, about ` +
      `${Math.max(Math.ceil(planned.length / provider.rpm), 1)} min at that pace`
  );

  const model = await provider.create(provider.dailyRequests);

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
      outcome = await analyse(model, provider.model, cluster, now);
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
      `${model.requestsSpent} requests, ${model.tokensSpent} tokens, ${seconds}s`
  );
  console.log(
    `${provider.label} allowance after this run: about ${model.budgetRemaining} of ${provider.dailyRequests} requests left today.`
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
        `Check ${provider.keyName} against ${provider.signup}.\n` +
        `Another provider can be used instead — set its key, or force one with\n` +
        `AI_PROVIDER. The newspaper prints without this step either way;\n` +
        `analysis is additive.`
    );
    process.exit(1);
  }
}

/**
 * Only when this file is the thing that was run.
 *
 * Without the guard, `main()` fires on import — and importing one exported
 * helper out of this module is enough to set the whole job going. checks/
 * localdesk.check.ts imports `withLocalDesk` from here, and running the check
 * suite therefore fetched thirty-seven live feeds and rewrote the edition
 * underneath every other suite in the same run. The story count moved from 237
 * to 238 between two runs of `npm run check`, which is how it was noticed. On
 * a CI runner it would have rewritten the paper on every push.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Analysis failed:", err);
    process.exit(1);
  });
}
