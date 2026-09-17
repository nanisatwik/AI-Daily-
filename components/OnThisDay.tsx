import { getDigest } from "@/lib/digest";
import { almanacFor } from "@/lib/onThisDay";

/**
 * The almanac line under the folio.
 *
 * Keyed to the edition's own date rather than to the reader's clock, which is
 * what lets this stay a server component: the date is already fixed by the
 * time the paper is set, so there is nothing to hydrate, nothing to fetch and
 * no chance of the server and the browser disagreeing about what day it is.
 *
 * It reads the digest itself instead of taking the date as a prop, because
 * the caller that renders the masthead is being edited elsewhere and adding a
 * prop would mean changing it.
 */
export default function OnThisDay() {
  const { label, year, text } = almanacFor(getDigest().date);

  return (
    <div>
      <p className="kicker text-[var(--ink-faint)] mb-1.5">{label}</p>
      <p className="font-body text-[13px] leading-[1.5] text-[var(--ink-soft)]">
        <span className="font-head text-[15px] text-[var(--accent)]">
          {year}
        </span>
        <span className="text-[var(--rule)]">{" — "}</span>
        <em>{text}</em>
      </p>
    </div>
  );
}
