"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferences } from "./Preferences";

/**
 * The weather box, as every broadsheet of the period carried one.
 *
 * Open-Meteo, because the $0 constraint is absolute: no key, no signup, no
 * card, and it sends CORS headers so the browser can call it directly and the
 * paper needs no server of its own to proxy it.
 *
 * The whole component is decoration with a fact in it. Nothing below is
 * allowed to matter: a denied permission, a dead network or a reply in a shape
 * we did not expect all land in the same place, which is a single honest line
 * of type where the reading would have been.
 */

/**
 * Coordinates for every hub the reader can choose during onboarding.
 *
 * `lib/hubs.ts` carries the aliases the ingestion pipeline geo-tags with and
 * no coordinates, because until now nothing needed them. Kept here rather
 * than pushed into that file so the pipeline is not made to carry a forecast's
 * baggage. The keys must match `HUBS[].city` exactly; a hub missing from here
 * simply falls through to the next resolution step, so a new city added to
 * `lib/hubs.ts` needs a line adding below too.
 */
const HUB_COORDS: Record<string, [number, number]> = {
  "San Francisco": [37.77, -122.42],
  Boston: [42.36, -71.06],
  "New York": [40.71, -74.01],
  Seattle: [47.61, -122.33],
  Austin: [30.27, -97.74],
  "Los Angeles": [34.05, -118.24],
  Bengaluru: [12.97, 77.59],
  Hyderabad: [17.39, 78.49],
  Toronto: [43.65, -79.38],
  London: [51.51, -0.13],
  Singapore: [1.35, 103.82],
};

/**
 * A reading is worth keeping for the visit but not beyond it. sessionStorage
 * rather than localStorage on purpose: an inferred location is not a
 * preference and there is no reason for the paper to still be holding one
 * tomorrow.
 */
const CACHE_KEY = "ai-daily.weather.v1";
const CACHE_TTL_MS = 20 * 60 * 1000;

/** Open-Meteo is quick, but a hanging request must not leave the box pending. */
const FETCH_TIMEOUT_MS = 6000;

const GEO_OPTIONS: PositionOptions = {
  // A forecast covers a district, so the coarse fix is the right one: it
  // returns sooner, costs the reader no battery, and asks their device for
  // less than it would otherwise hand over.
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 30 * 60 * 1000,
};

type State =
  | { kind: "pending" }
  | { kind: "ready"; line: string; place: string | null }
  /** Location would answer, but only after a prompt — which needs a gesture. */
  | { kind: "offer" }
  | { kind: "unavailable" };

/** WMO weather codes, in the words a forecast of the period would have used. */
function conditions(code: number): { phrase: string; withTemper: boolean } {
  switch (code) {
    case 0:
    case 1:
      return { phrase: "Fair", withTemper: true };
    case 2:
      return { phrase: "Partly cloudy", withTemper: true };
    case 3:
      return { phrase: "Overcast", withTemper: true };
    case 45:
    case 48:
      return { phrase: "Fog", withTemper: true };
    case 51:
    case 53:
    case 55:
      return { phrase: "Drizzle", withTemper: false };
    case 56:
    case 57:
    case 66:
    case 67:
      return { phrase: "Freezing rain", withTemper: false };
    case 61:
      return { phrase: "Light rain", withTemper: false };
    case 63:
      return { phrase: "Rain", withTemper: false };
    case 65:
      return { phrase: "Heavy rain", withTemper: false };
    case 71:
    case 77:
      return { phrase: "Light snow", withTemper: false };
    case 73:
      return { phrase: "Snow", withTemper: false };
    case 75:
      return { phrase: "Heavy snow", withTemper: false };
    case 80:
    case 81:
      return { phrase: "Showers", withTemper: false };
    case 82:
      return { phrase: "Violent showers", withTemper: false };
    case 85:
    case 86:
      return { phrase: "Snow showers", withTemper: false };
    case 95:
      return { phrase: "Thunder storms", withTemper: false };
    case 96:
    case 99:
      return { phrase: "Thunder storms, with hail", withTemper: false };
    default:
      return { phrase: "Unsettled", withTemper: false };
  }
}

/**
 * "Fair and warmer" was a comparison against yesterday, which one current
 * reading cannot make. This is the level rather than the trend — honest, and
 * it reads the same on the page.
 */
function temper(celsius: number): string {
  if (celsius >= 30) return "hot";
  if (celsius >= 24) return "warm";
  if (celsius >= 17) return "mild";
  if (celsius >= 9) return "cool";
  if (celsius >= 1) return "cold";
  return "freezing";
}

/** Fahrenheit only where the reader's own locale still uses it. */
function prefersFahrenheit(): boolean {
  try {
    const region = new Intl.Locale(navigator.language).region;
    return region === "US" || region === "LR" || region === "KY";
  } catch {
    return false;
  }
}

