import { StyleSheet, Text, View } from "react-native";
import { ink, paper } from "../theme/tokens";
import { t } from "../theme/type";
import { describeAge } from "../lib/time";
import type { Freshness } from "../lib/edition";

/**
 * "You are holding an old paper, and here is how old."
 *
 * The requirement is to show this plainly, so it is set as a stop-press slug
 * across the top of the page rather than a toast that fades or a subtle grey
 * line. A reader who has been on the Underground for forty minutes should be
 * able to tell at a glance whether the front page in front of them is today's.
 *
 * It renders nothing at all when the edition came from the press this session.
 * A permanent "you are online" badge would be noise, and the absence of the
 * slug is itself the signal.
 */
export default function StaleNotice({ freshness }: { freshness: Freshness }) {
  if (freshness.state !== "stale") return null;

  // `fetchedAt` of 0 means the cache predates the field, or was written by a
  // build that failed to stamp it. Better to say nothing about the age than to
  // claim the paper was fetched in 1970.
  const age = freshness.fetchedAt > 0 ? describeAge(freshness.fetchedAt) : null;

  return (
    <View style={styles.slug}>
      <Text style={[t.kicker, styles.label]}>From the archive</Text>
      <Text style={[t.meta, styles.detail]}>
        {age
          ? `This edition was last fetched ${age}. Pull down to reach the press.`
          : "This edition came from the device. Pull down to reach the press."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slug: {
    backgroundColor: paper.deep,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: ink.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  label: {
    color: ink.accent,
  },
  detail: {
    // Sentence case, not the letterspaced caps the rest of the furniture uses:
    // this is the one place on the page that has to be read as a sentence
    // rather than scanned as a label.
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 12.5,
    lineHeight: 18,
    color: ink.soft,
  },
});
