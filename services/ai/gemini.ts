/**
 * A small client for Google's Gemini API, written against `fetch`.
 *
 * WHY THERE IS NO SDK HERE
 *
 * The whole integration is one POST. Node has `fetch`, the services already
 * run unbundled under `node` with type stripping, and `@google/genai` would be
 * another package to install on every CI run for a request body this file can
 * state in twenty lines. The cost of writing it out is that the shape of the
 * API is pinned here, in the open, where a reader can check it against the
 * documentation.
 *
 * WHY THE PACING IS PART OF THE CLIENT
 *
 * This paper runs on Google's free tier, which is metered two ways: requests
 * per minute, and requests per day. They fail differently and must be handled
 * differently — a per-minute refusal means wait, a per-day refusal means stop —
 * so the distinction is made once, here, rather than at every call site.
 *
 * The numbers themselves are not hardcoded faith. Google stopped publishing
 * per-model free-tier limits during 2026 and now tells you to read them off the
 * AI Studio dashboard, so anything written down here is a measurement with a
 * date on it, not a contract. The run therefore paces itself to the figure it
 * is given AND stops cleanly when the API says the day is spent, because either
 * one of those can be the thing that is true today.
 */

import { setTimeout as sleep } from "node:timers/promises";

/**
 * The Interactions API, generally available since June 2026 and Google's
 * recommendation for new integrations. It replaces the older
 * `:generateContent` shape: the prompt is `input` rather than `contents`, the
 * reply arrives as typed `steps` rather than `candidates`.
 */
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/** A request that hangs is a request that cannot be retried. */
const REQUEST_TIMEOUT_MS = 90_000;

/** Attempts per cluster before it is given up on and the edition moves along. */
const MAX_ATTEMPTS = 3;

/** First backoff; doubles, with jitter, and is overridden by `Retry-After`. */
const BACKOFF_MS = 4_000;

/* ------------------------------------------------------------------ *
 * Failures, sorted by what the caller should do about them
 * ------------------------------------------------------------------ */

/** The day's allowance is gone. Keep what was generated and stop asking. */
export class QuotaExhausted extends Error {}

/** The key is missing, wrong, or not permitted. Nothing will work today. */
export class Misconfigured extends Error {}

/** This one cluster did not come back. Every other cluster is unaffected. */
export class Declined extends Error {}

/* ------------------------------------------------------------------ *
 * The wire shapes
 * ------------------------------------------------------------------ */

/** JSON Schema, restricted to the keywords the API documents as supported. */
export type ResponseSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
};

type Interaction = {
  id?: string;
  status?: string;
  steps?: {
    type?: string;
    status?: string;
    content?: { type?: string; text?: string }[];
  }[];
  usage?: { total_tokens?: number };
  errors?: { code?: string; message?: string }[];
};

type ApiError = { error?: { code?: string; message?: string } };

export type Reply = { text: string; tokens: number };

export type GeminiConfig = {
  apiKey: string;
  model: string;
  /** Requests per minute to stay under. The client spaces itself accordingly. */
  rpm: number;
  /** Requests this run may make in total before it stops of its own accord. */
  budget: number;
};

/** Present and non-empty, or the whole step is dormant. */
export function isConfigured(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").trim().length > 0;
}

export class Gemini {
  private readonly config: GeminiConfig;
  /** When the previous request was *started*, for per-minute spacing. */
  private lastStartedAt = 0;
  private spent = 0;
  private tokens = 0;

  /**
   * Whether the schema has to ride inside `generation_config`.
   *
   * Google's own documentation disagrees with itself about where
   * `response_format` belongs: the structured-output and migration guides put
   * it at the root of the request, the REST reference lists it among the
   * `generation_config` fields. Both cannot be right, and this was written
   * without a key to settle it, so the request is sent the way the copyable
   * curl examples show and moved if the API rejects the field by name. The
   * correction happens once and sticks for the rest of the run.
   */
  private schemaAtRoot = true;

  constructor(config: GeminiConfig) {
    this.config = config;
  }

  get requestsSpent(): number {
    return this.spent;
  }

  get tokensSpent(): number {
    return this.tokens;
  }

  get budgetRemaining(): number {
    return Math.max(0, this.config.budget - this.spent);
  }

