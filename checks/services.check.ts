/**
 * No job runs itself just because something imported it.
 *
 * Every file under services/ is a standalone worker with a `main()`, and each
 * one calls it at module scope so that `node services/ingestion/run.ts` does
 * the thing. That is fine until somebody imports one exported helper out of
 * such a file — and checks/localdesk.check.ts imports `withLocalDesk` from
 * services/ingestion/run.ts, which meant running the check suite fetched
 * thirty-seven live feeds and rewrote data/edition-latest.json underneath every
 * other suite in the same run.
 *
 * It was noticed only because the story count moved from 237 to 238 between two
 * runs of `npm run check`. On a CI runner it would have rewritten the paper on
 * every push, and the recorded bulletin — which is fingerprinted against the
 * script the edition produces — would have stopped matching it.
 *
 * So the guard is asserted here rather than remembered. The test is textual on
 * purpose: importing these modules to find out whether importing them has side
 * effects is the very thing being guarded against.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, so this runs on any machine and on a CI runner. */
const REPO = fileURLToPath(new URL("..", import.meta.url));

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => {
  if (!c) fails.push(`${n} — ${d}`);
};

/** Every .ts under services/, walked. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const files = walk(join(REPO, "services"));
ok("found.some", files.length > 0, "no service files found, which is itself wrong");

let guarded = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const name = file.slice(REPO.length).replace(/\\/g, "/");

  /*
   * A job is a file that DECLARES a main(), not one that happens to call it at
   * the left margin. The first version of this test looked for `^main()` and
   * so stopped recognising a file the moment it was guarded — the call moves
   * inside the `if` and indents. It reported one job where there are six, and
   * would have quietly stopped guarding anything.
   */
  if (!/(?:async )?function main\s*\(/.test(src)) continue;
  guarded++;

  ok(
    `guarded.${name}`,
    src.includes("invokedDirectly"),
    "calls main() at module scope with no guard, so importing anything from it runs the whole job"
  );

  /*
   * And the guard has to be the real comparison. `process.argv[1]` alone is
   * truthy for every direct run of anything, so a guard written against its
   * mere presence would pass this check and still fire on import.
   */
  ok(
    `guarded.${name}.comparesTheUrl`,
    src.includes("import.meta.url === pathToFileURL(process.argv[1]).href"),
    "the guard must compare this module's URL against the file node was asked to run"
  );
}

ok(
  "guarded.count",
  guarded >= 6,
  `only ${guarded} jobs found; there are six — the ingestion, the briefs, the analysis, the recorder, the health report and the icon generator`
);

/*
 * The one that actually bit. Named explicitly because it is the import that
 * exists today, and a future reader deserves to know which pair of files this
 * whole suite is about.
 */
{
  const localdesk = readFileSync(join(REPO, "checks", "localdesk.check.ts"), "utf8");
  const run = readFileSync(join(REPO, "services", "ingestion", "run.ts"), "utf8");
  ok(
    "theImportThatBit",
    !localdesk.includes("services/ingestion/run.ts") || run.includes("invokedDirectly"),
    "localdesk.check.ts imports run.ts, and run.ts is unguarded — the suite will rewrite the edition"
  );
}

console.log(
  fails.length
    ? `SERVICES CHECKS FAILED (${fails.length}):\n  ${fails.join("\n  ")}`
    : `ALL SERVICES CHECKS PASSED — ${guarded} self-running jobs, all guarded`
);
process.exitCode = fails.length ? 1 : 0;
