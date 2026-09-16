import { StyleSheet, Text, View } from "react-native";
import PageSheet, { page } from "../components/PageSheet";
import Folio from "../components/Folio";
import { Fleuron } from "../components/Furniture";
import { t } from "../theme/type";

/**
 * A page that was never set.
 *
 * Reachable only from a malformed deep link, but without it expo-router shows
 * its own unstyled fallback screen, which is a white page with a blue link on
 * it — the single most jarring thing that could appear inside this app.
 */
export default function NotFound() {
  return (
    <PageSheet>
      <Folio label="No such page" />
      <View style={[page.measure, styles.wrap]}>
        <Text style={[t.headlineCaps, styles.head]}>Page not printed</Text>
        <Fleuron />
        <Text style={[t.deck, styles.body]}>
          There is no such page in this edition.
        </Text>
      </View>
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 80,
    gap: 20,
  },
  head: {
    fontSize: 32,
    lineHeight: 34,
    textAlign: "center",
  },
  body: {
    textAlign: "center",
  },
});
