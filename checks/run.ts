/**
 * Every numeric check in the repository, run in one go.
 *
 *   npm run check
 *
 * These suites are the project's verification discipline: a check is written
 * before the logic it guards is trusted, and it is sabotaged once to prove it
 * can fail. They have caught a slice() overflow that returned a hundred
 * stories for a fifty-four-story page, a quota regex that matched only
 * whitespace, a commit threshold that made the page turn unsatisfiable from
 * the inner half of the sheet, and a CSS selector that could never match.
 *
 * They lived outside the repository until now, which meant they protected only
 * whoever happened to have them. Nothing ran them on a fresh clone, nothing
 * ran them in CI, and the nightly press run could move any figure they assert
 * on without anyone hearing about it.
 *
 * Run as child processes rather than imported. Each suite ends with
 * `process.exit`, several mutate `process.env` to exercise configuration, and
 * two register a module resolve hook — importing them into one process would
 * have them fighting over it. A process each is slower and cannot lie.
 */

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

/** Node's own noise about stripping types, which is not a check result. */
const NOISE =
  /ExperimentalWarning|Type Stripping|MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES module|To eliminate this warning|trace-warnings|^\(node:\d+\)|^Assertion failed.*uv|^$/;

type Result = { name: string; ok: boolean; verdict: string; output: string };

function run(file: string): Promise<Result> {
  return new Promise((resolve) => {
    // cwd is the repository root so a suite may read data/ by relative path.
    const child = spawn(process.execPath, [join(HERE, file)], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));

    child.on("close", (code) => {
      const lines = out
        .split(/\r?\n/)
        .filter((l) => !NOISE.test(l.trim()));
      const verdict =
        lines.filter((l) => /PASSED|FAILED/.test(l)).pop() ??
        lines[lines.length - 1] ??
        "(no output)";
      resolve({
        name: file.replace(/\.check\.ts$/, ""),
        // The exit code is the contract; the printed verdict is for a human.
        ok: code === 0,
        verdict: verdict.trim(),
        output: lines.join("\n"),
      });
    });
  });
}

const suites = readdirSync(HERE)
  .filter((f) => f.endsWith(".check.ts"))
  .sort();

if (suites.length === 0) {
  console.error("No check suites found in checks/. That is itself a failure.");
  process.exit(1);
}

const results: Result[] = [];
for (const suite of suites) {
  const r = await run(suite);
  results.push(r);
  const mark = r.ok ? "ok  " : "FAIL";
  console.log(`${mark} ${r.name.padEnd(12)} ${r.verdict.slice(0, 96)}`);
}

const failed = results.filter((r) => !r.ok);

if (failed.length > 0) {
  for (const f of failed) {
    console.error(`\n──── ${f.name} ────\n${f.output}`);
  }
  console.error(`\n${failed.length} of ${results.length} suites failed.`);
  process.exit(1);
}

console.log(`\n${results.length} suites passed.`);