  /**
   * One prompt in, one string out.
   *
   * `system` is the standing instruction, identical for every cluster;
   * `input` is the material for this one. Keeping them apart is not cosmetic —
   * it is what lets the rules be stated once, ahead of the evidence, rather
   * than being re-argued inside each prompt where the evidence could crowd
   * them out.
   */
  async generate(
    system: string,
    input: string,
    schema: ResponseSchema
  ): Promise<Reply> {
    let wait = BACKOFF_MS;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Checked per attempt, not per cluster: a retry is a request the free
      // tier counts, so it has to be a request this run counts too.
      if (this.spent >= this.config.budget) {
        throw new QuotaExhausted(
          `run budget of ${this.config.budget} requests is spent`
        );
      }

      await this.pace();
      this.spent++;

      let res: Response;
      try {
        res = await this.post(this.body(system, input, schema));
      } catch (err) {
        // A socket that died or a request that outran its timeout. Nothing was
        // learned about the quota, so it is worth one more try.
        if (attempt === MAX_ATTEMPTS) {
          throw new Declined(err instanceof Error ? err.message : String(err));
        }
        await sleep(jitter(wait));
        wait *= 2;
        continue;
      }

      if (res.ok) {
        const body = (await res.json()) as Interaction;
        this.tokens += body.usage?.total_tokens ?? 0;
        return { text: readOutput(body), tokens: body.usage?.total_tokens ?? 0 };
      }

      const detail = await readError(res);

      // A credential problem is not worth retrying and not worth spending the
      // rest of the edition discovering fifty-three more times.
      if (isKeyProblem(res.status, detail)) {
        throw new Misconfigured(detail.message);
      }

      // The two 429s mean opposite things. `quota_exceeded` is the day's
      // allowance; no amount of waiting inside this run will bring it back, and
      // continuing would only turn a partial edition into a slow partial
      // edition. `rate_limit_exceeded` is the per-minute meter and clears by
      // itself within the minute.
      if (res.status === 429) {
        if (isDailyQuota(detail)) {
          throw new QuotaExhausted(detail.message);
        }
        if (attempt === MAX_ATTEMPTS) throw new Declined(detail.message);
        await sleep(retryAfter(res) ?? jitter(wait));
        wait *= 2;
        continue;
      }

      // The documentation contradicts itself on where `response_format` goes,
      // so a 400 naming that field is a fact about the API rather than about
      // this cluster: move the field and try the same prompt again.
      if (res.status === 400 && this.schemaAtRoot && namesResponseFormat(detail.message)) {
        this.schemaAtRoot = false;
        wait = BACKOFF_MS;
        continue;
      }

      if (res.status >= 500) {
        if (attempt === MAX_ATTEMPTS) throw new Declined(detail.message);
        await sleep(retryAfter(res) ?? jitter(wait));
        wait *= 2;
        continue;
      }

      // Anything else is this request's own fault — a malformed prompt, a
      // blocked one — and repeating it verbatim would produce the same answer.
      throw new Declined(detail.message);
    }

    throw new Declined(`gave up after ${MAX_ATTEMPTS} attempts`);
  }

  /**
   * The request body.
   *
   * `thinking_level: "minimal"` is already the default for the Flash-Lite
   * models, and is set anyway so that swapping the model in `GEMINI_MODEL`
   * cannot quietly start buying reasoning tokens for work that is a
   * rewrite of supplied text.
   *
   * Temperature is deliberately absent. Google's Gemini 3 guidance is to leave
   * it at its default of 1.0 and warns that lowering it can make the model loop
   * or degrade — the instinct to turn it down for "factual" work is wrong on
   * this family, and the discipline here comes from the prompt and the schema
   * instead.
   */
  private body(system: string, input: string, schema: ResponseSchema) {
    const format = {
      type: "text",
      mime_type: "application/json",
      schema,
    };
    const generation_config: Record<string, unknown> = {
      thinking_level: "minimal",
      // Generous: the brief is a couple of hundred tokens, and a truncated
      // reply is invalid JSON, which costs a whole request to learn.
      max_output_tokens: 2048,
    };
    if (!this.schemaAtRoot) generation_config.response_format = format;

    return {
      model: this.config.model,
      system_instruction: system,
      input,
      generation_config,
      ...(this.schemaAtRoot ? { response_format: format } : {}),
    };
  }

  private async post(body: unknown): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          // The key goes in a header, never a query string: URLs end up in
          // proxy logs and error messages.
          "x-goog-api-key": this.config.apiKey,
        },
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Hold the line at the per-minute limit by spacing request *starts*. */
  private async pace(): Promise<void> {
    const gap = 60_000 / Math.max(1, this.config.rpm);
    const due = this.lastStartedAt + gap;
    const now = Date.now();
    if (now < due) await sleep(due - now);
    this.lastStartedAt = Date.now();
  }
}

