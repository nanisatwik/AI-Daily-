import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ink, paper } from "../theme/tokens";
import { t } from "../theme/type";
import { relativeTime } from "../lib/time";
import { TallyMarks } from "./TallyMarks";

/**
 * The rules, banners and bylines a page is assembled from.
 *
 * All of it is borders on empty views. A 1925 press had rules, a second colour
 * and nothing else — no shadows, no rounded corners, no fills that are not
 * solid ink — so the furniture costs the compositor nothing beyond the views
 * themselves, and the brief's ban on heavy blur and large shadows costs this
 * design nothing at all. There was never going to be a shadow in it.
 */

/** `.rule-double`: heavy over light. Sits above a nameplate. */
export function RuleDouble() {
  return (
    <View style={styles.ruleDoubleWrap}>
      <View style={styles.ruleHeavy} />
      <View style={styles.ruleGapSmall} />
      <View style={styles.ruleHair} />
    </View>
  );
}

/** `.rule-triple`: light over heavy. Closes a page. */
export function RuleTriple() {
  return (
    <View style={styles.ruleDoubleWrap}>
      <View style={styles.ruleHair} />
      <View style={styles.ruleGapSmall} />
      <View style={styles.ruleHeavy} />
    </View>
  );
}

/** The 4px band the web app sets between a headline and its deck. */
export function RuleBand({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.bandWrap, style]}>
      <View style={styles.ruleHair} />
      <View style={{ height: 2 }} />
      <View style={styles.ruleHair} />
    </View>
  );
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.hairline, style]} />;
}

/**
 * A desk name in reversed-out type, with a rule running off to the margin.
 * The web app's `SectionBanner`.
 */
export function SectionBanner({ label }: { label: string }) {
  return (
    <View style={styles.bannerRow}>
      <View style={styles.bannerSlug}>
        <Text style={[t.kicker, styles.bannerText]}>{label}</Text>
      </View>
      <View style={styles.bannerRule} />
    </View>
  );
}

/** A kicker with a hairline running to the margin: opens a story. */
export function KickerRule({ label, tone = "accent" }: { label: string; tone?: "accent" | "faint" }) {
  return (
    <View style={styles.kickerRow}>
      <Text style={[t.kicker, { color: tone === "accent" ? ink.accent : ink.faint }]}>
        {label}
      </Text>
      <View style={styles.kickerHair} />
    </View>
  );
}

/**
 * Tally marks, then the count in words, then how long ago it was filed.
 *
 * The count is spelled out beside the marks rather than left to them alone.
 * Tallies are exact but slow to read past ten, and the number is the whole
 * point of printing them.
 */
export function Byline({
  sourceCount,
  publishedAt,
  align = "left",
}: {
  sourceCount: number;
  publishedAt: string;
  align?: "left" | "center";
}) {
  const filed = relativeTime(publishedAt);
  return (
    <View style={[styles.bylineRow, align === "center" && styles.bylineCentre]}>
      <TallyMarks count={sourceCount} />
      <Text style={t.meta}>
        {sourceCount === 1 ? "1 source" : `${sourceCount} sources`}
        {filed ? ` · ${filed}` : ""}
      </Text>
    </View>
  );
}

/** A centred fleuron between blocks, in place of the web app's drawn rule. */
export function Fleuron() {
  return (
    <View style={styles.fleuronRow}>
      <View style={styles.fleuronRule} />
      <Text style={styles.fleuronMark}>{"❦"}</Text>
      <View style={styles.fleuronRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  ruleDoubleWrap: {
    width: "100%",
  },
  ruleHeavy: {
    height: 3,
    backgroundColor: ink.ink,
  },
  // A printed rule, not a UI divider: a full logical pixel, so it lands as 2 or
  // 3 device pixels and reads as ink. `StyleSheet.hairlineWidth` would give the
  // thinnest line the screen can draw, which looks like a scratch at this size.
  ruleHair: {
    height: 1,
    backgroundColor: ink.ink,
  },
  ruleGapSmall: {
    height: 2,
  },
  bandWrap: {
    width: "100%",
  },
  hairline: {
    height: 1,
    backgroundColor: ink.rule,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  bannerSlug: {
    backgroundColor: ink.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  bannerText: {
    color: paper.base,
  },
  bannerRule: {
    flex: 1,
    height: 3,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: ink.ink,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kickerHair: {
    flex: 1,
    height: 1,
    backgroundColor: ink.rule,
  },
  bylineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  bylineCentre: {
    justifyContent: "center",
  },
  fleuronRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fleuronRule: {
    flex: 1,
    height: 1,
    backgroundColor: ink.rule,
  },
  fleuronMark: {
    color: ink.rule,
    fontSize: 15,
  },
});
