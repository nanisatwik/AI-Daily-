# The AI Daily — project & UI context

Everything you need to change how this thing looks without breaking the parts
that were expensive to get right.

Written 2026-09-18, against commit `c0d2791`. Figures below that count
stories, pages or editions move every morning when the press runs — treat them
as the shape of the thing, not as current values.

---

## 1. What it is

An AI news aggregator dressed as a 1925 broadsheet. One edition a day, printed
by a GitHub Action at 05:10 UTC, committed to the repo, deployed by Vercel.

**The look is the product.** Everything below exists to serve that.

### Hard constraints

| Rule | Why |
|---|---|
| **Everything costs $0** | No paid services, ever. Free tiers only, no card on file. |
| **No server** | The edition is a committed JSON file. Pages are static. |
| **No new dependencies without a real reason** | Current runtime deps: `next`, `react`, `motion`, `firebase`, `kokoro-js`, `zod`. That's it. |
| **The page canvas is fixed** | Every page is the same physical sheet. Empty space is still paper. |

### Stack

Next.js **16.3.4** (App Router, Turbopack) · React 19.2.8 · Tailwind **v4** ·
TypeScript · `motion` v13 for animation.

> ⚠️ **This is not the Next.js you know.** `AGENTS.md` says it and it's true —
> APIs have shifted. Read `node_modules/next/dist/docs/` before writing
> framework code. Real example from today: `error.tsx` now provides **`retry`**,
> not `reset`, and the docs explicitly discourage `reset`.

### Run it

```bash
npm run dev
```

Other scripts: `npm run build`, `npm run ingest` (fetch news), `npm run brief`,
`npm run analyse`, `npm run voice` (record the audio bulletin).

---

## 2. The visual system

All of it lives in **`app/globals.css`** (355 lines). That file *is* the design
system — there is no Tailwind config with custom tokens, no theme file.

### Colour tokens

Defined on `:root`, overridden wholesale under `.night`. Tailwind v4 exposes
them via `@theme inline`, so `bg-paper` / `text-ink` work as utilities, and
`var(--paper)` works in arbitrary values.

| Token | Day | Night | Used for |
|---|---|---|---|
| `--paper` | `#e7d9bb` | `#17120c` | The sheet itself |
| `--paper-deep` | `#dcc9a4` | `#100c08` | Behind the sheet, stacked page edges, scrollbar track |
| `--ink` | `#2b1f12` | `#e4d6b8` | Body text, heavy rules, borders |
| `--ink-soft` | `#5c4830` | `#b39f7d` | Decks, secondary prose |
| `--ink-faint` | `#8a7454` | `#7d6b4f` | `.meta`, captions, the quietest text |
| `--rule` | `#a68f68` | `#4a3c28` | Hairline rules, column dividers |
| `--accent` | `#8b2e1f` | `#cf7a5e` | Section kickers, drop caps, links on hover, selection |
| `--grain` | `0.16` | `0.1` | Grain layer opacity |
| `--vignette` | `0.13` | `0.42` | Vignette strength |
| `--crease-shade` / `--crease-light` | — | — | The horizontal fold crease |
| `--sheet-back` | `#d8c7a2` | `#0d0a06` | Reverse of a turning page |

**If you change one colour, change its night twin.** They're two separate
blocks in the same file, about 25 lines apart. Night mode is a `night` class on
`<html>`, set before paint by an inline script in `app/layout.tsx` so there's no
flash; `@custom-variant night` makes `night:` available as a Tailwind prefix.

### Typography

Four families, all Google Fonts via `next/font` in `app/layout.tsx`:

| Variable | Family | Role |
|---|---|---|
| `--font-mast` | **UnifrakturMaguntia** | The nameplate. Blackletter. Also page numbers in the footer. |
| `--font-head` | **Libre Caslon Display** | Large headlines, drop caps. Display cut — needs no synthetic bold. |
| `--font-body` | **Libre Caslon Text** | Body copy, small headlines, decks. 400/700, roman + italic. |
| `--font-label` | **Libre Franklin** | All furniture: kickers, meta lines, buttons. |

