import { forwardRef } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GUTTER, ink, paper } from "../theme/tokens";
import PaperTexture from "./PaperTexture";

/**
 * A sheet of paper with something printed on it.
 *
 * Every screen is one of these: paper ground, a scrolling column of type, and
 * the grain laid over the top. The grain is a sibling of the scroll view
 * rather than a child, so it stays still while the type moves underneath —
 * the texture belongs to the sheet the reader is holding, not to the copy.
 * It sets `pointerEvents: "none"`, or it would swallow every tap on the page.
 *
 * Scrolling is vertical and ordinary, deliberately. The brief rules out
 * imitating the web app's page fold — that geometry is tuned in `lib/peel.ts`
 * over many sessions and a bad copy would be worse than none — and asks that
 * any horizontal paging be declared as a plain paged ScrollView. This does not
 * page horizontally at all. A phone column is a column: you scroll it, the way
 * you would read a single broadsheet page held close.
 */
type Props = {
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

const PageSheet = forwardRef<ScrollView, Props>(function PageSheet(
  { children, refreshing = false, onRefresh },
  ref
) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.sheet}>
      <ScrollView
        ref={ref}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top,
            // The foot of the page clears the home indicator, plus enough
            // paper that the last rule is not flush against the screen edge.
            paddingBottom: insets.bottom + 40,
          },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              // The spinner is furniture too: ink on paper, not the platform's
              // blue on white.
              tintColor={ink.soft}
              colors={[ink.soft]}
              progressBackgroundColor={paper.deep}
            />
          ) : undefined
        }
        // iOS only: the overscroll area above the masthead shows through, and
        // the default is white, which flashes as bright paper-coloured content
        // is pulled down.
        style={styles.scroll}
      >
        {children}
      </ScrollView>

      <PaperTexture />
    </View>
  );
});

export default PageSheet;

export const page = StyleSheet.create({
  /** The measure: everything set in type sits inside this. */
  measure: {
    paddingHorizontal: GUTTER,
  },
});

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: paper.base,
  },
  scroll: {
    backgroundColor: paper.base,
  },
  content: {
    flexGrow: 1,
  },
});
