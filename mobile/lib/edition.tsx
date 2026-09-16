import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchEdition, type Edition, type Story } from "./api";
import { readCache, writeCache } from "./cache";

/**
 * One edition, held for the whole app.
 *
 * The paper is a single 57KB document containing every story, so there is
 * nothing to page and nothing to fetch per screen: it is loaded once and every
 * screen reads from it. A story screen looks its story up by id rather than
 * requesting it, which is also what makes deep links work offline.
 *
 * Load order is cache first, always. Showing last night's paper in 20ms and
 * quietly replacing it when today's arrives is strictly better than a spinner
 * over a blank sheet, and it is the behaviour that makes the app usable with no
 * signal at all.
 */

export type Freshness =
  | { state: "loading" }
  /** Straight from the press this session. */
  | { state: "fresh" }
  /** Read from disk; the network was not reached. `fetchedAt` is device time. */
  | { state: "stale"; fetchedAt: number; reason: string }
  /** Nothing cached and nothing reachable. */
  | { state: "empty"; reason: string };

type EditionContext = {
  edition: Edition | null;
  freshness: Freshness;
  refreshing: boolean;
  refresh: () => Promise<void>;
  storyById: (id: string) => Story | undefined;
};

const Context = createContext<EditionContext | null>(null);

export function EditionProvider({ children }: { children: React.ReactNode }) {
  const [edition, setEdition] = useState<Edition | null>(null);
  const [freshness, setFreshness] = useState<Freshness>({ state: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  /*
   * Guards against a refresh that outlives the screen that asked for it.
   *
   * Pull to refresh on a slow connection, then background the app: the promise
   * settles after unmount and React warns about setting state on a dead tree.
   * It also stops two overlapping refreshes from racing to write the cache,
   * where the loser's older payload could land last.
   */
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (isRefresh: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (isRefresh) setRefreshing(true);

    try {
      // On a refresh the reader is already looking at a page; going to disk
      // first would be pointless work, since that page came from there.
      const cached = isRefresh ? null : await readCache();
      if (cached && mounted.current) {
        setEdition(cached.edition);
        setFreshness({
          state: "stale",
          fetchedAt: cached.fetchedAt,
          reason: "Reaching the press",
        });
      }

      try {
        const wire = await fetchEdition();
        if (!mounted.current) return;
        setEdition(wire);
        setFreshness({ state: "fresh" });
        // Deliberately not awaited before the paper is on screen: a slow disk
        // write should not delay the type appearing.
        void writeCache(wire);
      } catch (error) {
        if (!mounted.current) return;
        const reason = error instanceof Error ? error.message : "Could not reach the press";

        // The fetch failed. If anything is on the page, keep it and say how old
        // it is; the alternative is replacing a readable paper with an error.
        const fallback = cached ?? (isRefresh ? await readCache() : null);
        if (fallback) {
          setEdition(fallback.edition);
          setFreshness({ state: "stale", fetchedAt: fallback.fetchedAt, reason });
        } else {
          setFreshness({ state: "empty", reason });
        }
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  /*
   * An index by id, rebuilt only when the edition changes.
   *
   * Fifty-four stories would scan fast enough, but every story screen and
   * every section screen does this lookup on each render, and a map costs one
   * pass a day.
   */
  const index = useMemo(() => {
    const map = new Map<string, Story>();
    for (const story of edition?.stories ?? []) map.set(story.id, story);
    return map;
  }, [edition]);

  const value = useMemo<EditionContext>(
    () => ({
      edition,
      freshness,
      refreshing,
      refresh,
      storyById: (id: string) => index.get(id),
    }),
    [edition, freshness, refreshing, refresh, index]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEdition(): EditionContext {
  const context = useContext(Context);
  if (!context) throw new Error("useEdition must be used inside EditionProvider");
  return context;
}
