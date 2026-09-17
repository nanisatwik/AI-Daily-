/**
 * What the model is asked, and what is done with what it says.
 *
 * Everything in this file is pure — no key, no network, no clock — so the
 * prompt, the schema and the vetting can be exercised on a fixture without
 * spending a request. `analyse.ts` is the part that talks to Google.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *
 * Retrieval before generation. The model is handed the headlines and
 * standfirsts that publishers actually filed about one event, and nothing
 * else. It is never asked what it knows about the news, because a model asked
 * that will answer, and the answer will read exactly like the answer drawn
 * from the sources.
 *
 * The prompt says so. The schema gives it a way to decline. And because both
 * of those are requests rather than guarantees, the reply is then checked
 * mechanically for the one kind of invention that can be caught without a
 * second model: a figure that appears in the brief and in none of the reports.
 */

import type { EventCluster } from "../../lib/types.ts";
import type { ResponseSchema } from "./gemini.ts";

/** Reports per cluster. Beyond about five the later ones only repeat. */
const MAX_REPORTS = 5;

/** Per standfirst. Feeds occasionally carry a whole article in the summary. */
const MAX_REPORT_CHARS = 700;

export const SYSTEM = `You are a wire editor for a newspaper called The AI Daily.

You will be given the headline and the standfirsts that publishers filed about a single news event. Write a short editorial brief on that event.

Rules, without exception:
- Use only what is in the supplied reports. Do not add background, figures, dates, names, places or context from your own knowledge. If the reports do not say it, you do not know it.
- Never invent a quote, a statistic, a company, a product or an outcome. Any number you write must appear in the reports.
- Say who is affected only insofar as the reports support it. "Who it lands on" is not an invitation to speculate about the industry.
- If the supplied reports are too thin to summarise responsibly — a bare headline, a stub, a standfirst that says nothing — set confident to false. Declining is a correct answer and costs nothing.
- Write plainly, in the register of a serious newspaper. No marketing language, no hype, no adjectives doing work the facts should do.
- Do not editorialise about whether the development is good or bad, and do not address the reader.
- Plain sentences only. No markdown, no bullet characters, no bold.`;

/**
 * The output contract.
 *
 * Only keywords the API documents as supported appear here; it rejects schemas
 * that reach past them, and a rejected schema is a 400 per cluster rather than
 * a degraded brief.
 */
export const SCHEMA: ResponseSchema = {
  type: "object",
  properties: {
    tldr: {
      type: "string",
      description: "One sentence, under 30 words, plain language.",
    },
    key_points: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 5,
      description:
        "Three to five points, each one line, each drawn only from the supplied reports.",
    },
    why_it_matters: {
      type: "string",
      description:
        "Two sentences on the consequence, staying inside what the reports support.",
    },
    who_is_affected: {
      type: "string",
      description: "One sentence naming who this lands on.",
    },
    confident: {
      type: "boolean",
      description:
        "False when the supplied reports are too thin to summarise responsibly.",
    },
  },
  required: ["tldr", "key_points", "why_it_matters", "who_is_affected", "confident"],
};

export type Brief = {
  tldr: string;
  keyPoints: string[];
  whyItMatters: string;
  whoIsAffected: string;
  confident: boolean;
};

/**
 * The reports as filed, and the same text flattened for checking against.
 *
 * The corpus is assembled here rather than at the check, so that whatever the
 * model was shown is exactly what its answer is measured against. If the two
 * were built separately they would drift, and the check would start rejecting
 * figures the model was legitimately given.
 */
export function evidenceFor(cluster: EventCluster): {
  outlets: string[];
  reports: string;
  corpus: string;
} {
  const articles = cluster.articles.slice(0, MAX_REPORTS);
  const outlets = [...new Set(cluster.articles.map((a) => a.sourceName))];

  const reports = articles
    .map((a) => `[${a.sourceName}] ${a.title}\n${clip(a.summary, MAX_REPORT_CHARS)}`)
    .join("\n\n");

  return {
    outlets,
    reports,
    corpus: `${cluster.title}\n${cluster.summary}\n${reports}`,
  };
}

export function promptFor(cluster: EventCluster): string {
  const { outlets, reports } = evidenceFor(cluster);

  return `EVENT: ${cluster.title}
SECTION: ${cluster.category}
CARRIED BY: ${outlets.join(", ")}

REPORTS AS FILED:
${reports}`;
}

/* ------------------------------------------------------------------ *
 * Reading the reply
 * ------------------------------------------------------------------ */

