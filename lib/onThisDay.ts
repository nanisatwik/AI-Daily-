/**
 * On this day in A.I. — the almanac line that sits under the folio.
 *
 * Every paper of the period carried an almanac: a standing line recalling what
 * happened on this date in years past. Ours recalls the field's own history,
 * which is short enough that a hand-kept list beats any feed.
 *
 * Plain data, deliberately. There is no free, stable, well-dated register of
 * A.I. milestones to call, and the $0 constraint rules out a paid one — but
 * the better reason is determinism. The line is computed from the edition's
 * own date, so the server and the browser can never disagree about what today
 * says, and the almanac needs no hydration gate, no fetch and no fallback
 * copy for a request that failed.
 *
 * Dating convention, since it is the one thing a reader could catch us on:
 * for journals and preprints the date is the date of publication or of the
 * first posting; for conference work it is a date the conference was sitting;
 * where only a month is known — the January 1966 issue of Communications of
 * the ACM that carried ELIZA — the first of the month stands in.
 *
 * One entry per calendar day. A second entry on a day already taken would
 * simply never be read, so collisions were resolved by dropping the weaker
 * item rather than by ranking them at run time.
 */

export type Milestone = {
  /** 1-12. */
  month: number;
  /** 1-31. */
  day: number;
  year: number;
  /** One sentence, set as an almanac line: terse, and never a headline. */
  text: string;
};