### Type classes — use these, don't reinvent

| Class | What it is |
|---|---|
| `.kicker` | 11px Franklin, 600, `0.15em` tracking, uppercase. Section labels, buttons, small caps furniture. |
| `.meta` | 11px Franklin, 500, `0.1em` tracking, uppercase, `--ink-faint`. Bylines, folio facts. |
| `.headline` | Caslon **Text** bold, `line-height: 1.14`, balanced. Smaller headlines — as a real paper sets them. |
| `.headline-caps` | Caslon **Display** 400, uppercase, `line-height: 1.03`, balanced. Large headlines only. |
| `.prose-column` | 16px, `line-height: 1.66`, **justified**, `hyphens: auto`. Body copy. `p + p` gets `0.95em` top margin. |
| `.drop-cap` | `::first-letter` floated, 4em, Caslon Display, accent-coloured. |

The `.headline` / `.headline-caps` split is deliberate: **text cuts take a bold
weight, display cuts don't.** Don't apply `font-bold` to `.headline-caps`.

### Rules and ornaments

| Class | Renders |
|---|---|
| `.rule-double` | 3px over 1px — the heavy rule above the nameplate |
| `.rule-triple` | 1px over 3px — closes the nameplate |
| `.ornament-rule` | Flex row with hairlines either side of its content |
| `.rule-draw` | Animates `scaleX` 0→1 over 900ms. Compositor-only. |
| `.page-edges` | `::before`/`::after` stacked sheets behind the page |
| `.fold-crease` | The horizontal crease of a folded broadsheet |
| `.story-link` | Headline turns accent on hover; 2px accent focus ring at 8px offset |
| `.is-cued` | Left bar marking the line being read aloud |

SVG ornaments live in **`components/Ornament.tsx`**: `CornerFlourish`,
`OrnateFrame`, `Fleuron`, `FleuronRule`, `PointingHand`, `Seal`.

### Texture

`components/PaperTexture.tsx` mounts three things globally:

1. **`#cut-edge`** — an SVG `feTurbulence` + `feDisplacementMap` filter giving
   the sheet's border the waver of a guillotine cut. Applied via
   `style={{ filter: "url(#cut-edge)" }}`.
2. **`.paper-grain`** — a repeated **180px** noise tile, `mix-blend-mode: multiply`
   (`screen` at night), `z-index: 60`.
3. **`.paper-vignette`** — radial gradient, `z-index: 59`.

---

## 3. Layout architecture

### The fixed page canvas — the rule that governs everything

**`components/PageSheet.tsx`** is one physical sheet. It fills the height it is
*given*, not the height its content needs: `h-full` all the way down, footer
pushed with `mt-auto`.

> A page with five stories and a page with sixteen are the same piece of paper.
> The difference is how much of it is printed on.

If you add a section to a page, it consumes paper — it does not make the sheet
taller. Break this and pages stop matching each other mid-turn.

Each sheet carries: the stock (`--paper` + 2px ink border + `cut-edge`), an
`OrnateFrame`, a `fold-crease` at 52%, an optional running head, the content,
and a footer with `The AI Daily` / fleuron / page number.

### Page composition

```
app/page.tsx
  └── Newspaper (the page-turn rig)
        ├── PageSheet 1 → FrontPage
        └── PageSheet 2..n → InnerPage
```

**`components/editionPages.tsx`** holds both layouts.

**FrontPage** — `Masthead`, `SectionNav`, `StopPress`, then a three-column grid:

```
lg:grid-cols-[192px_minmax(0,1fr)_252px]
   ↑ Today index      ↑ lead story      ↑ "Also today" rail
```

then a full-width "More from the wire" 3-column strip.

**InnerPage** — `SectionBanner`, then `lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]`
(feature + "In brief" rail), then a 3-column strip. The last sheet gets a
closing colophon.

### Story components — `components/stories.tsx`

