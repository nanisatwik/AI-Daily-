# The AI Daily

A daily AI newspaper that reads like a 1925 broadsheet and runs like a modern
content pipeline. Real stories, gathered from public feeds, deduplicated into
events, ranked editorially, and set in type you turn by hand.

**It costs nothing to run.** No database, no API server, no paid API, no
always-on process.

---

## Why it works this way

The edition changes once a day, so there is nothing to serve dynamically. A
scheduled job gathers the news, writes one JSON file, and commits it — and that
commit is the deploy. The site itself is static.

```
public RSS/Atom feeds
        │
        ▼
  ingestion  ──▶ normalise ──▶ deduplicate ──▶ cluster ──▶ rank
        │                                                   │
        │                                                   ▼
        │                                          data/edition-latest.json
        │                                                   │
        ├──────────── briefing (extractive) ────────────────┤
        └──────────── analysis (Gemini, optional) ──────────┤
                                                            ▼
                                              Next.js, built statically
```

Everything above is a scheduled GitHub Action. Nothing runs between editions.

---

## Running it

```bash
npm install
npm run edition   # gather the wire, then compile briefs
npm run analyse   # optional: write the analysis, needs GEMINI_API_KEY
npm run dev
```

`npm run edition` reaches out to the feeds listed in
`services/ingestion/sources.ts` and rewrites `data/edition-latest.json`. The app
reads that file at build time.

`npm run analyse` overlays model-written analysis onto that same file. Without
a key it prints a line saying so and changes nothing; with one, see below.
`ANALYSIS_LIMIT=3 npm run analyse` does three events, which is enough to see
the whole path work without spending an edition's worth of requests.

---

## How a story gets onto the page

Following the lifecycle in the product blueprint:

1. **Discovery** — ~12 public feeds: labs, wire publications, preprint servers,
   community boards.
2. **Relevance** — this is an AI paper, so general feeds pass a keyword gate. No
   story reaches the page without a stated reason for being there.
3. **Normalisation** — HTML entities decoded, publisher suffixes stripped,
   dates parsed. **An item with no usable date is dropped**, never stamped with
   "now" — otherwise a publisher's whole back catalogue arrives as today's news.
4. **Per-source cap** — no publisher may dominate. arXiv alone files hundreds of
   preprints a day.
5. **Clustering** — near-identical headlines from different outlets become one
   event, with every source preserved.
6. **Ranking** — corroboration weighted highest, then freshness, publisher
   record, novelty. Independent outlets choosing to cover the same event is the
   strongest free signal that it mattered.
7. **Briefing** — see below.
8. **Publish** — 24 events, set across three pages.

That corroboration count is what the **tally marks** beside each headline show.

---

## About the briefs

A story's panel is one of two things, and it says which on its face.

**Compiled from sources** is extractive: every line is a sentence a publisher
actually filed, selected automatically and attributed to the outlet that wrote
it. Nothing is generated, so nothing can be hallucinated — and it costs nothing.
Its honest limit is that it can tell you *what was reported*, not *why it
matters*.

**Written by a model** fills that gap. `services/ai/analyse.ts` asks Gemini for
the four fields the extractive pass cannot supply — the summary, the key
points, why it matters, who it lands on — and writes them onto the story.

What governs it is **retrieval before generation**. The model is handed the
headlines and standfirsts that publishers filed about that one event, and
nothing else. It is never asked what it knows about the news, because a model
asked that will answer, and the answer would be indistinguishable from the one
drawn from the sources. Three things hold the line:

- the prompt says the reports are the only evidence, and that a figure not in
  them may not be written;
- the model is given a way to decline, and a story it calls too thinly sourced
  simply keeps its extractive brief;
- every number in the returned brief is checked against the reports it was
  shown. One that appears in neither throws the whole brief away — a reply that
  invented a statistic has not earned trust in its other sentences.

It is **dormant without `GEMINI_API_KEY`**, and the paper prints exactly as it
does with one. The daily workflow step is `continue-on-error`, because the
edition going out matters more than the analysis on it.

### Why it is still free

Gemini's free tier needs no card, and `gemini-3.5-flash-lite` is the model it
is generous with: measured in September 2026 at 15 requests a minute and 500 a
day, against 5 and 20 for full Flash. An edition is 54 events and one request
each — 11% of the day's allowance, four minutes of mostly waiting at the
per-minute pace.

