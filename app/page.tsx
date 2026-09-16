import Newspaper from "@/components/Newspaper";
import PageSheet from "@/components/PageSheet";
import KeyboardNav from "@/components/KeyboardNav";
import VoiceReader from "@/components/VoiceReader";
import { FrontPage, InnerPage } from "@/components/editionPages";
import {
  getLeadStory,
  getSecondaryStories,
  getRemainingStories,
  getInnerSheets,
} from "@/lib/digest";

export default function Home() {
  const lead = getLeadStory();
  const rail = getSecondaryStories();
  const strip = getRemainingStories();

  // Named from what actually lands on each sheet, because the split is by
  // length rather than by a fixed list of sections — see getInnerSheets.
  const inner = getInnerSheets(2);
  const LABELS = ["Front page", ...inner.map((s) => s.label)];
  const total = LABELS.length;

  const pages = [
    <PageSheet
      key="front"
      pageNumber={1}
      total={total}
      label={LABELS[0]}
      runningHead={false}
    >
      <FrontPage lead={lead} rail={rail} strip={strip} />
    </PageSheet>,

    ...inner.map((sheet, i) => (
      <PageSheet
        key={`inner-${i}`}
        pageNumber={i + 2}
        total={total}
        label={sheet.label}
      >
        <InnerPage
          title={sheet.label}
          stories={sheet.stories}
          closing={i === inner.length - 1}
        />
      </PageSheet>
    )),
  ];

  return (
    <div className="min-h-screen px-3 sm:px-6 py-4 sm:py-7">
      <Newspaper pages={pages} labels={LABELS} />
      <KeyboardNav />
      <VoiceReader
        passages={[lead, ...rail, ...strip].map((s) => ({
          headline: s.headline,
          deck: s.deck,
          section: s.section,
        }))}
      />
    </div>
  );
}
