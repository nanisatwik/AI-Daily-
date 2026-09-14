/**
 * Source registry and health state.
 *
 * Ingestion has to be able to run unattended, which means it must remember
 * what happened last time. A feed that 429s should be backed off rather than
 * hammered; a feed that has failed for days should step aside and be retried
 * later rather than failing loudly every morning; and a feed that is merely
 * quiet must never be mistaken for a broken one — that distinction was the
 * whole lesson of the first health check.
 *
 * State persists to data/source-health.json, which the daily job commits.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type HealthState =
  | "healthy"
  | "quiet"
  | "stale"
  | "rate-limited"
  | "failed"
  | "disabled";

export type SourceHealth = {
  sourceId: string;
  enabled: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** Publication time of the newest item ever seen — not the fetch time. */
  lastItemAt: string | null;
  /** Consecutive failures; reset by any success. */
  failureCount: number;
  successCount: number;
  totalAttempts: number;
  rateLimitedUntil: string | null;
  lastError: string | null;
};

export type SourceRecord = SourceHealth & {
  state: HealthState;
  reliabilityScore: number;
};

/** Consecutive failures before a source steps aside. */
const DISABLE_AFTER = 5;
/** How long a disabled source rests before being tried again. */
const DISABLE_COOLDOWN_H = 12;
/** No new item in this long, despite the feed answering, means stale. */
const STALE_H = 168;
/** Answering with nothing new, but recently enough to be merely quiet. */
const QUIET_H = 36;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STORE = join(ROOT, "data", "source-health.json");

const hoursSince = (iso: string | null, now: number) =>
  iso ? (now - Date.parse(iso)) / 3_600_000 : Infinity;

function blank(sourceId: string): SourceHealth {
  return {
    sourceId,
    enabled: true,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastItemAt: null,
    failureCount: 0,
    successCount: 0,
    totalAttempts: 0,
    rateLimitedUntil: null,
    lastError: null,
  };
}

/**
 * Ratio of successful fetches, smoothed so one bad morning does not condemn a
 * feed and one good morning does not vindicate one. Feeds ingestion ranking.
 */
function reliability(h: SourceHealth): number {
  const PRIOR = 3;
  return Number(
    ((h.successCount + PRIOR) / (h.totalAttempts + PRIOR * 2)).toFixed(3)
  );
}

export function classify(h: SourceHealth, now = Date.now()): HealthState {
  if (!h.enabled) return "disabled";
  if (h.rateLimitedUntil && Date.parse(h.rateLimitedUntil) > now)
    return "rate-limited";
  if (h.failureCount >= DISABLE_AFTER) return "disabled";
  if (h.failureCount > 0) return "failed";

  const itemAge = hoursSince(h.lastItemAt, now);
  if (itemAge > STALE_H) return "stale";
  if (itemAge > QUIET_H) return "quiet";
  return "healthy";
}

export function decorate(h: SourceHealth, now = Date.now()): SourceRecord {
  return { ...h, state: classify(h, now), reliabilityScore: reliability(h) };
}

export class Registry {
  private health = new Map<string, SourceHealth>();

  static async load(): Promise<Registry> {
    const r = new Registry();
    try {
      const raw = JSON.parse(await readFile(STORE, "utf8")) as {
        sources?: SourceHealth[];
      };
      for (const h of raw.sources ?? []) r.health.set(h.sourceId, h);
    } catch {
      // First run, or the file was lost. Starting clean is correct — every
      // source is simply untried.
    }
    return r;
  }

  get(sourceId: string): SourceHealth {
    let h = this.health.get(sourceId);
    if (!h) {
      h = blank(sourceId);
      this.health.set(sourceId, h);
    }
    return h;
  }

  /**
   * Whether to fetch this source now. A disabled source is retried once its
   * cooldown expires, so nothing is written off permanently by accident.
   */
  shouldFetch(sourceId: string, now = Date.now()): boolean {
    const h = this.get(sourceId);

    if (h.rateLimitedUntil && Date.parse(h.rateLimitedUntil) > now) return false;

    if (h.failureCount >= DISABLE_AFTER) {
      const rested = hoursSince(h.lastFailureAt, now) >= DISABLE_COOLDOWN_H;
      if (rested) {
        // Give it one attempt; a success clears the record entirely.
        h.failureCount = DISABLE_AFTER - 1;
        return true;
      }
      return false;
    }

    return h.enabled;
  }

  recordSuccess(sourceId: string, newestItemAt: string | null, now = Date.now()) {
    const h = this.get(sourceId);
    h.totalAttempts++;
    h.successCount++;
    h.failureCount = 0;
    h.lastError = null;
    h.rateLimitedUntil = null;
    h.lastSuccessAt = new Date(now).toISOString();
    // Only advance; a feed that briefly reorders must not rewind its own clock.
    if (newestItemAt && (!h.lastItemAt || newestItemAt > h.lastItemAt)) {
      h.lastItemAt = newestItemAt;
    }
  }

  recordFailure(sourceId: string, error: string, now = Date.now()) {
    const h = this.get(sourceId);
    h.totalAttempts++;
    h.failureCount++;
    h.lastFailureAt = new Date(now).toISOString();
    h.lastError = error.slice(0, 200);

    // Exponential backoff on rate limits, capped at a day, so a throttling
    // publisher is respected instead of being retried into a longer ban.
    if (/\b429\b|rate.?limit/i.test(error)) {
      const backoffH = Math.min(2 ** h.failureCount, 24);
      h.rateLimitedUntil = new Date(now + backoffH * 3_600_000).toISOString();
    }
  }

  all(now = Date.now()): SourceRecord[] {
    return [...this.health.values()].map((h) => decorate(h, now));
  }

  async save(): Promise<void> {
    await mkdir(dirname(STORE), { recursive: true });
    await writeFile(
      STORE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          sources: [...this.health.values()].sort((a, b) =>
            a.sourceId.localeCompare(b.sourceId)
          ),
        },
        null,
        2
      ),
      "utf8"
    );
  }
}
