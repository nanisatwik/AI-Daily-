/**
 * The floating chrome, checked against the rules it must not break.
 *
 * `backdrop-filter` is the most expensive property on this page: it makes the
 * compositor re-sample everything behind the element every frame, and a page
 * turn is a full-screen transform, so every frame is a fresh sample of a
 * moving image. The grain and the ragged edges are already suspended for the
 * duration of a turn — see `.turning` — and glass has to be suspended with
 * them or it undoes that work.
 *
 * This reads the stylesheet as text rather than through a browser, because the
 * property it is guarding is one nobody will notice the loss of: dropping the
 * suspension does not break a layout or throw, it just quietly costs frames on
 * the one interaction the whole product is judged on.
 */
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";


/** The repository root, so these run on any machine and on a CI runner. */
const REPO = fileURLToPath(new URL("..", import.meta.url));
const CSS = readFileSync(
  `${REPO}app/globals.css`,
  "utf8"
);

const fails: string[] = [];
const ok = (n: string, c: boolean, d = "") => { if (!c) fails.push(`${n} — ${d}`); };

/** The body of one rule, by selector. Null when the selector is absent. */
function rule(selector: string): string | null {
  const at = CSS.indexOf(selector + " {");
  if (at === -1) return null;
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

/* -- the pane exists and is actually glass ----------------------------- */
const glass = rule(".glass");
ok("glass.exists", glass !== null, "no .glass rule in globals.css");
ok("glass.blurs", !!glass && /backdrop-filter:\s*blur/.test(glass), "glass without a blur is a tint");
ok(
  "glass.prefixed",
  !!glass && /-webkit-backdrop-filter/.test(glass),
  "Safari needs the prefixed property; without it iOS gets a flat panel"
);
ok("glass.hasRim", !!glass && /border:/.test(glass), "the rim light is what reads as thickness");

/* -- and it is suspended while a sheet is in the air -------------------- */
const turning = rule(".turning .glass");
ok("turning.suspends", turning !== null, "no `.turning .glass` rule — a turn will pay for the blur");
ok(
  "turning.killsBlur",
  !!turning && /backdrop-filter:\s*none/.test(turning),
  "the suspension must set backdrop-filter to none, not merely change the tint"
);
ok(
  "turning.staysVisible",
  !!turning && /background:/.test(turning),
  "dropping the blur without an opaque fallback makes the bar blink out mid-turn"
);

/* -- night is handled, because the paper flips ------------------------- */
ok("night.glass", rule(".night .glass") !== null, "glass over an ink sheet needs the opposite tint");

/**
 * Two classes on one element need a compound selector, not a descendant one.
 *
 * `night` and `turning` are both toggled on `<html>` — by NightToggle and by
 * Newspaper. Written `.night .turning`, the rule asks for a turning element
 * inside a night one, matches nothing, and falls through in silence: the
 * mid-turn pane lands on `--paper` instead of `--paper-deep` and the only
 * symptom is a shade nobody is looking at during a third of a second of
 * movement. It shipped that way and was caught by reading, not by looking.
 */
{
  const dead = /\.night\s+\.turning|\.turning\s+\.night/.test(CSS);
  ok(
    "night.turningIsCompound",
    !dead,
    "`.night .turning` cannot match — both classes are on <html>; write `.night.turning`"
  );
  ok(
    "night.turningExists",
    /\.night\.turning\s+\.glass\s*\{/.test(CSS),
    "no compound night+turning rule, so the night pane has no mid-turn fallback"
  );
}

/* -- the dark ground and its texture ----------------------------------- */
ok("shell.exists", rule(".shell") !== null);
const half = rule(".halftone");
ok("halftone.exists", half !== null);
ok(
  "halftone.isADotField",
  !!half && /radial-gradient/.test(half) && /background-size:\s*5px/.test(half),
  "the 5px dot pitch is the point — it is how a press renders a photograph"
);

/* -- nothing else may declare its own backdrop-filter ------------------ */
{
  // One definition, so one place to suspend. A component that rolls its own
  // blur is a component `.turning` cannot reach.
  const all = CSS.match(/(?<!-webkit-)backdrop-filter:/g) ?? [];
  ok(
    "blur.declaredOnce",
    all.length <= 2,
    `${all.length} unprefixed backdrop-filter declarations; expected .glass and its suspension only`
  );
}

console.log(
  fails.length
    ? `CHROME CHECKS FAILED (${fails.length}):\n  ${fails.join("\n  ")}`
    : "ALL CHROME CHECKS PASSED"
);
process.exitCode = fails.length ? 1 : 0;
