import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ink, paper } from "../theme/tokens";
import { t } from "../theme/type";

/**
 * The folio line: what page you are on, and the way back.
 *
 * The native stack header is switched off across the whole app. An iOS
 * large-title bar or an Android app bar over a 1925 broadsheet destroys the
 * illusion in a way no amount of careful type below it can recover, and the
 * one thing it provides — a back affordance — is three lines to draw in the
 * paper's own furniture.
 *
 * Which means the back gesture has to be honoured explicitly. Both platforms'
 * system gestures still work because the stack is a real native stack; this is
 * the visible control for readers who do not use them.
 */
export default function Folio({ label, back = "The front page" }: { label: string; back?: string }) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => {
          // A story reached from a notification or a deep link has no history
          // behind it, and `back()` on an empty stack does nothing at all —
          // leaving the reader tapping a control that appears to be broken.
          if (router.canGoBack()) router.back();
          else router.replace("/");
        }}
        hitSlop={12}
        style={({ pressed }) => (pressed ? styles.pressed : undefined)}
      >
        <Text style={[t.kicker, styles.back]}>{"←"} {back}</Text>
      </Pressable>

      <Text style={[t.meta, styles.label]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ink.ink,
    backgroundColor: paper.deep,
    paddingHorizontal: 12,
  },
  back: {
    color: ink.accent,
  },
  label: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.55,
  },
});
