import type { PublisherType, Section, Source } from "../../lib/types.ts";

export type Feed = {
  source: Source;
  url: string;
  /** Fallback when a story cannot be classified from its own text. */
  defaultCategory: Section;
};

/**
 * Permitted sources, all public RSS/Atom. `trust` weights editorial ranking —
 * it is a statement about a publisher's track record for this beat, not a
 * claim about the truth of any individual story.
 */
export const FEEDS: Feed[] = [
  {
    source: {
      id: "arxiv-ai",
      name: "arXiv cs.AI",
      url: "https://arxiv.org",
      publisherType: "preprint",
      trust: 0.72,
    },
    url: "https://export.arxiv.org/rss/cs.AI",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "arxiv-lg",
      name: "arXiv cs.LG",
      url: "https://arxiv.org",
      publisherType: "preprint",
      trust: 0.72,
    },
    url: "https://export.arxiv.org/rss/cs.LG",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "techcrunch-ai",
      name: "TechCrunch",
      url: "https://techcrunch.com",
      publisherType: "publication",
      trust: 0.82,
    },
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    defaultCategory: "AI Startups",
  },
  {
    source: {
      id: "verge-ai",
      name: "The Verge",
      url: "https://www.theverge.com",
      publisherType: "publication",
      trust: 0.84,
    },
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    defaultCategory: "AI News",
  },
  // VentureBeat removed: it answers every request with HTTP 429 regardless of
  // pacing, so it was a guaranteed failure line in every run.
  {
    source: {
      id: "wired-ai",
      name: "Wired",
      url: "https://www.wired.com",
      publisherType: "publication",
      trust: 0.85,
    },
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "ieee-spectrum",
      name: "IEEE Spectrum",
      url: "https://spectrum.ieee.org",
      publisherType: "publication",
      trust: 0.89,
    },
    url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "mit-news-ai",
      name: "MIT News",
      url: "https://news.mit.edu",
      publisherType: "lab",
      trust: 0.88,
    },
    url: "https://news.mit.edu/rss/topic/artificial-intelligence2",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "google-research",
      name: "Google Research",
      url: "https://research.google",
      publisherType: "lab",
      trust: 0.89,
    },
    url: "https://research.google/blog/rss/",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "arstechnica",
      name: "Ars Technica",
      url: "https://arstechnica.com",
      publisherType: "publication",
      trust: 0.88,
    },
    // The main feed, not technology-lab: that one runs days stale, and the
    // relevance gate already keeps non-AI stories off the page.
    url: "https://feeds.arstechnica.com/arstechnica/index",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "register-ai",
      name: "The Register",
      url: "https://www.theregister.com",
      publisherType: "publication",
      trust: 0.78,
    },
    url: "https://www.theregister.com/software/ai_ml/headlines.atom",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "deepmind",
      name: "Google DeepMind",
      url: "https://deepmind.google",
      publisherType: "lab",
      trust: 0.9,
    },
    url: "https://deepmind.google/blog/rss.xml",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "huggingface",
      name: "Hugging Face",
      url: "https://huggingface.co",
      publisherType: "lab",
      trust: 0.8,
    },
    url: "https://huggingface.co/blog/feed.xml",
    defaultCategory: "Developer",
  },
  {
    source: {
      id: "openai",
      name: "OpenAI",
      url: "https://openai.com",
      publisherType: "lab",
      trust: 0.86,
    },
    url: "https://openai.com/news/rss.xml",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "hn-ai",
      name: "Hacker News",
      url: "https://news.ycombinator.com",
      publisherType: "community",
      trust: 0.6,
    },
    // Points threshold, not raw submissions: unvoted "Show HN" toys outranked
    // real news on the first run. Traction is also what other outlets follow.
    url: "https://hnrss.org/newest?q=AI&points=80&count=40",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "mit-tr",
      name: "MIT Technology Review",
      url: "https://www.technologyreview.com",
      publisherType: "publication",
      trust: 0.87,
    },
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
    defaultCategory: "AI News",
  },

  /* ------------------------------------------------------------------ *
   * Widened wire. Every feed below was fetched once before being added
   * here and reported a parseable item from the last 24 hours — an
   * unverified feed is a guaranteed failure line in every daily run,
   * which is why VentureBeat is commented out above rather than present.
   *
   * Sixteen of these were promoted from thirty-seven candidates. Notably
   * NOT promoted: Techmeme, which aggregates other outlets' headlines and
   * would therefore manufacture corroboration — its copy of a TechCrunch
   * headline would read as a second independent outlet and inflate the
   * tally marks. Anthropic, Meta AI, Mistral, AllenAI and Microsoft AI all
   * answer 404/410 and have no working public feed. Synced Review,
   * SemiAnalysis and Import AI answer but are months stale.
   * ------------------------------------------------------------------ */

  {
    source: {
      id: "the-decoder",
      name: "The Decoder",
      url: "https://the-decoder.com",
      publisherType: "publication",
      trust: 0.79,
    },
    url: "https://the-decoder.com/feed/",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "zdnet-ai",
      name: "ZDNET",
      url: "https://www.zdnet.com",
      publisherType: "publication",
      trust: 0.78,
    },
    url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "nyt-tech",
      name: "The New York Times",
      url: "https://www.nytimes.com",
      publisherType: "publication",
      trust: 0.9,
    },
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "guardian-tech",
      name: "The Guardian",
      url: "https://www.theguardian.com",
      publisherType: "publication",
      trust: 0.86,
    },
    url: "https://www.theguardian.com/technology/rss",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "bbc-tech",
      name: "BBC News",
      url: "https://www.bbc.co.uk/news",
      publisherType: "publication",
      trust: 0.88,
    },
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "engadget",
      name: "Engadget",
      url: "https://www.engadget.com",
      publisherType: "publication",
      trust: 0.76,
    },
    url: "https://www.engadget.com/rss.xml",
    defaultCategory: "AI News",
  },
  {
    source: {
      id: "ieee-computing",
      name: "IEEE Spectrum",
      url: "https://spectrum.ieee.org",
      publisherType: "publication",
      trust: 0.89,
    },
    url: "https://spectrum.ieee.org/feeds/topic/computing.rss",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "marktechpost",
      name: "MarkTechPost",
      url: "https://www.marktechpost.com",
      publisherType: "publication",
      trust: 0.68,
    },
    url: "https://www.marktechpost.com/feed/",
    defaultCategory: "AI Research",
  },
  // European desks. The LOCAL pillar tags only three stories in twenty-four
  // because US wire copy rarely names a city; regional press names one in
  // almost every piece.
  {
    source: {
      id: "sifted",
      name: "Sifted",
      url: "https://sifted.eu",
      publisherType: "publication",
      trust: 0.78,
    },
    url: "https://sifted.eu/feed",
    defaultCategory: "AI Startups",
  },
  {
    source: {
      id: "tech-eu",
      name: "Tech.eu",
      url: "https://tech.eu",
      publisherType: "publication",
      trust: 0.76,
    },
    url: "https://tech.eu/feed/",
    defaultCategory: "AI Startups",
  },
  {
    source: {
      id: "nvidia-blog",
      name: "NVIDIA",
      url: "https://blogs.nvidia.com",
      publisherType: "vendor",
      trust: 0.75,
    },
    url: "https://blogs.nvidia.com/feed/",
    defaultCategory: "AI Business",
  },
  {
    source: {
      id: "simonwillison",
      name: "Simon Willison",
      url: "https://simonwillison.net",
      publisherType: "community",
      trust: 0.82,
    },
    url: "https://simonwillison.net/atom/everything/",
    defaultCategory: "Developer",
  },
  {
    source: {
      id: "reddit-ml",
      name: "r/MachineLearning",
      url: "https://www.reddit.com/r/MachineLearning",
      publisherType: "community",
      trust: 0.6,
    },
    url: "https://www.reddit.com/r/MachineLearning/.rss",
    defaultCategory: "AI Research",
  },
  // The three arXiv sections that were missing. cs.CL is where language-model
  // work is actually filed, and cs.RO is the only real supply of robotics.
  {
    source: {
      id: "arxiv-cl",
      name: "arXiv cs.CL",
      url: "https://arxiv.org",
      publisherType: "preprint",
      trust: 0.72,
    },
    url: "https://export.arxiv.org/rss/cs.CL",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "arxiv-cv",
      name: "arXiv cs.CV",
      url: "https://arxiv.org",
      publisherType: "preprint",
      trust: 0.72,
    },
    url: "https://export.arxiv.org/rss/cs.CV",
    defaultCategory: "AI Research",
  },
  {
    source: {
      id: "arxiv-ro",
      name: "arXiv cs.RO",
      url: "https://arxiv.org",
      publisherType: "preprint",
      trust: 0.72,
    },
    url: "https://export.arxiv.org/rss/cs.RO",
    defaultCategory: "Robotics",
  },
];

