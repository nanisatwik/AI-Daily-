import type { Story } from "@/lib/digest";
import Masthead from "./Masthead";
import { PointingHand, FleuronRule } from "./Ornament";
import { Reveal, Stagger, StaggerItem } from "./motion";
import {
  LeadStory,
  RailItem,
  ColumnItem,
  FeatureStory,
  SectionBanner,
  JumpLine,
} from "./stories";
import { StopPress, SectionNav } from "./StopPress";
import { getDigest, formatEditionDate, getSectionIndex } from "@/lib/digest";

export function FrontPage({
  lead,
  rail,
  strip,
}: {
  lead: Story;
  rail: Story[];
  strip: Story[];
}) {
  const digest = getDigest();

  const sections = Array.from(
    digest.stories.reduce((acc, s) => {
      acc.set(s.section, (acc.get(s.section) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
  );

  return (
    <>
      <Masthead
        dateLabel={formatEditionDate(digest.date)}
        edition={digest.edition}
        totalItems={digest.totalItems}
        storyCount={digest.stories.length}
      />

      <SectionNav sections={getSectionIndex()} />
      <StopPress stories={[lead, ...rail].slice(0, 4)} />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[192px_minmax(0,1fr)_252px] gap-7 lg:gap-0">
        <aside className="lg:pr-6 lg:border-r lg:border-[var(--rule)] order-2 lg:order-1">
          <Reveal delay={0.15}>
            <div className="border-2 border-[var(--ink)] p-3.5">
              <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-[var(--ink)]">
                <PointingHand className="w-6 h-4 text-[var(--accent)]" />
                <span className="kicker">Today</span>
              </div>
              <ul className="space-y-2.5">
                {sections.map(([name, count]) => (
                  <li
                    key={name}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="font-label uppercase text-[11px] font-medium tracking-[0.06em] text-[var(--ink-soft)] whitespace-nowrap">
                      {name}
                    </span>
                    <span className="font-head text-[13px] text-[var(--accent)]">
                      {count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 border border-[var(--rule)] p-3.5 text-center">
              <p className="kicker text-[var(--ink-faint)] mb-2">Press run</p>
              <p
                className="font-mast text-[var(--ink)] leading-none"
                style={{ fontSize: "2.3rem" }}
              >
                {digest.totalItems}
              </p>
              <p className="font-body italic text-[13px] text-[var(--ink-soft)] mt-1.5 leading-snug">
                items read, {digest.stories.length} survived dedup
              </p>
            </div>
          </Reveal>
        </aside>

        <section className="lg:px-7 order-1 lg:order-2">
          <Reveal>
            <LeadStory story={lead} />
            <JumpLine page={2} label="Research and policy" />
          </Reveal>
        </section>

        <aside className="lg:pl-6 lg:border-l lg:border-[var(--rule)] order-3">
          <Reveal delay={0.2}>
            <div className="flex items-center gap-2 pb-2 border-b-2 border-[var(--ink)]">
              <span className="kicker">Also today</span>
            </div>
            <div>
              {rail.map((story) => (
                <RailItem key={story.id} story={story} />
              ))}
            </div>
          </Reveal>
        </aside>
      </div>

      <div className="mt-10">
        <SectionBanner>More from the wire</SectionBanner>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-9">
          {strip.map((story) => (
            <StaggerItem
              key={story.id}
              className="lg:not-last:border-r lg:not-last:border-[var(--rule)] lg:not-last:pr-8"
            >
              <ColumnItem story={story} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </>
  );
}

export function InnerPage({
  title,
  stories,
  closing,
}: {
  title: string;
  stories: Story[];
  closing?: boolean;
}) {
  const [feature, ...rest] = stories;
  const rail = rest.slice(0, 2);
  const columns = rest.slice(2);

  return (
    <div className="pt-7">
      <SectionBanner>{title}</SectionBanner>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-8 lg:gap-0">
        <section className="lg:pr-8">
          <Reveal>{feature && <FeatureStory story={feature} />}</Reveal>
        </section>

        {rail.length > 0 && (
          <aside className="lg:pl-8 lg:border-l lg:border-[var(--rule)]">
            <Reveal delay={0.15}>
              <div className="flex items-center gap-2 pb-2 border-b-2 border-[var(--ink)]">
                <span className="kicker">In brief</span>
              </div>
              {rail.map((story) => (
                <RailItem key={story.id} story={story} />
              ))}
            </Reveal>
          </aside>
        )}
      </div>

      {columns.length > 0 && (
        <div className="mt-10 pt-7 border-t-2 border-[var(--ink)]">
          <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-9">
            {columns.map((story) => (
              <StaggerItem
                key={story.id}
                className="lg:not-last:border-r lg:not-last:border-[var(--rule)] lg:not-last:pr-8"
              >
                <ColumnItem story={story} />
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      {closing && (
        <Reveal className="mt-12">
          <FleuronRule className="text-[var(--rule)] mb-5" />
          <div className="text-center space-y-2">
            <p className="kicker text-[var(--ink-faint)]">
              Set in type by machine
            </p>
            <p className="font-body italic text-[14px] text-[var(--ink-soft)] max-w-[54ch] mx-auto leading-relaxed">
              {/*
                This read "every story in this edition was clustered from
                multiple sources", which was not true and had been on the live
                site for some time: on the edition of 2026-09-19, 35 of the 54
                printed stories carried exactly one outlet and only 19 carried
                more than one. The tally marks were telling the truth while the
                sentence above them did not. A paper whose whole argument is
                corroboration cannot overstate its own corroboration.
              */}
              Every story here was clustered across thirty-seven wires, and the
              tally marks show what that found &mdash; one mark for each outlet
              that carried it independently. A single mark means a single
              source, and is printed as plainly as a row of them. Nothing here
              was written by a press office.
            </p>
          </div>
        </Reveal>
      )}
    </div>
  );
}
