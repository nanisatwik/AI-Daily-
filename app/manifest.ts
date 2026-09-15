import type { MetadataRoute } from "next";

/**
 * Installable on iOS and Android from the browser — no store, no fee, no
 * separate codebase. `display: standalone` drops the browser chrome so it
 * opens like an app from the home screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The AI Daily",
    short_name: "AI Daily",
    description:
      "A daily AI newspaper. Real stories from public feeds, deduplicated into events and set in type you turn by hand.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches the paper, so the splash and status bar do not flash white.
    background_color: "#e7d9bb",
    theme_color: "#2b1f12",
    categories: ["news", "magazines"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "The index", short_name: "Search", url: "/search" },
    ],
  };
}