/* ------------------------------------------------------------------ *
 * Reading what came back
 * ------------------------------------------------------------------ */

/**
 * The generated text, out of the typed step list.
 *
 * An Interaction is a timeline, not a single answer: thoughts and tool calls
 * are steps too. Only `model_output` steps carry copy meant for a reader, so
 * the rest are dropped rather than concatenated into the brief.
 */
export function readOutput(body: Interaction): string {
  const status = body.status;
  if (status && status !== "completed") {
    const why = body.errors?.map((e) => e.code ?? e.message).filter(Boolean).join("; ");
    throw new Declined(why ? `${status}: ${why}` : `interaction ${status}`);
  }

  const steps = body.steps ?? [];
  const output = steps.filter((s) => s.type === "model_output");

  const text = (output.length ? output : steps)
    .flatMap((s) => s.content ?? [])
    .filter((c) => typeof c.text === "string")
    .map((c) => c.text as string)
    .join("")
    .trim();

  if (!text) throw new Declined("empty response");
  return text;
}

/**
 * Google's error body, read as it actually arrives.
 *
 * Captured from a live call with a deliberately invalid key:
 *
 *   { error: { code: 400, status: "INVALID_ARGUMENT",
 *              message: "API key not valid...",
 *              details: [{ reason: "API_KEY_INVALID", ... }] } }
 *
 * `code` is a NUMBER, not one of the string codes the error documentation
 * describes, and the machine-readable part is `status` and `details[].reason`.
 * Triaging on a string code meant the quota branch could never be reached and
 * an invalid key was mistaken for a malformed prompt — fifty-four times, once
 * per cluster, each costing a request.
 */
async function readError(
  res: Response
): Promise<{ code: string; status: string; reason: string; message: string }> {
  let code = `http_${res.status}`;
  let status = "";
  let reason = "";
  let message = res.statusText || code;
  try {
    // The interactions endpoint answers some errors with a single-element
    // array rather than an object, so unwrap before reading.
    const raw = (await res.json()) as unknown;
    const body = (Array.isArray(raw) ? raw[0] : raw) as ApiError & {
      error?: { status?: string; details?: { reason?: string }[] };
    };
    const err = body?.error;
    if (err?.code !== undefined) code = String(err.code);
    if (err?.status) status = err.status;
    if (err?.message) message = err.message;
    reason = err?.details?.find((d) => d?.reason)?.reason ?? "";
  } catch {
    // A non-JSON body from a gateway or a proxy. The status is the whole story.
  }
  return { code, status, reason, message: `${code}: ${message}`.slice(0, 300) };
}

/** A credential problem, however Google chooses to dress it up. */
export function isKeyProblem(
  httpStatus: number,
  d: { status: string; reason: string; message: string }
): boolean {
  if (httpStatus === 401 || httpStatus === 403) return true;
  // An invalid key arrives as a 400, which is otherwise the code for "your
  // prompt was wrong" — so it has to be told apart by reason, or every cluster
  // in the edition gets blamed for the key in turn.
  return (
    /API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(d.reason) ||
    /API key not valid|API key expired|invalid authentication/i.test(d.message)
  );
}

/** A per-day allowance, as opposed to the per-minute meter. */
export function isDailyQuota(d: { status: string; reason: string; message: string }): boolean {
  if (/quota_exceeded/i.test(d.reason) || /quota_exceeded/i.test(d.status)) return true;
  // RESOURCE_EXHAUSTED covers both meters; only the text distinguishes them.
  // Separator-tolerant: the metric names arrive snake_cased, as in
  // "generate_requests_per_model_per_day", so matching only whitespace missed
  // every real one and a day's allowance was retried as a per-minute limit.
  const perDay = /per[\s_-]*day|daily/i;
  return perDay.test(d.message) || perDay.test(d.reason);
}

/** Google answers 429 with a `Retry-After` in seconds when it knows one. */
function retryAfter(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // Capped: a server suggesting a ten-minute wait is telling this run to end,
  // not to sleep through the rest of the job.
  return Math.min(seconds * 1000, 60_000);
}

/**
 * Spread retries out. Without this, a whole batch throttled in the same second
 * wakes in the same second and is throttled again.
 */
function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

function namesResponseFormat(message: string): boolean {
  return /response_format/i.test(message) && /unknown|invalid|unexpected/i.test(message);
}
