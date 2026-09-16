import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import PageSheet, { page } from "../../components/PageSheet";
import Folio from "../../components/Folio";
import { ColumnItem } from "../../components/Stories";
import { Fleuron, RuleDouble, RuleTriple } from "../../components/Furniture";
import { useEdition } from "../../lib/edition";
import { ink } from "../../theme/tokens";
import { t } from "../../theme/type";

/** One desk: every story filed to it, in the edition's own order. */
export default function SectionScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { edition, refreshing, refresh } = useEdition();

  // expo-router hands back the decoded segment, but a desk name arriving from
  // a hand-typed deep link may still be percent-encoded. Decoding a string
  // with a stray `%` throws, so the raw value is the fallback.
  const desk = useMemo(() => {
    if (typeof name !== "string") return "";
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }, [name]);

  const stories = useMemo(
    () => (edition?.stories ?? []).filter((s) => s.section === desk),
    [edition, desk]
  );

  return (
    <PageSheet refreshing={refreshing} onRefresh={refresh}>
      <Folio label={desk} back="The desks" />

      <View style={page.measure}>
        <View style={styles.head}>
          <RuleDouble />
          <Text style={[t.headlineCaps, styles.title]}>{desk}</Text>
          <Text style={[t.meta, styles.count]}>
            {stories.length === 1 ? "1 story" : `${stories.length} stories`}
          </Text>
          <Fleuron />
        </View>

        {stories.length > 0 ? (
          stories.map((story, i) => (
            <View key={story.id} style={i > 0 ? styles.item : undefined}>
              {/*
                The desk name is on the page already; repeating it above every
                headline would be a label the reader has to skip past.
              */}
              <ColumnItem story={story} showSection={false} />
            </View>
          ))
        ) : (
          <Text style={[t.deck, styles.empty]}>
            Nothing filed to this desk in the edition on this device.
          </Text>
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
    gap: 14,
    marginBottom: 6,
  },
  title: {
    fontSize: 34,
    lineHeight: 36,
    textAlign: "center",
  },
  count: {
    textAlign: "center",
  },
  item: {
    borderTopWidth: 1,
    borderTopColor: ink.rule,
  },
  empty: {
    paddingVertical: 40,
    textAlign: "center",
  },
  foot: {
    marginTop: 30,
  },
});
