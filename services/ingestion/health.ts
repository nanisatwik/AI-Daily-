/**
 * Feed health check. Reports, per source: whether it answered, how many items
 * it returned, how many survived the relevance gate, and how many carry a
 * usable date inside the window. A feed can be "up" and still contribute
 * nothing — that distinction is the whole point of this script.
 *
 *   node services/ingestion/health.ts
 */

import { pathToFileURL } from "node:url";
import { FEEDS } from "./sources.ts";
import { fetchFeed, normalize, isAiRelevant } from "./pipeline.ts";

const WINDOW_HOURS = 72;

async function main() {
  const cutoff = Date.now() - WINDOW_HOURS * 3_600_000;

  const rows = await Promise.all(
    FEEDS.map(async (feed) => {
      const name = feed.source.name;
      try {
        const items = await fetchFeed(feed);
        const onTopic = items.filter(isAiRelevant);
        const dated = onTopic
          .map(normalize)
          .filter((a) => a !== null)
          .filter((a) => Date.parse(a!.publishedAt) >= cutoff);

        const newest = onTopic
          .map((i) => Date.parse(i.published ?? ""))
          .filter((t) => Number.isFinite(t))
          .sort((a, b) => b - a)[0];

        return {
          name,
          status: "ok",
          raw: items.length,
          onTopic: onTopic.length,
          fresh: dated.length,
          newestHours: newest
            ? Math.round((Date.now() - newest) / 3_600_000)
            : null,
        };
      } catch (err) {
        return {
          name,
          status: "FAIL",
          error: err instanceof Error ? err.message : String(err),
          raw: 0,
          onTopic: 0,
          fresh: 0,
          newestHours: null,
        };
      }
    })
  );

  console.log(
    "source".padEnd(24) +
      "raw".padStart(6) +
      "ontopic".padStart(9) +
      `  <${WINDOW_HOURS}h`.padStart(8) +
      "newest".padStart(9)
  );
  console.log("-".repeat(56));

  for (const r of rows.sort((a, b) => b.fresh - a.fresh)) {
    if (r.status === "FAIL") {
      console.log(
        `${r.name.padEnd(24)}  FAILED  ${(r as { error?: string }).error?.slice(0, 40) ?? ""}`
      );
      continue;
    }
    const age = r.newestHours === null ? "—" : `${r.newestHours}h`;
    console.log(
      r.name.padEnd(24) +
        String(r.raw).padStart(6) +
        String(r.onTopic).padStart(9) +
        String(r.fresh).padStart(8) +
        age.padStart(9)
    );
  }

  const contributing = rows.filter((r) => r.fresh > 0).length;
  const dead = rows.filter((r) => r.status === "ok" && r.fresh === 0);

  console.log(
    `\n${contributing} of ${rows.length} feeds contributed to this window.`
  );
  if (dead.length) {
    console.log(
      `Answered but contributed nothing: ${dead.map((d) => d.name).join(", ")}`
    );
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
    console.error("Health check failed:", err);
    process.exit(1);
  });
}
