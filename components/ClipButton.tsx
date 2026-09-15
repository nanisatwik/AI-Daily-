"use client";

import { usePreferences } from "./Preferences";

/**
 * Cutting a story out of the paper. A reader with scissors made a clipping;
 * this is the same act, and the same word, so the feature needs no explaining.
 */
export default function ClipButton({
  storyId,
  className = "",
}: {
  storyId: string;
  className?: string;
}) {
  const { prefs, ready, toggleClipping } = usePreferences();

  // Render the unclipped state until storage is read, so the server's HTML and
  // the browser's first paint agree.
  const clipped = ready && prefs.clippings.includes(storyId);

  return (
    <button
      type="button"
      onClick={() => toggleClipping(storyId)}
      aria-pressed={clipped}
      title={clipped ? "Remove from clippings" : "Clip this story"}
      className={`kicker inline-flex cursor-pointer items-center gap-2 border px-3 py-1.5 transition-colors duration-300 ${
        clipped
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
          : "border-[var(--rule)] text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)]"
      } ${className}`}
    >
      <Scissors className="h-3.5 w-3.5" />
      {clipped ? "Clipped" : "Clip"}
    </button>
  );
}

function Scissors({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
    </svg>
  );
}
