import type { ReactNode } from "react";
import { OrnateFrame, Fleuron } from "./Ornament";

type Props = {
  children: ReactNode;
  /** Omitted on standalone sheets (search, sections) that sit outside the edition. */
  pageNumber?: number;
  total?: number;
  label: string;
  /** Front page carries the full masthead, so it needs no running head. */
  runningHead?: boolean;
};

export default function PageSheet({
  children,
  pageNumber,
  total,
  label,
  runningHead = true,
}: Props) {
  const numbered = typeof pageNumber === "number" && typeof total === "number";
  return (
    <div className="relative mx-auto max-w-[1180px] page-edges">
      <div className="relative isolate px-4 sm:px-9 pb-9">
        {/* The sheet itself: stock and printed rule, trimmed slightly rough. */}
        <div
          className="absolute inset-0 z-0 bg-[var(--paper)] border-2 border-[var(--ink)]"
          style={{ filter: "url(#cut-edge)" }}
          aria-hidden="true"
        />

        <OrnateFrame className="z-20" />
        <div
          className="fold-crease"
          style={{ top: "52%", zIndex: 15 }}
          aria-hidden="true"
        />

        <div className="relative z-10">
          {runningHead && (
            <div className="flex items-center justify-between gap-4 pt-4 pb-2.5 border-b border-[var(--ink)]">
              <span className="kicker text-[var(--ink-soft)]">
                The AI Daily
              </span>
              <span className="kicker text-[var(--accent)] text-center truncate">
                {label}
              </span>
              <span className="meta">
                {numbered ? `Page ${pageNumber} of ${total}` : "Index"}
              </span>
            </div>
          )}

          {children}

          <div className="mt-10 pt-4 border-t-2 border-[var(--ink)] flex items-center justify-between gap-4">
            <span className="meta">The AI Daily</span>
            <div className="flex items-center gap-3 text-[var(--rule)]">
              <span className="w-10 h-px bg-current" />
              <Fleuron className="w-8 h-4" />
              <span className="w-10 h-px bg-current" />
            </div>
            <span
              className="font-mast text-[var(--ink)] leading-none"
              style={{ fontSize: "1.4rem" }}
            >
              {numbered ? pageNumber : "❖"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
