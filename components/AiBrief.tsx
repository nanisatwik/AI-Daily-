import type { Brief } from "@/lib/digest";
import { Fleuron } from "./Ornament";

/**
 * Everything a model wrote, penned into one boxed panel and labelled as such.
 *
 * The blueprint's rule is that generated interpretation must never be mistaken
 * for reporting. So this sits apart from the story's own type, carries a rule
 * and a standing notice, and is set in the sans face the paper uses for
 * apparatus rather than the Caslon it sets journalism in.
 */
export default function AiBrief({ brief }: { brief: Brief | null }) {
  if (!brief) return null;

  const rows: { label: string; body: string }[] = [];
  if (brief.tldr) rows.push({ label: "In short", body: brief.tldr });
  if (brief.whyItMatters)
    rows.push({ label: "Why it matters", body: brief.whyItMatters });
  if (brief.whoIsAffected)
    rows.push({ label: "Who it lands on", body: brief.whoIsAffected });

  if (rows.length === 0 && brief.keyPoints.length === 0) return null;

  // Two provenances, two different claims. Extractive briefs are publishers'
  // own sentences, selected; a model brief is written prose. Labelling both
  // the same way would overstate one and malign the other.
  const extractive = brief.model.startsWith("extractive");
  const label = extractive ? "Compiled from sources" : "Set by machine";
  const notice = extractive
    ? "Every line above is a sentence as filed by the publisher named beside it, selected automatically. Nothing here was written by a journalist or by a machine."
    : `Written by ${brief.model} from the reports listed below — not by a journalist, and not from any source other than those reports. Read the originals for the account of record.`;

  return (
    <aside
      className="mt-10 border-2 border-dashed border-[var(--rule)] p-5 sm:p-7"
      aria-label="Machine-written brief"
    >
      <div className="flex items-center gap-3 mb-5">
        <span className="kicker border border-[var(--accent)] text-[var(--accent)] px-2.5 py-1">
          {label}
        </span>
        <span className="flex-1 h-px bg-[var(--rule)]" />
        <Fleuron className="w-7 h-3.5 text-[var(--rule)]" />
      </div>

      {rows.map((row) => (
        <div key={row.label} className="mb-4 last:mb-0">
          <p className="kicker text-[var(--ink-faint)] mb-1.5">{row.label}</p>
          <p className="font-body text-[16px] leading-[1.6] text-[var(--ink)]">
            {row.body}
          </p>
        </div>
      ))}

      {brief.keyPoints.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--rule)]">
          <p className="kicker text-[var(--ink-faint)] mb-2.5">Key points</p>
          <ul className="space-y-2">
            {brief.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="font-label text-[11px] text-[var(--accent)] pt-1 shrink-0"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-body text-[15px] leading-[1.55] text-[var(--ink-soft)]">
                  {point}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="meta mt-5 pt-3.5 border-t border-[var(--rule)] leading-relaxed normal-case tracking-normal text-[12px] font-body italic">
        {notice}
      </p>
    </aside>
  );
}
