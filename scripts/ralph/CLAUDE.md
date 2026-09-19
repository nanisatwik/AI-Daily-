# Ralph — one story, then stop

You are one iteration of an autonomous loop on **The AI Daily**, a 1925
broadsheet that aggregates AI news. You have clean context. Everything you
need is in git history, `prd.json` and `progress.txt`, and everything the
next iteration needs must be written back into them before you finish.

Do **one** story. Not two. Stop.

## 1. Read first, in this order

1. `progress.txt` — what previous iterations learned. Read all of it.
2. `AGENTS.md` — the project's standing rules and gotchas. Binding.
3. `UI-GUIDE.md` — the design system, if the story touches anything visual.
   Its section 5 lists performance rules that were each paid for with a
   regression; treat them as binding too.
4. `prd.json` — pick the story.

## 2. Pick the story

The lowest `priority` number among stories where `passes` is `false` and
`blockedBy` is absent. A story with `blockedBy` needs something from a human —
skip it, never clear it yourself.

## 3. Build it

The rules that govern this codebase, which you do not get to relax:

- **Everything costs $0.** No paid services, no new runtime dependencies
  without a stated reason. Current runtime deps are `next`, `react`, `motion`,
  `firebase`, `kokoro-js`, `zod`.
- **This is not the Next.js you know.** Read the relevant file under
  `node_modules/next/dist/docs/` before writing framework code. Guessing an
  API from memory has already cost this project real bugs.
- **Comments are prose explaining WHY**, usually citing a measured number or a
  specific past failure. Never write a comment that restates the code. Read
  `lib/briefing.ts` or `services/ai/provider.ts` for the register.
- **Measure before you claim.** If you change a constant, say what you measured
  and how. This project's discipline is a numeric check written *before* the
  logic is trusted — see `checks/`.

## 4. Prove it

Run these. All of them. They are the only thing standing between you and the
next iteration inheriting broken code:

```bash
npx tsc --noEmit      # must be clean
npm run check         # every check suite
npm run build         # must pass
```

If the story touches the UI, you must also **look at it** — start the preview
and view the page at both phone and desktop width, in both the day and night
editions. Two cautions learned the hard way in this repo:

- The preview pane intermittently returns a blank screenshot when the window
  is not frontmost. That is an environment artifact, not your bug. Verify with
  `read_page` or computed styles instead and say which you did.
- Console buffers survive navigation. Open a fresh tab before concluding there
  are errors, or you will be reading someone else's.

If a check fails, fix it. If the check itself is wrong, fix the check and say
so in the commit — but be certain, because "the check is wrong" is the most
expensive thing you can be mistaken about.

## 5. Record what you learned

**This is the part that makes the loop work.** You are about to lose your
memory entirely.

- Append to `progress.txt`: what you did, what surprised you, what the next
  iteration should not waste time rediscovering. Append only; never rewrite
  history.
- Add durable facts to `AGENTS.md` — patterns, gotchas, "X lives in Y". If you
  learned something that would have saved you an hour, it goes there.

## 6. Commit and mark it done

Commit the work with a message that explains *why*, in the style of the
repository's history (`git log` — the messages are prose, not bullet lists).
Then set that story's `passes` to `true` in `prd.json` and commit that too.

Do not push. Do not start another story. Stop.

## When everything is done

If every story has `passes: true`, output exactly:

```
<promise>COMPLETE</promise>
```
