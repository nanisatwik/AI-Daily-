"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REFERENCE_SIZE = 100;

export default function FitText({
  children,
  className = "",
  max = 160,
}: {
  children: string;
  className?: string;
  max?: number;
}) {
  const holder = useRef<HTMLSpanElement>(null);
  const lastWidth = useRef(0);
  const [size, setSize] = useState<number | null>(null);

  const fit = useCallback(() => {
    const el = holder.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const available = parent.clientWidth;
    if (available === 0) return;

    const prev = el.style.fontSize;
    el.style.fontSize = `${REFERENCE_SIZE}px`;
    const natural = el.getBoundingClientRect().width;
    el.style.fontSize = prev;

    if (natural === 0) return;

    lastWidth.current = available;
    setSize(Math.min((available / natural) * REFERENCE_SIZE, max));
  }, [max]);

  useEffect(() => {
    fit();

    const parent = holder.current?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      if (parent.clientWidth !== lastWidth.current) fit();
    });
    observer.observe(parent);

    document.fonts?.ready.then(fit).catch(() => {});

    return () => observer.disconnect();
  }, [fit]);

  return (
    <span
      ref={holder}
      className={`inline-block whitespace-nowrap ${className}`}
      style={{
        fontSize: size ? `${size}px` : `${REFERENCE_SIZE}px`,
        visibility: size ? "visible" : "hidden",
      }}
    >
      {children}
    </span>
  );
}
