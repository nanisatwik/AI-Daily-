/**
 * Which model writes the analysis, and the contract it has to satisfy.
 *
 * This exists because relying on one vendor for a pillar of the product turned
 * out to be a design weakness rather than a simplification. Gemini was wired
 * up, checked, and then refused: Google put the project behind a manual review
 * gate — `Status: Restricted`, `permission_denied: Your project has been denied
 * access` — which is neither a bug in this code nor anything a setting can
 * undo, and which a great many people hit in the same week. No amount of
 * engineering gets past another company's policy decision.
 *
 * So the client became swappable. Any provider that can be given a standing
 * instruction, a body of evidence and a JSON schema, and will answer with JSON,
 * can write this paper's analysis. Nothing above this layer knows or cares
 * which one did: `analysis.ts` was already provider-agnostic, and the artifact
 * records the model's own name so a reader can see who wrote what.
 *
 * The paper still prints with no provider at all. That has been the rule since
 * the accounts and the recording, and it is what makes a refusal like Google's
 * an inconvenience rather than an outage.
 */

/** The day's allowance is gone. Stop, and keep what is already written. */
export class QuotaExhausted extends Error {}

/** The key is absent, refused, or not permitted. Retrying cannot help. */
export class Misconfigured extends Error {}

/** This one request failed. The rest of the edition is unaffected. */
export class Declined extends Error {}

export type Reply = { text: string; tokens: number };

/**
 * JSON Schema, as both providers happen to accept it.
 *
 * Kept deliberately plain — the intersection of what Gemini's structured
 * output and Groq's `json_schema` response format both understand, rather than
 * the fullest either allows, so one schema serves both without translation.
 */
export type ResponseSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
};

/**
 * What the run needs from a model, and nothing more.
 *
 * The spend counters are on the interface rather than tracked by the caller
 * because a retry is a request the free tier charges for, so only the client
 * that made it knows the true count.
 */
export interface Model {
  readonly requestsSpent: number;
  readonly tokensSpent: number;
  readonly budgetRemaining: number;
  generate(
    system: string,
    input: string,
    schema: ResponseSchema
  ): Promise<Reply>;
}

export type Provider = {
  /** For the log and for the artifact's provenance. */
  readonly label: string;
  /** The environment variable holding its key. */
  readonly keyName: string;
  /** Model identifier, as that provider spells it. */
  readonly model: string;
  /** Requests a minute the free tier permits. The client paces itself to it. */
  readonly rpm: number;
  /** Requests a day the free tier permits. */
  readonly dailyRequests: number;
  /** Where to get a key, printed when none is configured. */
  readonly signup: string;
  create(budget: number): Promise<Model>;
};

/**
 * Providers in preference order.
 *
 * Groq leads on measured headroom, not on taste: its free tier permits a
 * thousand requests a day against Gemini's five hundred, and its limits are
 * published per model where Google's now direct you to a dashboard. An edition
 * needs fifty-four.
 *
 * Both are free and neither asks for a card, which is the constraint that rules
 * this project. Where both keys are present the first wins, and GEMINI_MODEL /
 * GROQ_MODEL override the model without touching this file.
 */
export function providers(): Provider[] {
  return [groqProvider(), geminiProvider()];
}

/**
 * The first provider with a key, or null.
 *
 * `AI_PROVIDER` forces one by label, which is how a run can be pinned to a
 * particular vendor while both keys are configured — useful when one of them
 * has started refusing and the other has not.
 */
export function chooseProvider(): Provider | null {
  const all = providers();
  const forced = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  const pool = forced
    ? all.filter((p) => p.label.toLowerCase() === forced)
    : all;
  return pool.find((p) => hasKey(p.keyName)) ?? null;
}

export const hasKey = (name: string): boolean =>
  (process.env[name] ?? "").trim().length > 0;

/** Every provider, for the message printed when none is configured. */
export function signupLines(): string {
  return providers()
    .map((p) => `  ${p.label}: ${p.signup}  (set ${p.keyName})`)
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * The providers themselves, imported lazily.
 *
 * A dormant run must not pay to load a client it will never construct, and
 * more practically it must not fail on one either — a syntax error in a
 * provider nobody configured should not stop the paper printing.
 * ------------------------------------------------------------------ */

function groqProvider(): Provider {
  return {
    label: "Groq",
    keyName: "GROQ_API_KEY",
    // 30 requests a minute, 1,000 a day, 200k tokens a day on the free plan.
    // An edition is 54 requests and about 38k tokens, so the binding limit is
    // neither: it is the 8k tokens a minute, which at ~700 a request is about
    // eleven requests a minute. Paced to that rather than to the stated 30.
    model: (process.env.GROQ_MODEL ?? "openai/gpt-oss-120b").trim(),
    rpm: Number(process.env.GROQ_RPM) || 10,
    dailyRequests: Number(process.env.GROQ_DAILY_REQUESTS) || 1000,
    signup: "https://console.groq.com/keys",
    async create(budget) {
      // Imported here rather than at module scope so a dormant run loads no
      // client at all, and a fault in a provider nobody configured cannot stop
      // the paper printing.
      const { Groq } = await import("./groq.ts");
      return new Groq({
        apiKey: (process.env.GROQ_API_KEY ?? "").trim(),
        model: this.model,
        rpm: this.rpm,
        budget,
      });
    },
  };
}

function geminiProvider(): Provider {
  return {
    label: "Gemini",
    keyName: "GEMINI_API_KEY",
    model: (process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite").trim(),
    rpm: Number(process.env.GEMINI_RPM) || 15,
    dailyRequests: Number(process.env.GEMINI_DAILY_REQUESTS) || 500,
    signup: "https://aistudio.google.com/apikey",
    async create(budget) {
      const { Gemini } = await import("./gemini.ts");
      return new Gemini({
        apiKey: (process.env.GEMINI_API_KEY ?? "").trim(),
        model: this.model,
        rpm: this.rpm,
        budget,
      });
    },
  };
}