async function readWeather(
  latitude: number,
  longitude: number
): Promise<string> {
  const fahrenheit = prefersFahrenheit();

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  // Two decimals is about a kilometre, which is finer than a district
  // forecast needs. Rounding hands the service less than it asked for and
  // lets its cache answer for everyone else on the same block.
  url.searchParams.set("latitude", latitude.toFixed(2));
  url.searchParams.set("longitude", longitude.toFixed(2));
  url.searchParams.set("current", "temperature_2m,weather_code");
  if (fahrenheit) url.searchParams.set("temperature_unit", "fahrenheit");

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body: unknown = await res.json();
    const current = (body as { current?: Record<string, unknown> }).current;
    const degrees = Number(current?.temperature_2m);
    const code = Number(current?.weather_code);
    if (!Number.isFinite(degrees) || !Number.isFinite(code)) {
      throw new Error("no reading");
    }

    const { phrase, withTemper } = conditions(code);
    const celsius = fahrenheit ? ((degrees - 32) * 5) / 9 : degrees;
    const sky = withTemper ? `${phrase} and ${temper(celsius)}` : phrase;
    return `${sky}. Temp. ${Math.round(degrees)}°.`;
  } finally {
    window.clearTimeout(timer);
  }
}

function position(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      reject,
      GEO_OPTIONS
    );
  });
}

/**
 * Whether asking for a position would put a prompt in front of the reader.
 *
 * Safari does not answer this query for geolocation, so a thrown or unknown
 * answer is treated as "it would prompt" — the cautious reading, since the
 * cost of being wrong the other way is an unasked-for permission dialog on
 * the front page of a newspaper.
 */
async function geoPermission(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "prompt";
  }
}

export default function WeatherBox() {
  const { prefs, ready } = usePreferences();
  const [state, setState] = useState<State>({ kind: "pending" });

  /** Only the first chosen hub is used; a weather box reports one district. */
  const chosen = ready ? prefs.cities.find((c) => c in HUB_COORDS) ?? null : null;

  /** Guards the two async paths against a component that has gone away. */
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const publish = useCallback((line: string, place: string | null) => {
    try {
      window.sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), line, place })
      );
    } catch {
      // Private mode or a full quota. The reading is already on screen.
    }
    if (live.current) setState({ kind: "ready", line, place });
  }, []);

  useEffect(() => {
    /*
     * Preferences are read from disk a tick after mount, so deciding before
     * `ready` would conclude the reader has chosen no city when they have —
     * and the box would offer to ask for a location it did not need.
     */
    if (!ready) return;

    let cancelled = false;

    (async () => {
      try {
        const cached = window.sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { at, line, place } = JSON.parse(cached) as {
            at: number;
            line: string;
            place: string | null;
          };
          // A cached line also spares the reader the "pending" flash on reload.
          if (Date.now() - at < CACHE_TTL_MS && typeof line === "string") {
            if (!cancelled && live.current) {
              setState({ kind: "ready", line, place: place ?? null });
            }
            return;
          }
        }
      } catch {
        // Unreadable or hand-edited cache. Fall through and ask properly.
      }

      const canLocate = typeof navigator !== "undefined" && !!navigator.geolocation;
      const permission = canLocate ? await geoPermission() : "denied";
      if (cancelled) return;

      if (permission === "granted") {
        try {
          const [lat, lon] = await position();
          if (cancelled) return;
          const line = await readWeather(lat, lon);
          // Checked again after the fetch: the reader may have changed their
          // chosen city while it was in flight, in which case a later run of
          // this effect owns the box and this reading is already stale.
          if (cancelled) return;
          publish(line, null);
          return;
        } catch {
          // Granted but unanswered — indoors, or the device refused. The
          // reader's own chosen city is a better answer than an empty box.
        }
      }

      if (cancelled) return;

      if (chosen) {
        const [lat, lon] = HUB_COORDS[chosen];
        try {
          const line = await readWeather(lat, lon);
          if (cancelled) return;
          publish(line, chosen);
        } catch {
          if (!cancelled && live.current) setState({ kind: "unavailable" });
        }
        return;
      }

      /*
       * Nothing to go on without asking. The prompt is held back for a click
       * rather than fired on load: a permission dialog nobody invited is the
       * wrong way to greet a reader, and the box reads perfectly without one.
       */
      if (!live.current) return;
      setState(
        permission === "prompt" && canLocate
          ? { kind: "offer" }
          : { kind: "unavailable" }
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, chosen, publish]);

  const ask = useCallback(async () => {
    setState({ kind: "pending" });
    try {
      const [lat, lon] = await position();
      publish(await readWeather(lat, lon), null);
    } catch {
      if (live.current) setState({ kind: "unavailable" });
    }
  }, [publish]);

  const place = state.kind === "ready" ? state.place : null;

  return (
    <div>
      <p className="kicker text-[var(--ink-faint)] mb-1.5">
        The weather
        {place && (
          <span className="text-[var(--ink-soft)]"> &mdash; {place}</span>
        )}
      </p>

      {/*
        The reading is set in caps, as a weather box was; the other three
        states are editorial notes and set in italic, so an absent reading
        never reads as a broken one.
      */}
      {state.kind === "ready" ? (
        <p className="font-label text-[12px] font-medium uppercase tracking-[0.07em] leading-[1.5] text-[var(--ink)]">
          {state.line}
        </p>
      ) : state.kind === "offer" ? (
        <button
          type="button"
          onClick={ask}
          title="Asks your browser for a rough position, once, to fetch the local forecast"
          className="font-body italic text-[13px] leading-[1.5] text-[var(--ink-soft)] underline decoration-[var(--rule)] underline-offset-[3px] hover:text-[var(--accent)] transition-colors cursor-pointer"
        >
          Take the local reading.
        </button>
      ) : (
        <p className="font-body italic text-[13px] leading-[1.5] text-[var(--ink-faint)]">
          {state.kind === "pending"
            ? "Observations pending."
            : "No report from the wire."}
        </p>
      )}
    </div>
  );
}
