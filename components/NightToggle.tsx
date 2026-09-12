"use client";

import { useEffect, useState } from "react";

export function setEdition(night: boolean) {
  document.documentElement.classList.toggle("night", night);
  try {
    localStorage.setItem("edition", night ? "night" : "day");
  } catch {}
  window.dispatchEvent(new CustomEvent("editionchange", { detail: night }));
}

export default function NightToggle() {
  const [night, setNight] = useState(false);

  useEffect(() => {
    setNight(document.documentElement.classList.contains("night"));
    const onChange = (e: Event) => setNight((e as CustomEvent<boolean>).detail);
    window.addEventListener("editionchange", onChange);
    return () => window.removeEventListener("editionchange", onChange);
  }, []);

  return (
    <button
      type="button"
      onClick={() => setEdition(!night)}
      aria-pressed={night}
      title="Toggle the gaslight edition (n)"
      className="kicker cursor-pointer border border-[var(--rule)] px-3 py-1.5 text-[var(--ink-soft)] hover:bg-[var(--ink)] hover:text-[var(--paper)] hover:border-[var(--ink)] transition-colors duration-300"
    >
      {night ? "Morning edition" : "Gaslight edition"}
    </button>
  );
}
