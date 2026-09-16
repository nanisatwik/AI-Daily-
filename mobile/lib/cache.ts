import AsyncStorage from "@react-native-async-storage/async-storage";
import { coerceEdition, type Edition } from "./api";

/**
 * Last night's paper, kept on the device.
 *
 * A newspaper you have already picked up should still be readable in a tunnel,
 * so the edition is written to disk whenever one arrives and read back before
 * the network is consulted at all. AsyncStorage is the right store for it: one
 * document, around 57KB, replaced wholesale once a day. A database would be a
 * schema to migrate for no benefit.
 *
 * The key carries a version. When the payload's shape changes, bumping it
 * abandons the old document rather than trying to read it — `coerceEdition`
 * would mostly cope, but an abandoned 57KB entry is cheaper than a subtle
 * mis-parse, and AsyncStorage has no migration story worth writing.
 */
const KEY = "ai-daily.edition.v1";

export type Cached = {
  edition: Edition;
  /** When we received it, by the device's clock. Drives the staleness notice. */
  fetchedAt: number;
};

export async function readCache(): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;

    // Run the wire's own coercion over it. This was written by an older build
    // of the app, which is as untrustworthy a source as the network.
    const edition = coerceEdition(o.edition);
    if (!edition) return null;

    const fetchedAt = typeof o.fetchedAt === "number" ? o.fetchedAt : 0;
    return { edition, fetchedAt };
  } catch {
    // Corrupt JSON, a half-written entry from a kill during write, or a device
    // with no storage left. Returning null sends the caller to the network,
    // which is exactly what it would do on a fresh install.
    return null;
  }
}

export async function writeCache(edition: Edition): Promise<void> {
  try {
    const payload: Cached = { edition, fetchedAt: Date.now() };
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // A failed write costs the reader offline access and nothing else. It must
    // never interrupt reading the edition that is already on screen.
  }
}
