/**
 * A voice that does not sound like a machine.
 *
 * The browser's own `speechSynthesis` does not synthesise anything — it plays
 * whatever voices the operating system has installed, and on a stock Windows
 * machine those are formant synthesisers from around 2005. No amount of
 * ranking or delivery tuning fixes that, because there is nothing better on
 * the device to choose. lib/voices.ts does as well as can be done from inside
 * that API, and it still sounds like a robot, because it is one.
 *
 * So this bypasses the OS entirely and runs a neural text-to-speech model on
 * the reader's own machine: Kokoro-82M, via ONNX Runtime Web. The weights come
 * from the Hugging Face CDN once and are then cached by the browser.
 *
 * Why not a cloud voice, which would be better still: every good hosted engine
 * — ElevenLabs, OpenAI, Google WaveNet, Azure Neural — bills per character,
 * and the ones with genuinely free tiers require a card on file. This paper has
 * a hard zero-cost, no-account constraint, so the synthesis has to happen where
 * there is no meter: on the device.
 *
 * What it costs instead of money:
 *  - a one-off model download, tens of megabytes, cached afterwards;
 *  - real computation, so the first sentence takes a moment to appear;
 *  - WebAssembly or WebGPU, so a very old browser cannot do it at all.
 *
 * All three are why this is opt-in and why `speechSynthesis` remains the
 * fallback rather than being deleted.
 */

/** Kokoro publishes a graded voice list; these are the best of each. */
export const NEURAL_VOICES = {
  /** "Heart" — the only voice the model grades A overall. */
  lady: "af_heart",
  /**
   * "Michael" — graded C+, and that is the ceiling.
   *
   * Worth stating plainly rather than discovering by ear: Kokoro's male voices
   * are markedly weaker than its female ones. The best male voice available is
   * three grades below the best female one, so the gentleman announcer will
   * sound less convincing than the lady. That is the model, not the wiring.
   */
  gentleman: "am_michael",
} as const;

export type NeuralTimbre = keyof typeof NEURAL_VOICES;

/**
 * Quantised weights rather than full precision.
 *
 * q8 is roughly a quarter the download of fp32 for a difference that does not
 * survive a phone speaker, and the download is the thing a reader actually
 * feels. Fidelity we cannot hear is not worth four times the wait.
 */
const DTYPE = "q8" as const;

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export type LoadProgress = {
  /** 0..1 across the whole download, or null while it is still unknown. */
  ratio: number | null;
  label: string;
};

export type NeuralEngine = {
  /** Render one passage to a playable blob. */
  render: (text: string, timbre: NeuralTimbre) => Promise<Blob>;
  /** Which backend actually took the model — useful when reporting slowness. */
  device: string;
};

/**
 * WebGPU where it exists, WebAssembly everywhere else.
 *
 * WebGPU is several times faster and is what makes synthesis keep ahead of
 * playback, but it is absent in older Safari and behind a flag in some builds,
 * and asking for it where it does not exist throws rather than degrading. So
 * it is probed rather than assumed.
 */
async function bestDevice(): Promise<"webgpu" | "wasm"> {
  const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
  if (!gpu) return "wasm";
  try {
    const adapter = await (
      gpu as { requestAdapter: () => Promise<unknown | null> }
    ).requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

export function neuralVoiceSupported(): boolean {
  if (typeof window === "undefined") return false;
  // Both backends need WebAssembly; WebGPU only chooses a faster path.
  return typeof WebAssembly === "object";
}

/**
 * One engine per page, shared.
 *
 * The model is tens of megabytes in memory. A second instance would download
 * and hold it all again, and two components wanting a voice is not a reason to
 * pay for it twice.
 */
let engine: Promise<NeuralEngine> | null = null;

export function loadNeuralEngine(
  onProgress?: (p: LoadProgress) => void
): Promise<NeuralEngine> {
  if (engine) return engine;

  engine = (async () => {
    const device = await bestDevice();

    // Imported here, not at module scope: this pulls in ONNX Runtime and the
    // tokeniser, which must never reach the server bundle or the first paint
    // of a reader who only wants to read.
    const { KokoroTTS } = await import("kokoro-js");

    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      device,
      progress_callback: (p: unknown) => {
        if (!onProgress) return;
        const e = p as { status?: string; progress?: number; file?: string };
        // The callback reports per file and only sometimes carries a
        // percentage, so a missing number is reported as unknown rather than
        // as zero — a bar stuck at 0% reads as broken.
        onProgress({
          ratio: typeof e.progress === "number" ? e.progress / 100 : null,
          label: e.status === "progress" ? "Fetching the voice" : "Preparing the voice",
        });
      },
    });

    return {
      device,
      render: async (text: string, timbre: NeuralTimbre) => {
        const audio = await tts.generate(text, {
          voice: NEURAL_VOICES[timbre],
        });
        return audio.toBlob();
      },
    };
  })();

  // A failed load must not poison every later attempt: a reader who lost the
  // network mid-download should be able to press play again.
  engine.catch(() => {
    engine = null;
  });

  return engine;
}
