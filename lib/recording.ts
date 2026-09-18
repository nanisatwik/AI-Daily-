/**
 * Today's recorded briefing, if the press made one.
 *
 * Read from disk at build time rather than fetched, so a page knows before it
 * renders whether audio exists and can choose a player instead of mounting one
 * and discovering a 404.
 *
 * This lives apart from the players because two of them need it: the briefing
 * page, and the floating reader on the front page. That second one is the
 * reason this file exists at all — the recorded voice was live for a day and
 * unreachable, because the only button a reader could actually find still
 * drove the operating system's own synthesiser.
 */

export type VoiceCut = {
  file: string;
  seconds: number;
  /** Where each spoken line begins, in seconds. Exact, taken at assembly. */
  marks: { at: number; item: number }[];
};

export type RecordingManifest = {
  date: string;
  edition: number;
  voices: Record<string, VoiceCut>;
  /**
   * Fingerprint of the script that was recorded — see `scriptFingerprint` in
   * lib/briefing.ts.
   *
   * Optional because a manifest written before this field existed is still a
   * perfectly good recording, and refusing to play one would be a worse
   * outcome than the problem it guards against. Absent, `recordingFits` falls
   * back to comparing line counts, which is what actually went wrong the one
   * time this went wrong.
   */
  script?: string;
};

/**
 * Whether this recording is a recording of this script.
 *
 * The player maps marks onto lines by index, so a recording of a different
 * script does not degrade — it misleads. Every highlight, every skip and the
 * whole running order point at the wrong sentence, confidently. That shipped
 * once: the recorder's copy of `toStory` had drifted from lib/digest.ts and a
 * 63-line recording played against a 59-line script on the live site.
 *
 * A caller that gets `false` should use the browser's own voice instead. It
 * sounds worse, and sounding worse is much better than being wrong — a reader
 * can hear that a synthesiser is a synthesiser, but cannot hear that the
 * highlighted sentence is not the one being spoken.
 */
export function recordingFits(
  manifest: RecordingManifest,
  lines: { text: string }[],
  fingerprint: string
): boolean {
  const cuts = Object.values(manifest.voices ?? {});
  if (cuts.length === 0) return false;
  // One mark per line, in every voice. Two voices of the same script must
  // agree with the script and therefore with each other.
  if (!cuts.every((cut) => (cut.marks?.length ?? 0) === lines.length)) return false;
  // Only compared when the press recorded one; see the note on the field.
  return manifest.script === undefined || manifest.script === fingerprint;
}

/**
 * The manifest, or null when there is nothing to play.
 *
 * The date is checked deliberately. A recording left in `public` against a
 * newer edition would read yesterday's news in a confident voice, which is
 * worse than falling back to the browser's own — a reader can hear that a
 * synthesiser is a synthesiser, but not that the news is a day stale.
 */
export function readRecording(date: string): RecordingManifest | null {
  try {
    // Required lazily so this module stays importable from a client component
    // that only wants the types.
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const raw = readFileSync(
      join(process.cwd(), "public", "briefing", "manifest.json"),
      "utf8"
    );
    const m = JSON.parse(raw) as RecordingManifest;
    if (m.date !== date) return null;
    return Object.keys(m.voices ?? {}).length > 0 ? m : null;
  } catch {
    return null;
  }
}
