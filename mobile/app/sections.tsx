import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PageSheet, { page } from "../components/PageSheet";
import Folio from "../components/Folio";
import StaleNotice from "../components/StaleNotice";
import { Fleuron, Hairline, RuleDouble, RuleTriple } from "../components/Furniture";
import { TallyMarks } from "../components/TallyMarks";
import { useEdition } from "../lib/edition";
import { ink } from "../theme/tokens";
import { t } from "../theme/type";

/**
 * The index of desks.
 *
 * Counts come from the payload's own `sections` array rather than being
 * tallied here, because that is the index the web app builds from the whole
 * edition and the two must agree — a desk that says eighteen and then lists
 * fifteen undermines the one number on the page the reader can check.
 */
export default function SectionsScreen() {
  const { edition, freshness, refreshing, refresh } = useEdition();

  return (
    <PageSheet refreshing={refreshing} onRefresh={refresh}>
      <Folio label="The desks" />
      <StaleNotice freshness={freshness} />

      <View style={page.measure}>
        <View style={styles.head}>
          <RuleDouble />
          <Text style={[t.headlineCaps, styles.title]}>The Desks</Text>
          <Fleuron />
        </View>

        {edition ? (
          <View>
            {edition.sections.map((desk) => (
              <Link key={desk.section} href={`/section/${encodeURIComponent(desk.section)}`} asChild>
                <Pressable style={({ pressed }) => pressed && styles.pressed}>
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={[t.headline, styles.deskName]}>{desk.section}</Text>
                      <Text style={t.meta}>
                        {desk.count === 1 ? "1 story" : `${desk.count} stories`}
                      </Text>
                    </View>
                    {/*
                      The marks count stories on the desk here, not corroborating
                      outlets. Same notation, different unit — which is how a
                      tally works, and the label beside it says which.
                    */}
                    <TallyMarks count={desk.count} color={ink.faint} height={15} />
                  </View>
                  <Hairline />
                </Pressable>
              </Link>
            ))}
          </View>
        ) : (
          <Text style={[t.deck, styles.waiting]}>No edition on this device yet.</Text>
        )}

        <View style={styles.foot}>
          <RuleTriple />
        </View>
      </View>
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingTop: 20,
    gap: 16,
    marginBottom: 10,
  },
  title: {
    fontSize: 36,
    lineHeight: 38,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    gap: 14,
  },
  rowText: {
    flexShrink: 1,
    gap: 4,
  },
  deskName: {
    fontSize: 21,
  },
  pressed: {
    opacity: 0.6,
  },
  waiting: {
    paddingVertical: 40,
    textAlign: "center",
  },
  foot: {
    marginTop: 30,
  },
});
