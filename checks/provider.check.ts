/**
 * Provider selection, checked.
 *
 * The point of this layer is that one vendor refusing cannot stop the paper
 * carrying analysis, so the cases worth asserting are the awkward ones: both
 * keys set, neither set, a key that is only whitespace, and a forced choice
 * that names a provider with no key.
 */

import {
  chooseProvider,
  providers,
  hasKey,
  signupLines,
} from "../services/ai/provider.ts";

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} ${d}`); };

const KEYS = ["GROQ_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER"];
/** Run `fn` with exactly this environment for the provider variables. */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    return fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k] as string;
    }
  }
}

/* -- 1. neither key: dormant -------------------------------------------- */
ok("none.isNull", withEnv({}, () => chooseProvider()) === null);
ok(
  "none.listsBoth",
  withEnv({}, () => {
    const lines = signupLines();
    return /Groq/.test(lines) && /Gemini/.test(lines);
  }),
  "the dormant message must name every way out, not just one"
);

/* -- 2. one key each way ------------------------------------------------ */
ok(
  "groqOnly",
  withEnv({ GROQ_API_KEY: "k" }, () => chooseProvider()?.label) === "Groq"
);
ok(
  "geminiOnly",
  withEnv({ GEMINI_API_KEY: "k" }, () => chooseProvider()?.label) === "Gemini",
  "a Gemini-only setup must still work — it is the one that exists today"
);

/* -- 3. both keys: the more generous free tier wins --------------------- */
ok(
  "both.prefersGroq",
  withEnv({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k" }, () => chooseProvider()?.label) ===
    "Groq",
  "1000 requests a day should beat 500 when both are available"
);

/* -- 4. AI_PROVIDER forces a choice ------------------------------------ */
ok(
  "forced.gemini",
  withEnv({ GROQ_API_KEY: "k", GEMINI_API_KEY: "k", AI_PROVIDER: "gemini" }, () =>
    chooseProvider()?.label
  ) === "Gemini",
  "the whole point of the override is carrying on when one vendor refuses"
);
ok(
  "forced.caseInsensitive",
  withEnv({ GROQ_API_KEY: "k", AI_PROVIDER: "GROQ" }, () => chooseProvider()?.label) ===
    "Groq"
);
ok(
  "forced.butNoKey",
  withEnv({ GEMINI_API_KEY: "k", AI_PROVIDER: "groq" }, () => chooseProvider()) === null,
  "forcing a provider with no key must be dormant, not a silent fallback"
);
ok(
  "forced.unknownName",
  withEnv({ GROQ_API_KEY: "k", AI_PROVIDER: "nonesuch" }, () => chooseProvider()) === null
);

/* -- 5. a key that is only whitespace is not a key ---------------------- */
ok("blank.empty", withEnv({ GROQ_API_KEY: "" }, () => chooseProvider()) === null);
ok(
  "blank.spaces",
  withEnv({ GROQ_API_KEY: "   " }, () => chooseProvider()) === null,
  "a secret saved as a stray newline would otherwise look configured"
);
ok("hasKey.trims", withEnv({ GROQ_API_KEY: "\n" }, () => hasKey("GROQ_API_KEY")) === false);

/* -- 6. every provider is completely described ------------------------- */
for (const p of providers()) {
  ok(`shape.${p.label}.key`, p.keyName.length > 0);
  ok(`shape.${p.label}.model`, p.model.length > 0);
  ok(`shape.${p.label}.rpm`, p.rpm > 0, `got ${p.rpm}`);
  // An edition is 54 clusters; a provider that cannot carry one is no use.
  ok(`shape.${p.label}.daily`, p.dailyRequests >= 54, `got ${p.dailyRequests}`);
  ok(`shape.${p.label}.signup`, /^https:\/\//.test(p.signup));
  ok(`shape.${p.label}.create`, typeof p.create === "function");
}

/* -- 7. model overrides reach the provider ----------------------------- */
{
  const saved = process.env.GROQ_MODEL;
  process.env.GROQ_MODEL = "some/other-model";
  const got = providers().find((p) => p.label === "Groq")?.model;
  if (saved === undefined) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = saved;
  ok("override.model", got === "some/other-model", `got ${got}`);
}

console.log(
  fails.length
    ? `PROVIDER CHECKS FAILED:\n  ${fails.join("\n  ")}`
    : "ALL PROVIDER CHECKS PASSED"
);
process.exitCode = fails.length ? 1 : 0;
