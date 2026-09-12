import Newspaper from "@/components/Newspaper";
import PageSheet from "@/components/PageSheet";
import KeyboardNav from "@/components/KeyboardNav";
import VoiceReader from "@/components/VoiceReader";
import { FrontPage, InnerPage } from "@/components/editionPages";
import {
  getLeadStory,
  getSecondaryStories,
  getRemainingStories,
  getStoriesInSections,
} from "@/lib/digest";

const LABELS = [
  "Front page",
  "Research and policy",
  "Industry and open source",
];

export default function Home() {
  const lead = getLeadStory();
  const rail = getSecondaryStories();
  const strip = getRemainingStories();

  const researchPolicy = getStoriesInSections(["AI Research", "AI Policy"]);
  const industryOpen = getStoriesInSections([
    "AI Business",
    "AI Startups",
    "Developer",
    "Robotics",
  ]);

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

    <PageSheet key="research" pageNumber={2} total={total} label={LABELS[1]}>
      <InnerPage title={LABELS[1]} stories={researchPolicy} />
    </PageSheet>,

    <PageSheet key="industry" pageNumber={3} total={total} label={LABELS[2]}>
      <InnerPage title={LABELS[2]} stories={industryOpen} closing />
    </PageSheet>,
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