| Component | Where | Notes |
|---|---|---|
| `LeadStory` | Front page centre | `.headline-caps`, centred italic deck, 2-column justified body with drop cap |
| `FeatureStory` | Inner page | Same shape, smaller |
| `RailItem` | Side rails | `.headline` at 1.2rem, deck, tally marks |
| `ColumnItem` | Bottom strips | `.headline` at 1.35rem |
| `SectionBanner` | Section headers | Reversed kicker (ink block, paper text) + rule |
| `TallyMarks` | Bylines | **Hand-drawn SVG** — 4 strokes + a diagonal per 5 sources |
| `JumpLine` | Front page | "Continued on page 2 —" |

**`leadSize()`** in that file steps the lead headline down by length, the way a
compositor fits type to a column:

```
≤38 chars → clamp(2rem, 5vw, 3.6rem)
≤62       → clamp(1.75rem, 4vw, 2.9rem)
≤88       → clamp(1.5rem, 3.2vw, 2.3rem)
else      → clamp(1.35rem, 2.6vw, 1.95rem)
```

Wire headlines are much longer than a sub-editor's. Without this they become six
lines of banner type.

### The masthead — `components/Masthead.tsx`

Night toggle → `rule-double` → nameplate (with "The" tab left, `Seal` right) →
`FleuronRule` → `rule-triple rule-draw` → **folio line** → **almanac band**.

The folio line is a `1fr auto 1fr` grid, *not* `justify-between`. With four
facts of different widths, `justify-between` put the date — the one fact people
look for — well left of centre. The grid centres it against the page.

The almanac band is `minmax(0,1fr) minmax(0,1.4fr)`: `WeatherBox` left,
`OnThisDay` right. Uneven on purpose — a weather reading is a short phrase, an
almanac line is a sentence. **Both cells hold their height in every state**, so
nothing below the masthead moves once painted.

### Motion primitives — `components/motion.tsx`

`InkStamp`, `Reveal`, `Stagger`, `StaggerItem`, `DrawRule`, `PressIn`, `PageIn`.
All share `PRESS_EASE`. Durations 0.25s–1.1s. Use these rather than writing new
`motion.div`s, so entrances stay consistent.

---

## 4. The page turn — `components/Newspaper.tsx`

**This is the main attraction. Be careful here.** 1092 lines, the single most
worked-on file in the project.

It is a **corner peel**: grab the sheet from any corner or edge and it folds
along the perpendicular bisector of grab→hand, with a reflected backside and
Sutherland–Hodgman polygon clipping. Geometry is in **`lib/peel.ts`**
(`peelGeometry`, `peelLayers`, `foldReach`, `foldClearance`), commit logic in
**`lib/turn.ts`**.

### Tunable constants

| Constant | Value | Meaning |
|---|---|---|
| `TURN_MS` | `340` | A full uninterrupted turn. Was 1050ms — roughly 3× what a hand takes. |
| `TAP_ZONE` | `0.16` | Share of each side that turns the page when tapped |
| `SLOP` | `8` | Pixels before a press becomes a drag (so clicks still work) |
| `FLICK_WINDOW_MS` | `90` | How long a hand may pause before a release stops counting as a flick |
| `DRIVEN_GRAB` | `0.78` | Where a button-driven turn is taken hold of |
| `DRIVEN_LEAN` | `0.2` | How far a driven crease leans |
| `COMMIT_PROGRESS` | `0.3` | *(lib/turn.ts)* Fraction of available travel that commits |
| `FLICK_SPEED` | `0.45` | *(lib/turn.ts)* px/ms that commits regardless of distance |

`pageEase(t)` is a hand-built three-phase curve — 0–13% the corner easing off,
13–78% the sweep, 78–100% a landing where the last 8% of distance is spread over
a fifth of the time. Continuous, monotonic, never exceeds 1. **Paper settles, it
does not bounce** — don't swap in a spring.

### Two bugs that took a long time to find

- **Progress was measured against the sheet's full width** while the hand's
  available travel is bounded by *where you grabbed*. Grabbing near the spine
  made the turn literally impossible to complete. Fixed by `travelProgress()`.
