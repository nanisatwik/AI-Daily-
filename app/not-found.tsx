import Link from "next/link";
import PageSheet from "@/components/PageSheet";
import NightToggle from "@/components/NightToggle";
import KeyboardNav from "@/components/KeyboardNav";
import { PointingHand, FleuronRule, Seal } from "@/components/Ornament";
import { PageIn, Reveal, PressIn } from "@/components/motion";
import { sectionSlug } from "@/lib/search";
import { getSectionIndex, getDigest, formatEditionDate } from "@/lib/digest";

/**
 * The 404, set as a lost-and-found notice.
 *
 * This is a Server Component and it stays one. The not-found convention takes
 * no props at all, and the only thing a client hook could add here is the
 * address the reader actually typed — but `usePathname` would mean making the
 * whole notice a Client Component just to print one string back at somebody
 * who has already seen it in their address bar. The bundled guide's own note
 * on this is that path-dependent content has to be fetched client-side, which
 * is a lot of machinery for a page whose job is to point at three links.
 *
 * Two paths land on this file, which is why it has to read as a general notice
 * rather than a story-specific one. `app/story/[id]/page.tsx` and
 * `app/section/[slug]/page.tsx` both call `notFound()` when a slug resolves to
 * nothing, and the root `not-found.tsx` also catches every URL that matches no
 * route at all. So the copy names the edition as the boundary — what is in
 * today's paper and what is not — because that is the one explanation true of
 * every way a reader arrives here.
 *
 * The title tag is already handled for the story route: its `generateMetadata`
 * returns "Not found — The AI Daily" when `getStory` comes back empty, so this
 * file deliberately exports no metadata of its own and leaves the layout's
 * defaults alone.
 */
export default function NotFound() {
  const digest = getDigest();

  /**
   * The desks of today's paper, which is the right list even though story
   * pages now come from the whole archive — `lib/archive.ts` serves every
   * story ever printed, but a section link goes to the desk as it stands this
   * morning, and offering a reader the desks of a superseded edition would be
   * a stranger place to land than the one they are already on.
   *
   * Guarded because an edition that clustered nothing would make this an empty
   * row of links, and a reader on a dead end needs the two fixed ways out
   * below regardless.
   */
  const sections = getSectionIndex();

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7">
      <PageSheet label="Lost and found">
        <div className="flex items-center justify-between gap-4 pt-3 pb-1">
          <Link
            href="/"
            className="kicker flex items-center gap-2 text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors"
          >
            <PointingHand className="w-6 h-4 rotate-180" />
            Front page
          </Link>
          <span className="meta hidden sm:inline">
            {formatEditionDate(digest.date)} &middot; No. {digest.edition}
          </span>
          <NightToggle />
        </div>

        <PageIn>
          <article className="pt-9 pb-4 max-w-[62ch] mx-auto text-center">
            <div className="flex items-center gap-3 mb-5">
              <span className="flex-1 h-px bg-[var(--rule)]" />
              <span className="kicker text-[var(--accent)]">
                Notice to readers
              </span>
              <span className="flex-1 h-px bg-[var(--rule)]" />
            </div>

            <h1
              className="headline-caps"
              style={{ fontSize: "clamp(1.8rem, 5.2vw, 3.2rem)" }}
            >
              Not in this edition
            </h1>

            <div className="my-6 h-[4px] border-t border-b border-[var(--ink)]" />

            <p
              className="font-body italic text-balance text-[var(--ink-soft)] max-w-[44ch] mx-auto leading-[1.45]"
              style={{ fontSize: "clamp(1.05rem, 2.3vw, 1.3rem)" }}
            >
              The page you asked for is not in today&rsquo;s paper. No such
              story, section or column is set in type at that address.
            </p>

            {/* --ink-faint, not --rule. A seal carries type inside it, and at
                9px the rule colour was legible as a shape but not as words in
                either edition — the same reason `.meta` is set in ink-faint
                rather than in the rule colour. */}
            <div className="mt-8 flex justify-center text-[var(--ink-faint)]">
              <Seal top="No such" bottom="Page" className="w-[84px] h-[84px]" />
            </div>

            {/* prose-column justifies, which overrides the centring the
                notice above it needs — the explanation is body copy and should
                be set as body copy, in a measure narrow enough to justify
                without rivers. */}
            <div className="prose-column mt-8 text-[var(--ink-soft)]">
              <p>
                Usually the address has a slip in it &mdash; a missing letter, a
                stray one, a line that was broken in half by an email. Every
                story this paper has printed keeps its own address for good,
                back through the earlier editions, so a column that once stood
                at this one has not been moved or taken down.
              </p>
              <p>
                Nothing is lost either way. Every story in today&rsquo;s edition
                can be reached from the front page, and the index will search
                it by headline, topic or publisher.
              </p>
            </div>
          </article>
        </PageIn>

        <Reveal className="mt-4">
          <FleuronRule className="text-[var(--rule)] mb-6" />

          <div className="flex flex-wrap items-center justify-center gap-4">
            <PressIn className="inline-block">
              <Link
                href="/"
                className="kicker inline-block border-2 border-[var(--ink)] px-6 py-2.5 hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors duration-300"
              >
                Back to the front page
              </Link>
            </PressIn>
            <PressIn className="inline-block">
              <Link
                href="/search"
                className="kicker inline-block border border-[var(--rule)] px-6 py-2.5 text-[var(--ink-soft)] hover:bg-[var(--ink)] hover:text-[var(--paper)] hover:border-[var(--ink)] transition-colors duration-300"
              >
                Search the index
              </Link>
            </PressIn>
          </div>

          {sections.length > 0 && (
            <div className="mt-11">
              <p className="kicker text-center text-[var(--ink-faint)] mb-5">
                Or turn to a section
              </p>
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-2.5">
                {sections.map((s) => (
                  <Link
                    key={s.section}
                    href={`/section/${sectionSlug(s.section)}`}
                    className="kicker text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors"
                  >
                    {s.section}{" "}
                    <span className="text-[var(--accent)]">{s.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Reveal>
      </PageSheet>

      {/* Outside the sheet, as on the index and section pages — the hint line
          is furniture about the machine, not something printed on the paper.
          It also binds Escape to the front page, which is the fastest way out
          of a dead end for a reader who never touches the links. */}
      <KeyboardNav />
    </div>
  );
}
