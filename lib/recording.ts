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
};

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