- **`.turning` exists for a reason.** While a sheet moves, grain, vignette and
  the ragged-edge filters are suppressed:

```css
.turning .paper-grain,
.turning .paper-vignette { display: none; }
.turning .page-edges::before,
.turning .page-edges::after { filter: none; }
.turning .rule-draw { animation: none; }
```

Grain is a full-viewport blended layer; the edges run a displacement filter on
six pseudo-elements. None of it is perceptible mid-flip. Removing this costs
about sixty repaints a second.

---

## 5. Performance rules, learned the hard way

These were each paid for with a real regression. Please keep them.

1. **`transform` and `opacity` are composited. `width`, `left`, `top` and
   `clip-path` are not.** Animate the first two.
2. **The browser runs one layout pass per frame, not one per write.** Removing
   22 `width` writes achieved *nothing* while a single `left`/`width` on the
   shadow kept the layout pass alive. Remove *all* of them or none.
3. **Don't put a live filter over the viewport.** The grain used to be a
   full-screen `feTurbulence` — per-pixel Perlin noise over ~2M pixels, every
   frame. As a 180px tile it's 32,400 pixels rasterised once and repeated by
   the compositor: ~60× less work.
4. **`clip-path` forces a repaint of clipped content.** Use `overflow: clip` +
   `overflow-clip-margin` on a rotated wrapper.
5. **A rule is two borders, not an SVG line.** The nameplate rule was a
   stretched `<svg><line>` animated via `pathLength`; once the viewBox stretched
   ~12× across a broadsheet, `pathLength` and `non-scaling-stroke` disagreed and
   it rendered as **a row of stray dashes**. It's now `scaleX`.
6. **`prefers-reduced-motion` collapses durations globally** at the foot of
   `globals.css`. Anything with a *delay* needs its own override, or it just
   disappears for a quarter second — see `.rule-draw`.

---

## 6. Responsive

Mobile-first. Actual usage: **`sm:` ×57, `lg:` ×30, `md:` ×9, `xl:` ×1.**

- `sm:` (640px) — body columns split, padding grows
- `md:` (768px) — masthead side furniture ("The" tab, seal) appears
- `lg:` (1024px) — the real three-column newspaper grid engages
- `xl:` — one use: the "N items → N stories" folio fact

Sheet max width is **1180px**. Page padding: `px-3 sm:px-6 py-4 sm:py-7` outside,
`px-4 sm:px-9 pb-9` inside the sheet.

Below `lg` the grids collapse to one column and `order-*` puts the lead story
first, the "Today" index second.

---

## 7. What you're laying out

```ts
type Story = {
  id: string;
  headline: string;
  deck: string;          // ≤240 chars, publisher standfirst
  body: string[];        // up to 3 paragraphs, one per publisher
  section: Section;      // see below
  sources: { name, url, publishedAt }[];   // drives TallyMarks
  publishedAt: string;
  score: number;
};
```

Today's sections: **AI Startups** (15), **AI News** (12), **AI Policy** (10),
**AI Business** (8), **AI Research** (4), **Developer** (4), **Robotics** (1).
Sections are *discovered from the wire*, not a fixed list — don't hardcode them.

Selectors in `lib/digest.ts`: `getLeadStory`, `getSecondaryStories` (rail),
`getRemainingStories` (strip, `slice(5,23)`), `getInnerSheets(2)` (length-balanced
inner pages), `getSectionIndex`, `getStory`.

**Nothing in `body` is model-written.** Generated copy only ever appears inside
`components/AiBrief.tsx`, always visibly labelled. Keep that boundary.

---

## 8. Full component map