export const MILESTONES: Milestone[] = [
  /* ---------------------------------------------------------------- *
   * January
   * ---------------------------------------------------------------- */
  { month: 1, day: 1, year: 1966, text: "Joseph Weizenbaum publishes ELIZA, and watches his secretary confide in it." },
  { month: 1, day: 5, year: 2021, text: "OpenAI shows DALL·E and CLIP, and pictures begin to answer to sentences." },
  { month: 1, day: 7, year: 1954, text: "The Georgetown–I.B.M. experiment turns sixty Russian sentences into English before the press." },
  { month: 1, day: 11, year: 2021, text: "The Switch Transformer is posted: a trillion parameters, of which any one word wakes only a handful." },
  { month: 1, day: 16, year: 2013, text: "Word2vec is posted, and words acquire arithmetic." },
  { month: 1, day: 20, year: 2025, text: "DeepSeek publishes R1, and reasoning arrives with open weights." },
  { month: 1, day: 23, year: 2023, text: "Microsoft commits a reported ten thousand million dollars to OpenAI." },
  { month: 1, day: 24, year: 2019, text: "AlphaStar takes ten games of StarCraft from two professional players." },
  { month: 1, day: 26, year: 2014, text: "Google buys DeepMind, a London laboratory with no product." },
  { month: 1, day: 27, year: 2016, text: "Nature carries AlphaGo, five weeks before the world is told to watch." },
  { month: 1, day: 30, year: 2017, text: "Libratus finishes twenty days of poker ahead of four professionals." },

  /* ---------------------------------------------------------------- *
   * February
   * ---------------------------------------------------------------- */
  { month: 2, day: 6, year: 2023, text: "Google answers ChatGPT with Bard, and calls the matter a code red." },
  { month: 2, day: 7, year: 2023, text: "Microsoft puts a language model inside Bing, and the search box starts talking back." },
  { month: 2, day: 10, year: 1996, text: "Deep Blue takes a game from Garry Kasparov — the first a champion has lost to a machine at tournament pace." },
  { month: 2, day: 11, year: 2015, text: "Batch normalisation is posted, and deep networks stop needing to be coaxed." },
  { month: 2, day: 14, year: 2019, text: "OpenAI describes GPT-2 and declines to release it, citing what it might be used for." },
  { month: 2, day: 15, year: 2024, text: "OpenAI shows Sora, and a paragraph becomes a minute of film." },
  { month: 2, day: 16, year: 2011, text: "Watson finishes two nights of Jeopardy! with more money than both human champions together." },
  { month: 2, day: 21, year: 2024, text: "Google publishes Gemma, and gives away weights of its own for the first time." },
  { month: 2, day: 24, year: 2023, text: "Meta releases LLaMA to researchers; within a week it is everywhere." },
  { month: 2, day: 26, year: 2015, text: "Nature carries the deep Q-network, which learns forty-nine Atari games from the pixels alone." },

  /* ---------------------------------------------------------------- *
   * March
   * ---------------------------------------------------------------- */
  { month: 3, day: 4, year: 2024, text: "Anthropic publishes the Claude 3 models." },
  { month: 3, day: 5, year: 2025, text: "The Turing Award goes to Andrew Barto and Richard Sutton for reinforcement learning." },
  { month: 3, day: 9, year: 2016, text: "AlphaGo takes the first game from Lee Sedol in Seoul; the commentators stop smiling." },
  { month: 3, day: 13, year: 2016, text: "Lee Sedol wins game four — the last game any human has won from AlphaGo." },
  { month: 3, day: 14, year: 2023, text: "GPT-4 is released and Claude is launched, on the same day." },
  { month: 3, day: 15, year: 2016, text: "AlphaGo closes the match four games to one." },
  { month: 3, day: 18, year: 2024, text: "Nvidia shows the Blackwell processor, and the price of admission rises again." },
  { month: 3, day: 22, year: 2023, text: "A thousand signatories ask the laboratories to pause for six months. They do not." },
  { month: 3, day: 23, year: 2016, text: "Microsoft looses Tay upon Twitter and withdraws her inside a day." },
  { month: 3, day: 27, year: 2019, text: "The Turing Award goes to Bengio, Hinton and LeCun, thirty years after the field dismissed them." },
  { month: 3, day: 29, year: 2022, text: "Chinchilla is posted: the great models, it turns out, had been starved of reading." },

  /* ---------------------------------------------------------------- *
   * April
   * ---------------------------------------------------------------- */
  { month: 4, day: 5, year: 2022, text: "PaLM is posted at five hundred and forty thousand million parameters, and explains its own jokes." },
  { month: 4, day: 6, year: 2022, text: "DALL·E 2 is shown, and the argument about illustration begins in earnest." },
  { month: 4, day: 13, year: 2019, text: "OpenAI Five beats the reigning Dota champions two games to none." },
  { month: 4, day: 16, year: 2025, text: "OpenAI ships o3 and o4-mini, models that use tools while they think." },
  { month: 4, day: 18, year: 2024, text: "Meta releases Llama 3." },
  { month: 4, day: 21, year: 2021, text: "The European Commission proposes the A.I. Act — the first attempt to write the rules down." },
  { month: 4, day: 23, year: 2024, text: "Microsoft publishes Phi-3, trained on textbooks, and small models stop being toys." },
  { month: 4, day: 29, year: 2025, text: "Alibaba publishes the Qwen3 family, and the open frontier is no longer only American." },
  { month: 4, day: 30, year: 1916, text: "Claude Elwood Shannon is born at Petoskey, Michigan." },

  /* ---------------------------------------------------------------- *
   * May
   * ---------------------------------------------------------------- */
  { month: 5, day: 1, year: 2023, text: "Geoffrey Hinton leaves Google so that he may say what he thinks of the work." },
  { month: 5, day: 10, year: 2023, text: "Google publishes PaLM 2 and puts it through every product it owns." },
  { month: 5, day: 11, year: 1997, text: "Deep Blue takes the sixth game, and the match, from Garry Kasparov." },
  { month: 5, day: 8, year: 2024, text: "AlphaFold 3 is published, and reaches past the protein to whatever it binds to." },
  { month: 5, day: 13, year: 2024, text: "GPT-4o is shown speaking, seeing and being interrupted." },
  { month: 5, day: 18, year: 2021, text: "Google announces LaMDA, a model built for conversation and nothing else." },
  { month: 5, day: 22, year: 2025, text: "Anthropic publishes Claude Opus 4 and Sonnet 4." },
  { month: 5, day: 28, year: 2020, text: "The GPT-3 paper appears: scale, it turns out, is a method." },
  { month: 5, day: 30, year: 2023, text: "Three hundred and fifty researchers sign a single sentence about extinction risk." },

  /* ---------------------------------------------------------------- *
   * June
   * ---------------------------------------------------------------- */
  { month: 6, day: 7, year: 1954, text: "Alan Turing dies at Wilmslow, aged forty-one." },
  { month: 6, day: 10, year: 2014, text: "Ian Goodfellow posts the generative adversarial network, conceived in a public house." },
  { month: 6, day: 11, year: 2018, text: "OpenAI posts the first GPT, and pre-training becomes the plan." },
  { month: 6, day: 12, year: 2017, text: "Eight authors post “Attention Is All You Need”, and quietly retire the recurrent network." },
  { month: 6, day: 18, year: 1956, text: "The Dartmouth Summer Research Project opens; ten men give the field two months and a name." },
  { month: 6, day: 20, year: 2024, text: "Anthropic publishes Claude 3.5 Sonnet." },
  { month: 6, day: 23, year: 1912, text: "Alan Mathison Turing is born in Maida Vale, London." },
  { month: 6, day: 24, year: 2009, text: "Fei-Fei Li presents ImageNet at Miami: fifteen million labelled photographs, and nobody yet wants them." },
  { month: 6, day: 26, year: 2012, text: "Google reports a network that taught itself to recognise a cat from unlabelled video." },

  /* ---------------------------------------------------------------- *
   * July
   * ---------------------------------------------------------------- */
  { month: 7, day: 3, year: 2012, text: "Dropout is posted: to train a network well, cripple it at random." },
  { month: 7, day: 7, year: 1958, text: "The Navy demonstrates Frank Rosenblatt's Perceptron, and the papers promise a machine that will think." },
  { month: 7, day: 11, year: 2019, text: "Pluribus beats five poker professionals at once, at a game thought safe from machines." },
  { month: 7, day: 12, year: 2022, text: "Midjourney opens to the public, and the illustration trade is put on notice." },
  { month: 7, day: 15, year: 2021, text: "AlphaFold 2 is published and given away, fifty years into the protein-folding problem." },
  { month: 7, day: 18, year: 2023, text: "Llama 2 is released with a licence permitting trade, and the open models acquire a business." },
  { month: 7, day: 21, year: 2023, text: "Seven laboratories give the White House voluntary undertakings on safety." },
  { month: 7, day: 23, year: 2024, text: "Llama 3.1 arrives at four hundred and five thousand million parameters, weights and all." },
  { month: 7, day: 28, year: 2022, text: "DeepMind publishes the predicted structure of very nearly every known protein." },

  /* ---------------------------------------------------------------- *
   * August
   * ---------------------------------------------------------------- */
  { month: 8, day: 1, year: 2024, text: "The European A.I. Act enters into force, three years after it was drafted." },
  { month: 8, day: 5, year: 2025, text: "OpenAI publishes open-weight models for the first time since GPT-2." },
  { month: 8, day: 7, year: 2025, text: "GPT-5 is released." },
  { month: 8, day: 9, year: 1927, text: "Marvin Minsky is born in New York." },
  { month: 8, day: 10, year: 2021, text: "Codex is shown writing programmes from their descriptions." },
  { month: 8, day: 17, year: 1956, text: "The Dartmouth project breaks up after eight weeks, having agreed on little but the name." },
  { month: 8, day: 22, year: 2022, text: "Stable Diffusion is published with its weights, and the picture machine leaves the laboratory for good." },
  { month: 8, day: 24, year: 2023, text: "Code Llama is released, and the trade of programming acquires a free machine." },
  { month: 8, day: 31, year: 1955, text: "A proposal for a summer study at Dartmouth coins the phrase “artificial intelligence”." },

  /* ---------------------------------------------------------------- *
   * September
   * ---------------------------------------------------------------- */
  { month: 9, day: 1, year: 2014, text: "Bahdanau and colleagues post attention, and translation stops forgetting the beginning of the sentence." },
  { month: 9, day: 4, year: 1927, text: "John McCarthy is born at Boston — the man who will give the field its name." },
  { month: 9, day: 5, year: 2024, text: "DeepMind shows AlphaProteo, which designs a protein to order to grip another." },
  { month: 9, day: 10, year: 2014, text: "Sequence-to-sequence learning is posted, and one network learns to answer another." },
  { month: 9, day: 12, year: 2024, text: "OpenAI ships o1, a model paid to think before it speaks." },
  { month: 9, day: 19, year: 2024, text: "Alibaba publishes the Qwen2.5 family, and the open weights start coming out of Hangzhou." },
  { month: 9, day: 20, year: 2023, text: "DALL·E 3 is put inside ChatGPT, so that the picture may be argued with." },
  { month: 9, day: 22, year: 2020, text: "Microsoft takes an exclusive licence to GPT-3, and open research acquires a landlord." },
  { month: 9, day: 25, year: 2024, text: "Llama 3.2 arrives small enough to run on a telephone." },
  { month: 9, day: 27, year: 2016, text: "Google Translate is rebuilt on a neural network, and a decade of phrase tables is retired overnight." },
  { month: 9, day: 29, year: 2022, text: "Meta shows Make-A-Video: a sentence in, a moving picture out." },
  { month: 9, day: 30, year: 2012, text: "AlexNet wins the ImageNet contest by ten points, and the deep learning era begins on a pair of gaming cards." },

  /* ---------------------------------------------------------------- *
   * October
   * ---------------------------------------------------------------- */
  { month: 10, day: 1, year: 1950, text: "Mind carries Turing's “Computing Machinery and Intelligence”, and the question becomes a game." },
  { month: 10, day: 7, year: 2022, text: "Washington restricts the export of advanced processors, and computation becomes a matter of state." },
  { month: 10, day: 8, year: 2024, text: "The Nobel Prize in Physics goes to Hopfield and Hinton, for neural networks." },
  { month: 10, day: 9, year: 1986, text: "Nature carries back-propagation, and a network may at last be taught more than one layer deep." },
  { month: 10, day: 11, year: 2018, text: "BERT is posted, and every leaderboard in language is rewritten inside a month." },
  { month: 10, day: 18, year: 2017, text: "AlphaGo Zero is published: it learned Go from the rules, and beat its ancestor a hundred games to none." },
  { month: 10, day: 22, year: 2024, text: "Claude is given a mouse and a keyboard, and begins operating the computer itself." },
  { month: 10, day: 24, year: 2011, text: "John McCarthy dies at Stanford, fifty-six years after he wrote the phrase down." },
  { month: 10, day: 25, year: 2017, text: "Saudi Arabia confers citizenship upon a robot named Sophia, to general bewilderment." },
  { month: 10, day: 30, year: 2023, text: "An executive order on artificial intelligence is signed in Washington." },

  /* ---------------------------------------------------------------- *
   * November
   * ---------------------------------------------------------------- */
  { month: 11, day: 1, year: 2023, text: "Twenty-eight nations meet at Bletchley Park and sign a declaration on frontier models." },
  { month: 11, day: 5, year: 2019, text: "OpenAI releases the whole of GPT-2 after nine months, the feared misuse having not arrived." },
  { month: 11, day: 6, year: 2023, text: "OpenAI holds its first developer day; a fortnight later its board dismisses the man who ran it." },
  { month: 11, day: 11, year: 1998, text: "LeCun's LeNet-5 is published, and the convolutional network is already reading cheques in the post." },
  { month: 11, day: 15, year: 1997, text: "Hochreiter and Schmidhuber publish long short-term memory, and a network acquires a memory that keeps." },
  { month: 11, day: 17, year: 2023, text: "The board of OpenAI dismisses Sam Altman on a Friday afternoon." },
  { month: 11, day: 21, year: 2023, text: "Sam Altman is reinstated, five days and seven hundred resignation letters later." },
  { month: 11, day: 25, year: 2024, text: "Anthropic gives away the Model Context Protocol, and the models are handed a plug." },
  { month: 11, day: 30, year: 2022, text: "ChatGPT is put on the internet as a research preview, and takes a hundred million readers in two months." },

  /* ---------------------------------------------------------------- *
   * December
   * ---------------------------------------------------------------- */
  { month: 12, day: 1, year: 1943, text: "McCulloch and Pitts publish a logical calculus of nervous activity, and the neuron becomes arithmetic." },
  { month: 12, day: 2, year: 2020, text: "At CASP14 the assessors find AlphaFold 2's predictions as good as the laboratory's." },
  { month: 12, day: 5, year: 2017, text: "AlphaZero is posted: chess, shogi and Go from the rules alone, in a day apiece." },
  { month: 12, day: 6, year: 2023, text: "Google announces Gemini, built to take pictures and sound as readily as words." },
  { month: 12, day: 8, year: 2023, text: "Brussels sits through the night and agrees the A.I. Act." },
  { month: 12, day: 10, year: 2015, text: "Residual networks are posted, and depth stops being the limit." },
  { month: 12, day: 11, year: 2015, text: "OpenAI is founded as a non-profit, with a thousand million dollars pledged." },
  { month: 12, day: 15, year: 2022, text: "Constitutional A.I. is posted: a model taught to criticise itself against a written rule." },
  { month: 12, day: 19, year: 2013, text: "DeepMind posts a network that learns to play Atari from the screen, and Google notices." },
  { month: 12, day: 20, year: 2024, text: "OpenAI shows o3 scoring eighty-seven on a reasoning test built to defeat machines." },
  { month: 12, day: 22, year: 2014, text: "Adam is posted, and very nearly every network since has been trained by it." },
  { month: 12, day: 26, year: 2024, text: "DeepSeek publishes V3, trained for a fraction of what the frontier is thought to cost." },
  { month: 12, day: 27, year: 2023, text: "The New York Times sues OpenAI and Microsoft over the contents of the training set." },
];

