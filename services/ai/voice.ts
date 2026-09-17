/**
 * Record the five-minute briefing, once, at press time.
 *
 *   node services/ai/voice.ts
 *
 * WHY THIS RUNS HERE AND NOT IN THE BROWSER
 *
 * The obvious place to synthesise speech is the reader's device, and the first
 * attempt did exactly that: Kokoro-82M through ONNX Runtime Web, which needs
 * no key, no account and no card, and so fits this paper's zero-cost rule
 * perfectly. It also works — the voice is genuinely good.
 *
 * It was then measured, and the measurement killed it. On a sixteen-core
 * machine with WebGPU available, generation ran at a real-time factor of
 * 1.01 to 1.10: rather more than a second of computation for every second of
 * audio. Three runs, consistent. That leaves no headroom at all — a
 * five-minute bulletin needs five minutes of compute to exist, so playback
 * would be forever catching up with synthesis, and on a phone, with a weaker
 * GPU, it would never catch up at all.
 *
 * But the edition is the same for every reader and changes once a day, which
 * is the same observation the whole paper is built on. So the bulletin is
 * recorded once when the edition is printed, by the job that already prints
 * it, and the browser is handed a finished audio file. That costs one reader
 * one download, gives every device the identical good voice regardless of what
 * the operating system has installed, and starts instantly.
 *
 * The model weights come from the Hugging Face CDN and the synthesis happens
 * on a GitHub Actions runner, so this remains free: no per-character billing,
 * no account, no card.
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { KokoroTTS } from "kokoro-js";
import { buildBriefing } from "../../lib/briefing.ts";
import type { Story } from "../../lib/digest.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(ROOT, "public", "briefing");

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

/**
 * Quantised weights. The difference from full precision does not survive a
 * phone speaker, and this runs on a CI worker with a modest disk and a cold
 * cache on every single run.
 */
const DTYPE = "q8" as const;

/**
 * Kokoro grades its own voices, and the grades are uneven in a way worth
 * recording: the best female voice is graded A, while the best male voice
 * available is a C+. The gentleman will sound less convincing than the lady
 * and no amount of wiring changes that.
 */
const VOICES = {
  lady: "af_heart",
  gentleman: "am_michael",
} as const;

/** A breath between sentences, and a longer settling pause between stories. */
const GAP_MS = 260;
const ITEM_GAP_MS = 620;

/* ------------------------------------------------------------------ *
 * WAV assembly
 *
 * Kokoro hands back one Float32Array per passage. Writing each to its own
 * file and stitching them with a media tool afterwards would mean shelling out
 * per line; concatenating the samples and writing one WAV is both faster and
 * has no dependency beyond Node.
 * ------------------------------------------------------------------ */

function silence(seconds: number, rate: number): Float32Array {
  return new Float32Array(Math.round(seconds * rate));
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** 16-bit PCM mono. Speech has no use for a second channel or more depth. */
function toWav(samples: Float32Array, rate: number): Buffer {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + samples.length * 2, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16); // PCM header length
  bytes.writeUInt16LE(1, 20); // PCM
  bytes.writeUInt16LE(1, 22); // mono
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28); // byte rate
  bytes.writeUInt16LE(2, 32); // block align
  bytes.writeUInt16LE(16, 34); // bits
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 2, 40);

  for (let i = 0; i < samples.length; i++) {
    // Clamped before scaling: a sample fractionally over 1.0 wraps to full
    // negative once truncated, which is an audible click rather than clipping.
    const s = Math.max(-1, Math.min(1, samples[i]));
    bytes.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return bytes;
}

/**
 * Where to find ffmpeg.
 *
 * GitHub's Ubuntu runners carry it; a Windows checkout generally does not, so
 * a local run used to fall back to keeping a fourteen-megabyte WAV. The
 * `ffmpeg-static` package ships a binary per platform, which makes the local
 * run produce exactly what CI produces. The system one is still preferred when
 * present — it is the one the runner would use anyway.
 */
function ffmpegPath(): string {
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (!probe.error && probe.status === 0) return "ffmpeg";
  try {
    // Resolved lazily: the package is a dev dependency and CI does not need it.
    return createRequire(import.meta.url)("ffmpeg-static") as string;
  } catch {
    return "ffmpeg";
  }
}

/**
 * WAV is committed to the repository every day, so it has to be compressed.
 *
 * Five minutes of 24kHz mono WAV is about fourteen megabytes; the same speech
 * as 40kbps mono MP3 is under one and a half. If no ffmpeg can be found at all
 * the WAV is kept rather than the recording being abandoned, and the caller is
 * told which happened.
 */
