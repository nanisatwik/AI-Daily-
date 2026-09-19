/**
 * The local desk, checked numerically.
 *
 * Reserving column inches is easy to get subtly wrong in ways a glance would
 * miss: dropping a local story to make room for another local story, returning
 * the wrong number of stories, or leaving the page out of editorial order so
 * that reserving a place quietly becomes promoting local news to the top.
 */

import { withLocalDesk } from "../services/ingestion/run.ts";

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} ${d}`); };

type C = { id: string; cities: string[]; score: number };
/** `local` marks which positions carry a city, in descending score order. */
const pool = (n: number, local: number[]): C[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    cities: local.includes(i) ? ["Toronto"] : [],
    score: 1 - i / n,
  }));

const run = (p: C[], max: number, slots: number) =>
  withLocalDesk(p as never, max, slots) as unknown as C[];

const isLocal = (c: C) => c.cities.length > 0;
const ordered = (out: C[]) => out.every((c, i) => i === 0 || out[i - 1].score >= c.score);

/* -- 1. the real shape: a few local in the cut, more below --------------- */
{
  // 100 events, 54 printed, 8 slots. Two local inside the cut, plenty below.
  const p = pool(100, [3, 20, 60, 61, 70, 80, 90, 95, 96]);
  const out = run(p, 54, 8);
  ok("real.size", out.length === 54, `got ${out.length}`);
  ok("real.reachesSlots", out.filter(isLocal).length === 8, `got ${out.filter(isLocal).length}`);
  ok("real.stillOrdered", ordered(out));
  // every local that was already in the cut must survive
  ok("real.keptOriginals", [3, 20].every((i) => out.some((c) => c.id === `c${i}`)));
  // it should take the BEST available below the line, not any
  ok("real.tookBest", out.some((c) => c.id === "c60") && out.some((c) => c.id === "c61"));
}

/* -- 2. never drop a local story to reach the quota ---------------------- */
{
  // Nine local already inside the cut, quota of eight: must not shed one.
  const p = pool(100, [0, 1, 2, 3, 4, 5, 6, 7, 8, 70]);
  const out = run(p, 54, 8);
  ok("surplus.noOp", out.length === 54);
  ok("surplus.keepsNine", out.filter(isLocal).length === 9, `got ${out.filter(isLocal).length}`);
  ok("surplus.didNotPromote", !out.some((c) => c.id === "c70"), "promoted despite quota met");
}

/* -- 3. nothing to promote → unchanged ---------------------------------- */
{
  const p = pool(100, [2, 5]); // both already inside the cut
  const out = run(p, 54, 8);
  ok("none.size", out.length === 54);
  ok("none.unchanged", out.every((c, i) => c.id === p[i].id), "cut was altered with nothing to promote");
}

/* -- 4. no local anywhere → exactly the plain cut ------------------------ */
{
  const p = pool(100, []);
  const out = run(p, 54, 8);
  ok("empty.identical", out.length === 54 && out.every((c, i) => c.id === p[i].id));
}

/* -- 5. the weakest UNTAGGED make way, and only them --------------------- */
{
  const p = pool(60, [0, 55, 56, 57]);
  const out = run(p, 10, 3);
  ok("room.size", out.length === 10, `got ${out.length}`);
  ok("room.reached", out.filter(isLocal).length === 3);
  // c8 and c9 were the weakest untagged in the cut; they are what should go
  ok("room.droppedWeakest", !out.some((c) => c.id === "c9") && !out.some((c) => c.id === "c8"));
  // and the strongest untagged must all survive
  ok("room.keptStrongest", [1, 2, 3, 4, 5].every((i) => out.some((c) => c.id === `c${i}`)));
}

/* -- 6. fewer events than the page holds -------------------------------- */
{
  const p = pool(5, [4]);
  const out = run(p, 54, 8);
  ok("short.allOfThem", out.length === 5, `got ${out.length}`);
  ok("short.keepsLocal", out.some((c) => c.id === "c4"));
}

/* -- 7. degenerate ------------------------------------------------------ */
ok("degen.emptyPool", run([], 54, 8).length === 0);
ok("degen.zeroSlots", run(pool(60, [55]), 54, 0).length === 54);
{
  // More slots than the page has room for: cannot exceed max, cannot loop.
  const out = run(pool(200, Array.from({ length: 100 }, (_, i) => 100 + i)), 54, 999);
  ok("degen.slotsOverMax", out.length === 54, `got ${out.length}`);
  ok("degen.stillOrdered", ordered(out));
}

/* -- 8. no duplicates ever introduced ----------------------------------- */
{
  const out = run(pool(100, [3, 20, 60, 61, 70, 80]), 54, 8);
  ok("unique", new Set(out.map((c) => c.id)).size === out.length, "duplicate story in the edition");
}

console.log(
  fails.length
    ? `LOCAL DESK CHECKS FAILED:\n  ${fails.join("\n  ")}`
    : "ALL LOCAL DESK CHECKS PASSED"
);
process.exitCode = fails.length ? 1 : 0;