Google stopped publishing those numbers during 2026, so the script treats them
as perishable. They set the pacing; the run also stops the moment the API says
the day is spent, keeps everything already written, and leaves the rest of the
edition extractive. Since the clusters are ranked highest-first, a run that
stops early is one where the front of the paper got the analysis. Override
`GEMINI_MODEL`, `GEMINI_RPM` and `GEMINI_DAILY_REQUESTS` when the allowance
moves again.

---

## Reading it

| | |
|---|---|
| Drag the sheet | turn the page — left forward, right back |
| `←` `→` | turn by keyboard |
| `j` / `k` | next / previous story |
| `n` | gaslight edition |
| `?` | shortcuts |
| Read aloud | the edition spoken by your browser's own voice |

The page turn is a real fold. Press the sheet anywhere — a corner, an edge, the
middle of the paper — and it creases along the perpendicular bisector of the
line from your finger to where you drag it, so the point you took hold of stays
under your hand and everything on its side of the crease mirrors over. The
geometry lives in `lib/peel.ts`. Nothing is clipped by a path: both halves are
boxes turned to the crease and moved by transform alone, so a turn repaints
nothing.

---

## Layout

```
app/                 pages: front, story, section, search
components/          editorial furniture, page-turn rig, voice reader
lib/
  types.ts           data model — source data kept apart from AI artifacts
  peel.ts            page-fold geometry
  search.ts          client-side index
services/
  ingestion/         feeds → normalise → cluster → rank
  ai/                briefing, analysis, the recorded voice
data/                the editions themselves
.github/workflows/   the daily press run
```

---

## Accounts (optional)

Readers can subscribe to carry their desks, cities and clippings between
devices. **Everything works without this** — leave it unconfigured and
preferences simply stay on the device, with no account UI shown at all.

To enable it:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method** → enable *Email/Password*, and *Google*
   if you want the one-tap option.
3. **Firestore Database → Create database** → start in production mode.
4. **Project settings → Your apps → Web** → copy the config values into
   `.env.local` using `.env.example` as the template.
5. Deploy the rules — this step is not optional, see below:

```bash
firebase deploy --only firestore:rules
```

### Why the rules matter more than the keys

The browser talks to Firestore directly; there is no server of ours in
between. That is what lets accounts exist without giving up free static
hosting — and it means **`firestore.rules` is the entire security boundary**,
not a second line of defence behind one. Anything those rules permit, a hostile
client can do. They restrict every reader to their own document and cap the
size of what can be written.

The `NEXT_PUBLIC_FIREBASE_*` values are **not secrets**. A Firebase web API key
identifies the project; it does not grant access to it, and Google ships it in
every Firebase web app's bundle. Real `.env` files stay out of git;
`.env.example` is committed deliberately.

### How syncing behaves

Device-first. Preferences are written to `localStorage` immediately, so the app
never waits on the network and works offline. When signed in they also sync:

- Signing in on a **new device** adopts the account's preferences.
- Signing in on the **first** device seeds the account from what is already there.
- Changes on one device appear on the others through a live subscription.
- Writes are coalesced, so toggling five chips is one write rather than five.

---

## The mobile app

`mobile/` is a native iOS and Android client — Expo SDK 57, TypeScript,
expo-router — built from the same paper as the website.

```bash
cd mobile
npm install
npm start          # then press i, a, or scan the QR code with Expo Go
```

| | |
|---|---|
| `npm start` | Metro, for Expo Go or a simulator |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run assets` | regenerates the icons and the grain tile |
| `npm run bundle` | production bundle for both platforms, as a build check |

**It has no backend of its own.** It reads the same static endpoint anyone
can, `/api/edition`, and caches the document on the device — so a paper you
have already opened stays readable with no signal, and the front page says
plainly how old it is when it came from the cache. Pull down to reach the
press. Nothing here needs a key, an account, or a paid tier.

The type is the four faces the website uses, via `@expo-google-fonts`. The
paper grain is a 128px noise tile, generated by `mobile/scripts/make-assets.mjs`
with nothing but `node:zlib`, and repeated by the compositor.

There is no page fold. `lib/peel.ts` is a tuned piece of geometry, and an
imitation of it would be worse than the honest vertical scroll the app uses
instead.

---

## Deploying

Vercel's free tier, connected to the repository. The GitHub Action commits a new
edition each morning; Vercel rebuilds on the commit. No secrets are required to
deploy — the one the Action can use, `GEMINI_API_KEY`, is optional, free, and
only ever read at press time.
