"use client";

import { useEffect } from "react";

/**
 * Registers the offline worker after the page has settled.
 *
 * Deferred to the load event on purpose: registering during render competes
 * with fetching the edition itself, and the first visit is the one where
 * caching matters least.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unavailable worker costs offline reading and nothing else.
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
