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
        └──────────── briefing (extractive) ────────────────┤
                                                            ▼
                                              Next.js, built statically
```

Everything above is a scheduled GitHub Action. Nothing runs between editions.

---

## Running it

```bash
npm install
npm run edition   # gather the wire, then compile briefs
npm run dev
```

`npm run edition` reaches out to the feeds listed in
`services/ingestion/sources.ts` and rewrites `data/edition-latest.json`. The app
reads that file at build time.

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

The panel on each story is **extractive**: every line is a sentence a publisher
actually filed, selected automatically and attributed to the outlet that wrote
it. Nothing is generated, so nothing can be hallucinated — and it costs nothing.

Its honest limit: it can tell you *what was reported*, not *why it matters*.
Analysis requires generation, and manufacturing it algorithmically would mean
inventing editorial judgement and passing it off as reporting. So those fields
stay empty rather than being faked.

`services/ai/enrich.ts` implements the generated version against the Anthropic
API. It is dormant — it runs only if `ANTHROPIC_API_KEY` is set, and the paper
works without it.

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

The page turn is a real page curl: the sheet wraps a half-cylinder whose radius
is the paper's stiffness, arc length is conserved so the free edge stays under
your hand, and the crease leans toward whichever corner you take hold of. The
geometry lives in `lib/curl.ts`.

---

## Layout

```
app/                 pages: front, story, section, search
components/          editorial furniture, page-turn rig, voice reader
lib/
  types.ts           data model — source data kept apart from AI artifacts
  curl.ts            page-curl geometry
  search.ts          client-side index
services/
  ingestion/         feeds → normalise → cluster → rank
  ai/                briefing
data/                the editions themselves
.github/workflows/   the daily press run
```

---

## Deploying

Vercel's free tier, connected to the repository. The GitHub Action commits a new
edition each morning; Vercel rebuilds on the commit. No secrets are required.
