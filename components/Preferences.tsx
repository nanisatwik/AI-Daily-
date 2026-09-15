"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULTS, load, save, type Preferences } from "@/lib/preferences";

type Ctx = {
  prefs: Preferences;
  /**
   * False until localStorage has been read. Anything whose output depends on
   * preferences must wait for this — see the note on hydration below.
   */
  ready: boolean;
  update: (patch: Partial<Preferences>) => void;
  toggleTopic: (topic: string) => void;
  toggleCity: (city: string) => void;
  toggleClipping: (id: string) => void;
  markRead: (id: string) => void;
  reset: () => void;
};

const PreferencesContext = createContext<Ctx | null>(null);

/**
 * The server has no localStorage, so it renders with DEFAULTS. If the client's
 * very first render used the *stored* values instead, the two would disagree
 * and React would throw away the server's HTML — a visible flash on every
 * load, worse on a slow phone, which is exactly where it would be noticed.
 *
 * So the first client render also uses DEFAULTS, matching the server exactly,
 * and the stored values arrive one tick later in an effect. `ready` is how a
 * component knows which of the two it is looking at.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(load());
    setReady(true);
  }, []);

  // Never write during that first pass, or defaults would overwrite whatever
  // the reader had actually chosen.
  const commit = useCallback(
    (next: Preferences) => {
      setPrefs(next);
      if (ready) save(next);
    },
    [ready]
  );

  const update = useCallback(
    (patch: Partial<Preferences>) => commit({ ...prefs, ...patch }),
    [commit, prefs]
  );

  const toggleIn = useCallback(
    (key: "topics" | "cities" | "clippings", value: string) => {
      const list = prefs[key];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      commit({ ...prefs, [key]: next });
    },
    [commit, prefs]
  );

  const value = useMemo<Ctx>(
    () => ({
      prefs,
      ready,
      update,
      toggleTopic: (t) => toggleIn("topics", t),
      toggleCity: (c) => toggleIn("cities", c),
      toggleClipping: (id) => toggleIn("clippings", id),
      markRead: (id) => {
        if (prefs.read.includes(id)) return;
        commit({ ...prefs, read: [...prefs.read, id] });
      },
      reset: () => commit({ ...DEFAULTS, onboarded: true }),
    }),
    [prefs, ready, update, toggleIn, commit]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): Ctx {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used inside PreferencesProvider");
  }
  return ctx;
}