function toMp3(wav: string, mp3: string): boolean {
  const r = spawnSync(
    ffmpegPath(),
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      wav,
      "-codec:a",
      "libmp3lame",
      // 40kbps mono is transparent for a single speaking voice and takes five
      // minutes of bulletin from fourteen megabytes to under one and a half.
      // The file is committed once a day, so its size is repository history.
      "-b:a",
      "40k",
      "-ac",
      "1",
      mp3,
    ],
    { encoding: "utf8" }
  );
  if (r.error || r.status !== 0) {
    console.log(
      `  ffmpeg unavailable or failed, keeping WAV (${r.error?.message ?? r.stderr?.trim() ?? r.status})`
    );
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */

async function main() {
  const editionPath = join(ROOT, "data", "edition-latest.json");
  const edition = JSON.parse(await readFile(editionPath, "utf8"));

  /**
   * The same shape the page builds from, assembled here by hand.
   *
   * lib/digest.ts reads the edition at module scope through a bundler alias,
   * so importing it from a plain Node script would pull in the whole app. The
   * briefing only needs these fields, and mapping them explicitly also means
   * this script fails loudly if the edition format moves under it.
   */
  const stories: Story[] = edition.clusters.map((c: any) => {
    const seen = new Set<string>();
    const sources = c.articles
      .filter((a: any) => {
        if (seen.has(a.sourceId)) return false;
        seen.add(a.sourceId);
        return true;
      })
      .map((a: any) => ({
        name: a.sourceName,
        url: a.sourceUrl,
        publishedAt: a.publishedAt,
      }));
    return {
      id: c.id,
      headline: c.title,
      deck: (c.summary ?? "").slice(0, 240),
      body: [c.summary ?? c.title],
      section: c.category,
      sources,
      publishedAt: c.lastSeenAt,
      score: c.score,
    } as Story;
  });

  /**
   * Shortened on demand, so the script can be exercised end to end without
   * paying for a full five minutes of synthesis — which at a real-time factor
   * of about one costs five minutes of wall clock every time.
   */
  const target = Number(process.env.BRIEFING_SECONDS) || undefined;
  const briefing = buildBriefing(stories, edition.date, target);
  console.log(
    `Briefing: ${briefing.items.length} items, ${briefing.lines.length} lines, ${briefing.words} words, est ${Math.round(briefing.seconds)}s`
  );

  console.log(`Loading ${MODEL_ID} (${DTYPE})…`);
  const t0 = Date.now();
  const tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype: DTYPE });
  console.log(`  loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  await mkdir(OUT_DIR, { recursive: true });

  const manifest: Record<
    string,
    { file: string; seconds: number; marks: { at: number; item: number }[] }
  > = {};

  for (const [timbre, voice] of Object.entries(VOICES)) {
    console.log(`\nRecording the ${timbre} announcer (${voice})…`);
    const started = Date.now();
    const chunks: Float32Array[] = [];
    let rate = 24000;
    /**
     * Where each line actually begins in the finished recording.
     *
     * The player highlights the line being spoken, and with a single audio
     * file there is otherwise nothing to key that off — estimated durations
     * would drift apart from the recording within a few sentences. These are
     * sample counts taken as the file is assembled, so they are exact.
     */
    let cursor = 0;
    const marks: { at: number; item: number }[] = [];

    for (let i = 0; i < briefing.lines.length; i++) {
      const line = briefing.lines[i];
      const audio = await tts.generate(line.text, { voice });
      rate = audio.sampling_rate;
      marks.push({ at: +(cursor / rate).toFixed(3), item: line.item });
      cursor += (audio.audio as Float32Array).length;
      chunks.push(audio.audio as Float32Array);

      // Silence is part of the recording rather than something the player has
      // to time. Baked in, every device hears the same pacing.
      const last = i === briefing.lines.length - 1;
      if (!last) {
        const crossing = briefing.lines[i + 1].item !== line.item;
        const pad = silence((crossing ? ITEM_GAP_MS : GAP_MS) / 1000, rate);
        cursor += pad.length;
        chunks.push(pad);
      }

      if (i % 10 === 0 || last) {
        const done = i + 1;
        console.log(
          `  ${String(done).padStart(3)}/${briefing.lines.length} lines  ${((Date.now() - started) / 1000).toFixed(0)}s elapsed`
        );
      }
    }

    const samples = concat(chunks);
    const seconds = samples.length / rate;
    const wavPath = join(OUT_DIR, `${timbre}.wav`);
    await writeFile(wavPath, toWav(samples, rate));

    const mp3Path = join(OUT_DIR, `${timbre}.mp3`);
    const compressed = toMp3(wavPath, mp3Path);
    // The WAV is an intermediate, not an artefact. Leaving a fourteen-megabyte
    // file per voice in `public` would ship it to every reader who guessed the
    // URL and put it in the repository for good.
    if (compressed) await rm(wavPath, { force: true });

    manifest[timbre] = {
      file: `/briefing/${timbre}.${compressed ? "mp3" : "wav"}`,
      seconds: Math.round(seconds),
      marks,
    };

    console.log(
      `  ${Math.round(seconds)}s of audio in ${((Date.now() - started) / 1000).toFixed(0)}s of compute (realtime ${((Date.now() - started) / 1000 / seconds).toFixed(2)}x)`
    );
  }

  /**
   * A manifest rather than the player guessing at filenames, so the page can
   * show the true running time and can tell that today's recording exists at
   * all. An edition published before this script ran has no audio, and the
   * player has to be able to say so instead of playing a 404.
   */
  await writeFile(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      { date: edition.date, edition: edition.edition, voices: manifest },
      null,
      2
    ) + "\n"
  );

  console.log(`\nWrote ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
