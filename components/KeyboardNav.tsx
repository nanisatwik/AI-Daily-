"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setEdition } from "./NightToggle";

export default function KeyboardNav() {
  const router = useRouter();
  const index = useRef(-1);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    const links = () =>
      Array.from(
        document.querySelectorAll<HTMLAnchorElement>("[data-story-link]")
      );

    const cue = (next: number) => {
      const all = links();
      if (all.length === 0) return;
      all.forEach((el) => el.classList.remove("is-cued"));
      index.current = Math.max(0, Math.min(all.length - 1, next));
      const el = all[index.current];
      el.classList.add("is-cued");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    };

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "j":
        case "J":
          e.preventDefault();
          cue(index.current + 1);
          break;
        case "k":
        case "K":
          e.preventDefault();
          cue(index.current - 1);
          break;
        case "n":
        case "N":
          e.preventDefault();
          setEdition(!document.documentElement.classList.contains("night"));
          break;
        case "Escape":
          e.preventDefault();
          router.push("/");
          break;
        case "?":
          e.preventDefault();
          setHintVisible((v) => !v);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div
      aria-hidden="true"
      className="meta hidden md:flex items-center gap-4 justify-center py-5"
    >
      {hintVisible ? (
        <span>
          &larr; &rarr; turn the page &middot; j / k next and previous story
          &middot; enter open &middot; n gaslight edition
        </span>
      ) : (
        <span>Press ? for keyboard shortcuts</span>
      )}
    </div>
  );
}
