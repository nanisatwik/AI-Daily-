<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# The AI Daily

A 1925 broadsheet that aggregates AI news. One edition a day, gathered and
typeset by a GitHub Action, committed to the repository, served static. There
is no server and no database.

## Rules that are not negotiable

- **Everything costs $0.** Free tiers only, no card on file anywhere. This
  decides most of the architecture, including why the bulletin is recorded at
  press time rather than synthesised in the reader's browser.
- **No new runtime dependency without a stated reason.** They are `next`,
  `react`, `motion`, `firebase`, `kokoro-js`, `zod`.
- **The page canvas is fixed.** Every sheet is the same physical sheet; a page
  with five stories and one with sixteen are the same piece of paper. Adding a
  section consumes paper, it does not make the sheet taller.
- **Nothing a model wrote goes unlabelled.** `Story.body` is always a
  publisher's own sentence. Generated copy appears only inside
  `components/AiBrief.tsx`, always with a visible label.

## Verify before you claim

```bash
npx tsc --noEmit
npm run check     # every numeric check suite
npm run build
```

Write the check *before* the logic, then prove the check can fail: sabotage
what it guards, watch it report, restore. Derive figures rather than hardcoding
them — the press runs nightly and any literal count goes stale by morning.

## Gotchas this project has already paid for

- **`.night` and `.turning` are both on `<html>`.** Two classes on one element
  need a compound selector. `.night .turning` matches nothing and fails
  silently.
- **`backdrop-filter` is the most expensive property here.** It is declared
  once, on `.glass`, and deliberately suspended inside `.turning`, because a
  page turn is a full-screen transform and every frame would be a fresh sample
  of a moving image. Never declare it on a component.
- **Heredocs eat backslashes** — a doubled backslash collapses to one. Use the
  editor for anything containing a regex. This has corrupted files three times.
- **The preview pane sometimes returns blank screenshots** when the window is
  not frontmost, and **console buffers survive navigation**. Neither is your
  bug. Open a fresh tab; verify with computed styles.
- **`lib/digest.ts` is today's edition. `lib/archive.ts` is every edition.**
  Reaching for the wrong one is the most common mistake in this codebase —
  story pages serve 237 columns, the front page serves 54.
- **The recorded bulletin maps audio marks onto script lines by index.** A
  recording of a different script does not sound worse, it highlights and seeks
  to the wrong sentence with total confidence. `recordingFits` guards it; if
  you change how the script is built, re-record.

- **`npx tsc --noEmit` fails on a fresh checkout.** The routes use Next's
  generated types (`LayoutProps`, `PageProps`), which live in `.next/types` —
  a build artifact. Run `npx next typegen` first. Locally you always have one
  lying around, so this only ever bites in CI.
- **`npm ci` is stricter than `npm install`.** It refuses a package-lock that
  disagrees with package.json. After any dependency change, regenerate with
  `npm install --package-lock-only` or CI fails on its first step.

## Working in the Ralph loop

`prd.json` is the task list, `progress.txt` the memory, `scripts/ralph/` the
loop and its prompt. One story per iteration, quality-gated, committed, then
stop. Stories carrying `blockedBy` need a human; skip them and never clear the
field.
