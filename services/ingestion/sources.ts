import type { Section, Source } from "../../lib/types.ts";

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
  {
    source: {
      id: "venturebeat-ai",
      name: "VentureBeat",
      url: "https://venturebeat.com",
      publisherType: "publication",
      trust: 0.76,
    },
    url: "https://venturebeat.com/category/ai/feed/",
    defaultCategory: "AI Business",
  },
  {
    source: {
      id: "arstechnica",
      name: "Ars Technica",
      url: "https://arstechnica.com",
      publisherType: "publication",
      trust: 0.88,
    },
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
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
];

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
