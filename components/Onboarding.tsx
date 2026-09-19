import { getDigest, getSectionIndex, formatEditionDate } from "@/lib/digest";
import health from "@/data/source-health.json";
import OnboardingFlow from "./OnboardingFlow";

/**
 * First run, read off the edition rather than written down.
 *
 * This file is the server half of the flow and does nothing but fetch. It
 * exists because the figures the first screen prints — the wires read, the
 * items pulled off them, the columns that survived — live in
 * `data/edition-latest.json`, which is 224KB, and in `data/source-health.json`,
 * which is another 12KB. A client component that imported either would inline
 * it into the shared bundle, and this component is mounted in the root layout,
 * so that weight would be paid on every page of the paper by every reader,
 * including the returning ones who never see this screen. The numbers are four
 * integers and a list of seven desks. Those are what cross the boundary.
 *
 * It is also the pattern the rest of the paper already uses: nothing under
 * `components/` that carries "use client" imports `lib/digest`. The pages read
 * the edition and hand down what a client component needs — see
 * app/yours/page.tsx handing `getSearchIndex()` to YourEdition.
 */
export default function Onboarding() {
  const digest = getDigest();

  return (
    <OnboardingFlow
      /*
       * The wire count, from the registry the ingestion job commits after every
       * run — one entry per feed, written from the same FEEDS array that was
       * polled. Its 37 ids are a set-for-set match with FEEDS in
       * services/ingestion/sources.ts, checked at the time of writing.
       *
       * FEEDS itself is not importable from here. `services/` is excluded from
       * tsconfig on purpose: it is a standalone Node worker run by `node`
       * directly, so its imports carry `.ts` specifiers that this bundler's
       * resolution does not accept. Reading the registry instead keeps the
       * figure honest — a feed added tomorrow changes this number by itself —
       * without dragging a worker into the app's module graph.
       */
      wires={health.sources.length}
      items={digest.totalItems}
      stories={digest.stories.length}
      /*
       * Outlets credited across the whole paper — the sum of each column's
       * masthead of sources, which `toStory` has already deduplicated by
       * publisher name.
       *
       * It is here because without it the first screen could only print the
       * gap between items read and columns printed, and that gap is two
       * different things wearing one number. On the edition of 2026-09-19 it
       * is 3,022, of which only 47 are second reports of an event the paper
       * actually set; the other 2,975 were never printed at all. Lumping them
       * invites the reading that the paper folded three thousand duplicates
       * into fifty-four columns, which it did not do and could not defend.
       * With this figure the screen can say both numbers and be exactly right.
       */
      credited={digest.stories.reduce((n, s) => n + s.sources.length, 0)}
      edition={digest.edition}
      dateLabel={formatEditionDate(digest.date)}
      /*
       * Desks are discovered from the wire, never a fixed list. A section with
       * nothing in it today is not offered, because choosing it would weight
       * up a set of stories that does not exist.
       */
      desks={getSectionIndex()}
    />
  );
}
