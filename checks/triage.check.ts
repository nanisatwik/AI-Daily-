/**
 * The API error triage, checked against bodies Google actually returns.
 *
 * The shapes below were captured from live calls, not imagined. The bug this
 * guards: an invalid key arrives as HTTP 400, which is otherwise the code for
 * a malformed prompt, so without telling them apart the run blames each of
 * fifty-four clusters in turn and spends a request on every one.
 */
import {
  isKeyProblem,
  isDailyQuota,
} from "../services/ai/gemini.ts";

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} ${d}`); };

const d = (status = "", reason = "", message = "") => ({ status, reason, message });

/* -- the real invalid-key body, captured live ---------------------------- */
const badKey = d("INVALID_ARGUMENT", "API_KEY_INVALID", "API key not valid. Please pass a valid API key.");
ok("badKey.is400NotAuth", isKeyProblem(400, badKey), "a 400 with API_KEY_INVALID must read as a key problem");
ok("badKey.notDailyQuota", !isDailyQuota(badKey));

/* -- classic auth codes still work -------------------------------------- */
ok("401", isKeyProblem(401, d()));
ok("403", isKeyProblem(403, d()));
ok("expired", isKeyProblem(400, d("INVALID_ARGUMENT", "", "API key expired. Please renew the API key.")));

/* -- a genuinely malformed prompt must NOT look like a key problem ------- */
const badPrompt = d("INVALID_ARGUMENT", "", "Invalid JSON payload received. Unknown name \"response_format\".");
ok("badPrompt.notKey", !isKeyProblem(400, badPrompt), "a malformed request was blamed on the key");

/* -- per-day versus per-minute ------------------------------------------ */
const perDay = d("RESOURCE_EXHAUSTED", "", "Quota exceeded for metric: generate_requests_per_model_per_day");
const perMin = d("RESOURCE_EXHAUSTED", "", "Quota exceeded for metric: generate_requests_per_model_per_minute");
ok("perDay.stops", isDailyQuota(perDay), "a day's allowance must stop the run");
ok("perMin.retries", !isDailyQuota(perMin), "a per-minute limit must not stop the run");
ok("perDay.notKey", !isKeyProblem(429, perDay));

/* -- nothing useful in the body ----------------------------------------- */
ok("blank.notKey", !isKeyProblem(400, d()));
ok("blank.notDaily", !isDailyQuota(d()));
ok("gateway500.notKey", !isKeyProblem(503, d("", "", "Service Unavailable")));

console.log(
  fails.length ? `TRIAGE CHECKS FAILED:\n  ${fails.join("\n  ")}` : "ALL TRIAGE CHECKS PASSED"
);
process.exitCode = fails.length ? 1 : 0;
