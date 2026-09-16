import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ink, paper, type } from "../theme/tokens";
import { t } from "../theme/type";
import { Fleuron, RuleDouble } from "./Furniture";
import { formatEditionDate } from "../lib/time";

/**
 * The nameplate.
 *
 * The web app fits "The AI Daily" to the page with a `FitText` component that
 * measures the rendered text and scales it. That needs a layout pass, a
 * measurement, and a re-render, and it exists there because a browser window
 * can be any width at all. A phone is 320 to 440 points and nothing else, so
 * the size is interpolated from the width directly — one calculation, no
 * measurement, no second paint, and the blackletter still fills the measure on
 * a small iPhone and a large Android alike.
 */
export default function Masthead({
  date,
  edition,
  itemsIngested,
  eventsPublished,
}: {
  date: string;
  edition: number;
  itemsIngested: number;
  eventsPublished: number;
}) {
  const { width } = useWindowDimensions();

  // UnifrakturMaguntia is a narrow face, so it takes a larger size than a roman
  // would at the same measure. Tuned so the nameplate sits just inside the
  // gutters at both ends of the range rather than being clamped at one.
  const nameplate = Math.round(Math.min(Math.max((width - 40) * 0.145, 38), 60));

  return (
    <View style={styles.wrap}>
      <RuleDouble />

      <View style={styles.plateBlock}>
        <Text
          style={[styles.nameplate, { fontSize: nameplate, lineHeight: nameplate * 1.16 }]}
          // The nameplate is the one piece of type that must never reflow or
          // shrink under the OS font setting: it is the paper's identity, and
          // at 200% it would push the entire front page below the fold.
          allowFontScaling={false}
        >
          The AI Daily
        </Text>

        <View style={styles.fleuronWrap}>
          <Fleuron />
        </View>
      </View>

      <View style={styles.heavyRule} />

      {/*
        The dateline. The web app runs four items across one row and hides two
        of them below the `sm` breakpoint; a phone is always below it, so the
        row wraps instead and every figure stays on the page.
      */}
      <View style={styles.datelineRow}>
        <Text style={t.meta}>No. {edition}</Text>
        <Text style={[t.meta, styles.datelineDate]}>{formatEditionDate(date)}</Text>
        <Text style={t.meta}>Two cent edition</Text>
      </View>

      <View style={styles.tallyRow}>
        <Text style={t.meta}>
          {itemsIngested.toLocaleString()} items {"→"} {eventsPublished} stories
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
  },
  plateBlock: {
    paddingVertical: 20,
  },
  nameplate: {
    fontFamily: type.mast,
    color: ink.ink,
    textAlign: "center",
    // Blackletter capitals are tall and tightly fitted; a touch of tracking
    // stops the ascenders of adjacent letters from reading as one mass.
    letterSpacing: 0.5,
  },
  fleuronWrap: {
    marginTop: 16,
    paddingHorizontal: 30,
  },
  heavyRule: {
    height: 3,
    backgroundColor: ink.ink,
  },
  datelineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: ink.ink,
  },
  datelineDate: {
    color: ink.soft,
  },
  tallyRow: {
    paddingVertical: 7,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: ink.rule,
    backgroundColor: paper.deep,
  },
});
