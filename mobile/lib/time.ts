/**
 * Dates, set the way the paper sets them.
 *
 * Formatted by hand rather than through `toLocaleDateString`. Two reasons, and
 * the second is the one that matters:
 *
 *  - Hermes ships Intl, but the data backing it differs between iOS and
 *    Android, and a dateline that renders "16 September" on one platform and
 *    "September 16" on the other is a visible inconsistency in the masthead.
 *
 *  - `new Date("2026-09-16")` is parsed as UTC midnight. Rendered through a
 *    local formatter anywhere west of Greenwich that is the 15th, so the paper
 *    would print yesterday's date for every reader in the Americas. The web app
 *    sidesteps this by appending `T00:00:00`; here the string is simply split
 *    and never turned into an instant at all.
 */

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-09-16" becomes "Wednesday, 16 September 2026". */
export function formatEditionDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // getUTCDay against a UTC-constructed date: the weekday of the printed date,
  // not of whatever instant that date happens to be in the reader's zone.
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const monthName = MONTHS[month - 1];
  if (!weekday || !monthName) return date;

  return `${weekday}, ${day} ${monthName} ${year}`;
}

/**
 * How long ago a story was filed.
 *
 * The web app measures this from the moment the edition was generated, which is
 * the correct reading for a page printed at that moment. A phone is different:
 * it may be showing an edition cached two days ago, and "4 hours ago" would
 * then be a lie by two days. So the device clock is the reference, and the
 * answer ages properly while the paper sits in your pocket.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";

  const hours = Math.round((now - then) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;

  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

/**
 * The age of the cached edition, for the notice that tells the reader they are
 * holding an old paper. Phrased as a duration rather than a timestamp: what
 * matters is how out of date it is, not when it was fetched.
 */
export function describeAge(fetchedAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - fetchedAt) / 60_000));
  if (minutes < 2) return "moments ago";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