| File | Lines | What it does |
|---|---|---|
| `Newspaper.tsx` | 1092 | **The page-turn rig.** Corner peel, drag/flick/tap. |
| `Briefing.tsx` | 864 | Browser-voice player (fallback) |
| `VoiceReader.tsx` | 550 | Floating read-aloud button on the front page |
| `WeatherBox.tsx` | 374 | Masthead weather, free API, holds its height |
| `Recording.tsx` | 330 | Recorded-audio player with running order |
| `Preferences.tsx` | 225 | Reader preferences panel |
| `AccountPanel.tsx` | 218 | Sign-in / register (Firebase, **dormant**) |
| `stories.tsx` | 213 | All story card variants + `TallyMarks` |
| `YourEdition.tsx` | 205 | Personalised cut |
| `editionPages.tsx` | 194 | `FrontPage` + `InnerPage` layouts |
| `motion.tsx` | 180 | Shared entrance animations |
| `SearchView.tsx` | 165 | Search UI |
| `Account.tsx` | 164 | Auth context |
| `Onboarding.tsx` | 150 | First-run, set as a subscription order form |
| `Masthead.tsx` | 134 | Nameplate, folio line, almanac band |
| `Ornament.tsx` | 121 | All decorative SVG |
| `EditionClock.tsx` | 115 | Live clock in the folio |
| `StopPress.tsx` | 104 | Breaking strip + section nav |
| `PageSheet.tsx` | 90 | **One physical sheet** |
| `AiBrief.tsx` | 81 | Model-written panel, labelled |
| `KeyboardNav.tsx` | 80 | ← → Esc |
| `FitText.tsx` | 67 | Fits the nameplate to its box |
| `ClipButton.tsx` | 56 | "Cut this out" |
| `PaperTexture.tsx` | 45 | `cut-edge` filter, grain, vignette |
| `NightToggle.tsx` | 34 | Day/night |
| `OnThisDay.tsx` | 31 | Almanac line |
| `ReadingProgress.tsx` | 20 | Scroll progress |

### Routes

`/` front page · `/story/[id]` (serves **all 185** stories across 6 editions) ·
`/section/[slug]` · `/search` · `/yours` · `/briefing` · plus `not-found`,
`error`, `global-error`, `sitemap.xml`, `robots.txt`, `/api/edition`.

---

## 9. Known gaps — fair game for UI work

- **No `og:image`.** Cards declare `summary_large_image` and supply nothing. A
  generated 1925 clipping would be a big visual win. *(Task chip exists.)*
- **Search only covers today's 54 stories**, though 185 are reachable. *(Chip.)*
- **Light/dark polish** was deferred by you earlier.
- **Never run on a real phone.** Android grain tiling, installed icon/splash and
  offline behaviour are all unverified on hardware.
- **Firebase accounts are built but dormant**, waiting on config.
- One **dev-only** React warning about the theme `<script>` in `layout.tsx`.
  Harmless, never reaches production.

---

## 10. How to verify a UI change

```bash
npm run dev
```

Then actually look at it — don't trust the code. Check both day *and* night,
and at least one width below `lg`.

```bash
npx tsc --noEmit && npm run build
```

Build should report the current page count (176 at the time of writing; it
grows as the archive does).

There are 8 numeric check suites in the session scratchpad (`briefing`, `split`,
`fits`, `provider`, `triage`, `localdesk`, `sitemap`, `archive`). They're not in
the repo and don't run in CI — worth knowing if you change anything they cover.

### Traps specific to this repo

- **`requestAnimationFrame` is throttled or stopped entirely** when the preview
  pane isn't the front window. This has caused several false diagnoses of
  "broken animation". If a turn looks frozen, front the window first.
- **Console buffers are retained across navigation.** Open a fresh tab before
  concluding there are errors.
- **Heredocs eat backslashes** (`\\` → `\`). This has corrupted files three
  times — once turning `\s+` into a literal `s`, once turning `\b` into a
  backspace character. Use the editor, not `cat <<EOF`, for anything with regex.

---

## 11. House style

Comments are **prose explaining why**, usually citing a measured number or a
specific past failure. Never restate the code.

> ✅ *"It was a single flex row with `justify-between`, and with four facts of
> wildly different widths the date — the one fact a reader looks for — landed
> well left of centre."*
>
> ❌ *"Set up a grid with three columns."*

If you change a number that was measured, say what you measured and how.
