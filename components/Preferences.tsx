"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import { DEFAULTS, load, save, type Preferences } from "@/lib/preferences";
import { getDb } from "@/lib/firebase";
import { useAccount } from "./Account";

type Ctx = {
  prefs: Preferences;
  /**
   * False until storage has been read. Anything whose output depends on
   * preferences must wait for this — see the note on hydration below.
   */
  ready: boolean;
  /** True while signed in with a project configured, i.e. preferences sync. */
  syncing: boolean;
  update: (patch: Partial<Preferences>) => void;
  toggleTopic: (topic: string) => void;
  toggleCity: (city: string) => void;
  toggleClipping: (id: string) => void;
  markRead: (id: string) => void;
  reset: () => void;
};

const PreferencesContext = createContext<Ctx | null>(null);

/** Only these travel to the cloud; `onboarded` is about this device. */
const SYNCED: (keyof Preferences)[] = [
  "topics",
  "cities",
  "briefingTime",
  "clippings",
  "read",
];

function syncedPart(p: Preferences): Partial<Preferences> {
  return Object.fromEntries(SYNCED.map((k) => [k, p[k]])) as Partial<Preferences>;
}

const sameSynced = (a: Preferences, b: Preferences) =>
  JSON.stringify(syncedPart(a)) === JSON.stringify(syncedPart(b));

/**
 * Writes are coalesced: toggling five chips in a row is one write, not five.
 * Firestore's free tier allows 20k writes a day and there is no reason to
 * spend them on a reader tapping through a list.
 */
const WRITE_DEBOUNCE_MS = 900;

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { reader } = useAccount();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);

  /**
   * The last state known to match the cloud. Without this, a snapshot from
   * Firestore would set local state, which would schedule a write, which would
   * produce another snapshot — a loop that burns quota and never settles.
   */
  const cloudMirror = useRef<string | null>(null);
  const writeTimer = useRef<number | null>(null);

  /**
   * The server has no localStorage, so it renders with DEFAULTS. If the
   * client's first render used stored values instead, the two would disagree
   * and React would discard the server's HTML — a flash on every load. So the
   * first client render also uses DEFAULTS and the real values arrive a tick
   * later; `ready` is how a component knows which it is looking at.
   */
  useEffect(() => {
    setPrefs(load());
    setReady(true);
  }, []);

  // Signing in: adopt the account's preferences, or seed them from this device.
  useEffect(() => {
    const db = getDb();
    if (!reader || !db) {
      setSyncing(false);
      cloudMirror.current = null;
      return;
    }

    const ref = doc(db, "readers", reader.uid);
    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(ref);
        if (cancelled) return;

        if (snap.exists()) {
          // The account is the source of truth across devices.
          const incoming = { ...load(), ...(snap.data() as Partial<Preferences>) };
          cloudMirror.current = JSON.stringify(syncedPart(incoming));
          setPrefs(incoming);
          save(incoming);
        } else {
          // First device on this account seeds it.
          const local = load();
          await setDoc(ref, syncedPart(local), { merge: true });
          cloudMirror.current = JSON.stringify(syncedPart(local));
        }
        if (!cancelled) setSyncing(true);
      } catch {
        // Offline, or rules refused. Reading the paper must not depend on it.
        if (!cancelled) setSyncing(false);
      }
    })();

    // Changes made on another device.
    const stop = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        const incoming = { ...load(), ...(snap.data() as Partial<Preferences>) };
        const fingerprint = JSON.stringify(syncedPart(incoming));
        if (fingerprint === cloudMirror.current) return;
        cloudMirror.current = fingerprint;
        setPrefs(incoming);
        save(incoming);
      },
      () => setSyncing(false)
    );

    return () => {
      cancelled = true;
      stop();
    };
  }, [reader]);

  const commit = useCallback(
    (next: Preferences) => {
      setPrefs(next);
      // Never write during the first pass, or defaults would overwrite whatever
      // the reader had actually chosen.
      if (!ready) return;
      save(next);

      const db = getDb();
      if (!reader || !db) return;

      const fingerprint = JSON.stringify(syncedPart(next));
      if (fingerprint === cloudMirror.current) return;

      if (writeTimer.current) window.clearTimeout(writeTimer.current);
      writeTimer.current = window.setTimeout(() => {
        cloudMirror.current = fingerprint;
        setDoc(doc(db, "readers", reader.uid), syncedPart(next), {
          merge: true,
        }).catch(() => {
          // Let the next change retry; the device copy is already correct.
          cloudMirror.current = null;
        });
      }, WRITE_DEBOUNCE_MS);
    },
    [ready, reader]
  );

  useEffect(
    () => () => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
    },
    []
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
      syncing,
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
    [prefs, ready, syncing, update, toggleIn, commit]
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