export type Almanac = {
  /** Set as the kicker above the line; tells the reader how exact the match is. */
  label: string;
  year: number;
  text: string;
};

/**
 * How far either side of the date the almanac may look before it gives up on
 * "on this day". Roughly a hundred entries over a seven-day window covers
 * most of the calendar, so the honest-but-vaguer labels are rare — and when
 * one is used the reader is told, rather than being shown the 20th of the
 * month under a line claiming it is the 17th.
 */
const NEAR_DAYS = 3;

/**
 * The almanac line for an edition date, as `YYYY-MM-DD`.
 *
 * Arithmetic is done in UTC on purpose. The edition date is a calendar date
 * with no time in it, and parsing it into a local Date would make the answer
 * depend on the reader's offset — the same edition would show a different
 * milestone in Auckland than in San Francisco.
 */
export function almanacFor(isoDate: string): Almanac {
  const [year, month, day] = isoDate.split("-").map(Number);

  if (!year || !month || !day) return evergreen(0);

  for (let offset = 0; offset <= NEAR_DAYS; offset++) {
    // The paper looks backwards before it looks forwards: on a date with no
    // entry, yesterday's milestone has at least already happened.
    for (const delta of offset === 0 ? [0] : [-offset, offset]) {
      const at = new Date(Date.UTC(year, month - 1, day + delta));
      const hit = MILESTONES.find(
        (m) => m.month === at.getUTCMonth() + 1 && m.day === at.getUTCDate()
      );
      if (!hit) continue;
      return {
        label: offset === 0 ? "On this day in A.I." : "This week in A.I.",
        year: hit.year,
        text: hit.text,
      };
    }
  }

  return evergreen(month * 31 + day);
}

/**
 * The line that can never fail. Even with the window above there must be a
 * last resort, because a masthead with a hole in it is worse than a masthead
 * carrying an old milestone under an honest label.
 */
function evergreen(seed: number): Almanac {
  const entry = MILESTONES[Math.abs(seed) % MILESTONES.length];
  return {
    label: "From the annals of A.I.",
    year: entry.year,
    text: entry.text,
  };
}
