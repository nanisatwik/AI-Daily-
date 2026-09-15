"use client";

import { useState } from "react";
import { usePreferences } from "./Preferences";
import { SECTIONS } from "@/lib/types";
import { HUB_CITIES } from "@/lib/hubs";
import { Fleuron, PointingHand } from "./Ornament";

/**
 * First-run preferences, set as a subscription order form.
 *
 * The blueprint asks for a topics-and-cities picker. A 1925 paper had exactly
 * that object already — the order form you posted back to start delivery — so
 * it costs nothing to make the onboarding feel like part of the paper instead
 * of a product tour bolted to the front of it.
 *
 * Skippable in one click. Nothing here is required to read the paper, and a
 * reader who dismisses it is not asked again.
 */
export default function Onboarding() {
  const { prefs, ready, update, toggleTopic, toggleCity } = usePreferences();
  const [closing, setClosing] = useState(false);

  // Wait for localStorage: rendering this before we know whether the reader has
  // already subscribed would flash the form at returning readers every visit.
  if (!ready || prefs.onboarded || closing) return null;

  const finish = () => {
    setClosing(true);
    update({ onboarded: true });
  };

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-[rgba(20,12,4,0.55)] px-3 py-6 sm:px-6 sm:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-form-title"
    >
      <div className="mx-auto max-w-[620px] border-2 border-[var(--ink)] bg-[var(--paper)] px-5 py-6 sm:px-9 sm:py-8 shadow-[6px_6px_0_0_rgba(20,12,4,0.35)]">
        <div className="text-center">
          <p className="kicker text-[var(--accent)]">Order form</p>
          <h2
            id="order-form-title"
            className="font-mast mt-2 leading-[1.05] text-[var(--ink)]"
            style={{ fontSize: "clamp(1.6rem, 6vw, 2.4rem)" }}
          >
            The AI Daily
          </h2>
          <div className="mt-3 flex items-center justify-center gap-3 text-[var(--rule)]">
            <span className="h-px w-14 bg-current" />
            <Fleuron className="h-4 w-8" />
            <span className="h-px w-14 bg-current" />
          </div>
          <p className="font-body italic mt-3 text-[15px] leading-relaxed text-[var(--ink-soft)] max-w-[44ch] mx-auto">
            Tell the compositor what to set for you. Everything below is
            optional, and none of it leaves this device.
          </p>
        </div>

        <fieldset className="mt-7">
          <legend className="kicker mb-3 text-[var(--ink-soft)]">
            Desks you follow
          </legend>
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((section) => {
              const on = prefs.topics.includes(section);
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => toggleTopic(section)}
                  aria-pressed={on}
                  className={`kicker cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
                      : "border-[var(--rule)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
                  }`}
                >
                  {section}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="kicker mb-3 text-[var(--ink-soft)]">
            Where you are
          </legend>
          <div className="flex flex-wrap gap-2">
            {HUB_CITIES.map((city) => {
              const on = prefs.cities.includes(city);
              return (
                <button
                  key={city}
                  type="button"
                  onClick={() => toggleCity(city)}
                  aria-pressed={on}
                  className={`kicker cursor-pointer border px-3 py-1.5 transition-colors duration-200 ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--paper)]"
                      : "border-[var(--rule)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
                  }`}
                >
                  {city}
                </button>
              );
            })}
          </div>
          <p className="meta mt-2.5 normal-case tracking-normal font-body italic text-[12px]">
            Local coverage is thin today — most wire copy never names a city.
            Choosing one weights those stories up when they appear.
          </p>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="kicker mb-3 text-[var(--ink-soft)]">
            Delivered at
          </legend>
          <input
            type="time"
            value={prefs.briefingTime}
            onChange={(e) => update({ briefingTime: e.target.value })}
            aria-label="Briefing time"
            className="border border-[var(--rule)] bg-transparent px-3 py-1.5 font-body text-[15px] text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
          />
        </fieldset>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={finish}
            className="kicker cursor-pointer text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          >
            Just the general edition
          </button>
          <button
            type="button"
            onClick={finish}
            className="kicker flex cursor-pointer items-center justify-center gap-2.5 border-2 border-[var(--ink)] px-5 py-2.5 text-[var(--ink)] transition-colors duration-300 hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            Begin delivery
            <PointingHand className="h-3.5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