/**
 * JSON, whatever it arrives wrapped in.
 *
 * Structured output should return a bare object, but a fenced code block is
 * the one deviation models reliably produce and it would otherwise cost a
 * whole cluster's brief to a stray three backticks.
 */
export function readBrief(text: string): Brief {
  const bare = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(bare);
  } catch {
    throw new Error("reply was not JSON");
  }

  if (!raw || typeof raw !== "object") throw new Error("reply was not an object");
  const o = raw as Record<string, unknown>;

  const str = (v: unknown) => (typeof v === "string" ? tidy(v) : "");

  return {
    tldr: str(o.tldr),
    keyPoints: Array.isArray(o.key_points) ? o.key_points.map(str).filter(Boolean) : [],
    whyItMatters: str(o.why_it_matters),
    whoIsAffected: str(o.who_is_affected),
    // Absent is not the same as false, but it is not evidence of confidence
    // either. A reply that omits the field has not earned the benefit.
    confident: o.confident === true,
  };
}

export type Verdict =
  | { ok: true; brief: Brief }
  | { ok: false; reason: string };

/**
 * The last gate before a machine-written paragraph is printed as a newspaper's
 * own analysis.
 *
 * Three things are checked, in the order they matter:
 *
 *   1. The model's own abstention. It was given a way to say the sourcing is
 *      too thin, and a model that says so is doing its job.
 *   2. Shape. An empty field or a single key point is not a brief, and a
 *      paragraph where a sentence was asked for will not fit the panel.
 *   3. Figures. Every number in the brief must appear in the reports the model
 *      was shown. This is the only form of invention that can be caught
 *      mechanically, and it is the form that does the most damage, because a
 *      fabricated statistic reads exactly like a real one.
 *
 * A brief that fails any of these is dropped whole rather than trimmed: a
 * reply that invented one figure has not earned trust in its other sentences,
 * and the story keeps the extractive brief it already had.
 */
export function vet(brief: Brief, corpus: string): Verdict {
  if (!brief.confident) return { ok: false, reason: "model declined — thin sourcing" };

  if (!brief.tldr || !brief.whyItMatters || !brief.whoIsAffected) {
    return { ok: false, reason: "a field came back empty" };
  }

  if (brief.tldr.length > 260) return { ok: false, reason: "tldr ran long" };
  if (brief.whyItMatters.length > 460) return { ok: false, reason: "why it matters ran long" };
  if (brief.whoIsAffected.length > 260) return { ok: false, reason: "who is affected ran long" };

  const keyPoints = brief.keyPoints
    .filter((p) => p.length >= 20 && p.length <= 260)
    .slice(0, 5);
  if (keyPoints.length < 2) return { ok: false, reason: "fewer than two usable points" };

  const all = [brief.tldr, brief.whyItMatters, brief.whoIsAffected, ...keyPoints];

  // A short brief has no business carrying a link, and a model that writes one
  // has written it from memory.
  if (all.some((s) => /https?:\/\//i.test(s))) {
    return { ok: false, reason: "carried a link" };
  }

  const known = new Set(figures(corpus));
  const invented = [...new Set(all.flatMap(figures))].filter((f) => !known.has(f));
  if (invented.length > 0) {
    return { ok: false, reason: `figures not in the sources: ${invented.join(", ")}` };
  }

  return { ok: true, brief: { ...brief, keyPoints } };
}

/* ------------------------------------------------------------------ */

/**
 * Numbers as the reader would read them, so the two sides of the comparison
 * agree on what a number is.
 *
 * Thousands separators are dropped, because a report writing "1,200" and a
 * brief writing "1200" are the same claim and rejecting the brief over the
 * comma would be pedantry with a cost. A trailing decimal point belongs to the
 * sentence, not to the figure.
 */
function figures(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) =>
    n.replace(/,/g, "").replace(/\.$/, "")
  );
}

/**
 * Markdown out, whitespace normalised.
 *
 * The prompt asks for plain sentences and mostly gets them. What survives is
 * the occasional bolded phrase or a list marker on a key point — neither of
 * which the panel renders, so both would print as literal asterisks in a
 * newspaper set in Caslon.
 */
function tidy(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    // Only a recognised list marker, and only with a space after it, so a
    // point that legitimately opens with a year keeps its year.
    .replace(/^\s*(?:[-*•–—]|\d{1,2}[.)])\s+/, "")
    .trim();
}

function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit).trimEnd()}…`;
}
