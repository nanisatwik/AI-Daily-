/**
 * Groq, as a second way to write the analysis.
 *
 * It exists because Gemini refused. Not for a reason in this code — the key
 * was accepted and the project was not: `Status: Restricted`,
 * `permission_denied: Your project has been denied access`, a manual review
 * gate that a great many people hit the same week and that no setting undoes.
 * A pillar of the paper resting on one company's policy was the real fault,
 * and this is the correction.
 *
 * Groq's free plan permits a thousand requests a day and two hundred thousand
 * tokens, against an edition's fifty-four requests and roughly thirty-eight
 * thousand tokens. It asks for no card, which is the constraint that rules this
 * project.
 *
 * The API is OpenAI-shaped rather than Gemini-shaped — chat messages rather
 * than a system instruction and an input, `choices[0].message.content` rather
 * than steps of content — so the two clients share an interface and almost no
 * code. That interface lives in provider.ts, and everything above it is
 * indifferent to which of them answered.
 */

import {
  Declined,
  Misconfigured,
  QuotaExhausted,
  type Model,
  type Reply,
  type ResponseSchema,
} from "./provider.ts";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 1500;

export type GroqConfig = {
  apiKey: string;
  model: string;
  /** Requests a minute to stay under. The client spaces itself accordingly. */
  rpm: number;
  /** Requests this run may make in total before it stops of its own accord. */
  budget: number;
};

type Completion = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { total_tokens?: number };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Spread retries so a whole edition does not resynchronise onto one instant. */
const jitter = (ms: number) => ms * (0.75 + Math.random() * 0.5);

export class Groq implements Model {
  private readonly config: GroqConfig;
  private requests = 0;
  private tokens = 0;
  /** When the next request may start, to hold the per-minute pace. */
  private nextAllowedAt = 0;

  constructor(config: GroqConfig) {
    this.config = config;
  }

  get requestsSpent(): number {
    return this.requests;
  }

  get tokensSpent(): number {
    return this.tokens;
  }

  get budgetRemaining(): number {
    return Math.max(this.config.budget - this.requests, 0);
  }

  /**
   * Paced by request STARTS rather than by the gap between them.
   *
   * A limit of ten a minute means ten may begin in any minute; waiting six
   * seconds after each one finishes would take far longer than the allowance
   * requires and make a fifty-four story edition crawl.
   */
  private async pace(): Promise<void> {
    const gap = 60_000 / Math.max(this.config.rpm, 1);
    const now = Date.now();
    if (now < this.nextAllowedAt) await sleep(this.nextAllowedAt - now);
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + gap;
  }

  async generate(
    system: string,
    input: string,
    schema: ResponseSchema
  ): Promise<Reply> {
    let wait = BACKOFF_MS;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Checked per attempt, not per cluster: a retry is a request the free
      // tier counts, so it has to be a request this run counts too.
      if (this.requests >= this.config.budget) {
        throw new QuotaExhausted(
          `run budget of ${this.config.budget} requests is spent`
        );
      }

      await this.pace();
      this.requests += 1;

      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: input },
            ],
            // The same schema Gemini is given. Groq's json_schema mode wants a
            // name alongside it and `strict` to refuse anything off-shape,
            // which is what makes the reply parseable without coaxing.
            response_format: {
              type: "json_schema",
              json_schema: { name: "brief", strict: true, schema },
            },
            // Temperature left at the default: lowering it on a small model
            // makes it likelier to repeat itself, not likelier to be accurate.
          }),
        });
      } catch (err) {
        // A transport failure, not an answer. Worth one more try.
        if (attempt === MAX_ATTEMPTS) {
          throw new Declined(
            `network: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        await sleep(jitter(wait));
        wait *= 2;
        continue;
      }

      if (res.ok) {
        const body = (await res.json()) as Completion;
        this.tokens += body.usage?.total_tokens ?? 0;
        const choice = body.choices?.[0];
        const text = choice?.message?.content ?? "";
        // A truncated answer is not a brief. Saying so is cheaper than letting
        // the parser fail on half an object and blaming the model's grammar.
        if (choice?.finish_reason === "length") {
          throw new Declined("reply was cut off before it finished");
        }
        if (!text.trim()) throw new Declined("reply carried no content");
        return { text, tokens: body.usage?.total_tokens ?? 0 };
      }

      const detail = await readError(res);

      // 401 and 403 are the key itself. Discovering that fifty-three more
      // times would cost fifty-three more requests and teach nothing.
      if (res.status === 401 || res.status === 403) {
        throw new Misconfigured(detail);
      }

      if (res.status === 429) {
        // Groq distinguishes the two meters in the message, and the difference
        // matters: a day's allowance will not come back inside this run, where
        // a minute's will come back by itself.
        if (/per\s*day|daily|tokens?\s*per\s*day|TPD|RPD/i.test(detail)) {
          throw new QuotaExhausted(detail);
        }
        if (attempt === MAX_ATTEMPTS) throw new Declined(detail);
        await sleep(retryAfter(res) ?? jitter(wait));
        wait *= 2;
        continue;
      }

      if (res.status >= 500) {
        if (attempt === MAX_ATTEMPTS) throw new Declined(detail);
        await sleep(retryAfter(res) ?? jitter(wait));
        wait *= 2;
        continue;
      }

      // A 400 here is this request's own fault — a prompt the model would not
      // take, a schema it would not honour — and repeating it verbatim would
      // produce the same refusal.
      throw new Declined(detail);
    }

    throw new Declined(`gave up after ${MAX_ATTEMPTS} attempts`);
  }
}

/** Groq answers errors OpenAI-style: `{ error: { message, type, code } }`. */
async function readError(res: Response): Promise<string> {
  let message = res.statusText || `http_${res.status}`;
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: string; type?: string };
    };
    if (body.error?.message) message = body.error.message;
    const code = body.error?.code ?? body.error?.type;
    if (code) message = `${code}: ${message}`;
  } catch {
    // A non-JSON body from a gateway. The status is the whole story.
  }
  return `${res.status}: ${message}`.slice(0, 300);
}

function retryAfter(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}