/**
 * Editorial prominence by publisher type — distinct from trust.
 *
 * A preprint can be entirely trustworthy and still not be a front-page news
 * event. arXiv files hundreds of papers a day, all of them minutes old, so on
 * freshness alone they will bury every reported story: the front page becomes
 * a list of paper titles. This weight keeps research in the Research section
 * where it belongs, while leaving it free to lead if several outlets pick it up.
 */
export const TYPE_WEIGHT: Record<PublisherType, number> = {
  wire: 1,
  publication: 1,
  lab: 0.95,
  vendor: 0.8,
  community: 0.75,
  preprint: 0.5,
};

/**
 * Keyword rules for topic classification. Deliberately boring and inspectable:
 * a model is not needed to tell a funding round from a policy ruling, and a
 * rule that can be read is a rule that can be corrected.
 */
export const CATEGORY_RULES: { category: Section; patterns: RegExp[] }[] = [
  {
    category: "AI Policy",
    patterns: [
      /\b(regulat|policy|legislat|law|lawsuit|court|ruling|ban|compliance|governance|copyright|antitrust|privacy)\w*/i,
      /\b(eu ai act|white house|congress|parliament|ftc|sec)\b/i,
    ],
  },
  {
    category: "AI Startups",
    patterns: [
      /\b(seed|series [a-e]|funding|raises?|raised|valuation|venture|investor|startup|acqui)\w*/i,
      /\$\s?\d+(\.\d+)?\s?(m|bn|b|million|billion)\b/i,
    ],
  },
  {
    category: "Robotics",
    patterns: [/\b(robot|humanoid|drone|autonom\w*|embodied|self-driving|waymo)\b/i],
  },
  {
    category: "AI Research",
    patterns: [
      /\b(paper|preprint|arxiv|benchmark|architecture|attention|transformer|fine-?tun\w*|distill\w*|ablation|dataset|sota)\b/i,
    ],
  },
  {
    category: "Developer",
    patterns: [
      /\b(open[- ]?source|api|sdk|framework|library|repo|github|release notes|toolkit|cli|inference server)\b/i,
    ],
  },
  {
    category: "AI Business",
    patterns: [
      /\b(revenue|earnings|market|partnership|enterprise|customers?|pricing|deal|contract|ipo|layoff)\b/i,
    ],
  },
];
