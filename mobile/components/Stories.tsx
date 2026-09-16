import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Story } from "../lib/api";
import { ink, type } from "../theme/tokens";
import { leadSize, t } from "../theme/type";
import { Byline, Hairline, KickerRule, RuleBand } from "./Furniture";

/**
 * The opening words of a lead, set as a lead-in.
 *
 * This is where the web app puts a drop cap, and a drop cap is what was wanted.
 * It is not available: `::first-letter` has no equivalent in React Native, and
 * the usual imitation — a large glyph in a nested `<Text>` — collides with a
 * real platform bug. Android clips a nested glyph whose size exceeds the
 * container's `lineHeight`, so the initial loses its head; dropping the
 * `lineHeight` to avoid that leaves the first paragraph with different leading
 * from every paragraph after it, which is more obviously wrong than no initial.
 *
 * So the lead opens the way a great many broadsheets actually opened one, with
 * the first few words in letterspaced capitals. It is period-correct, it needs
 * no measurement, and at the body's own size nothing can clip.
 */
function LeadIn({ text }: { text: string }) {
  const words = text.split(" ");
  // Four words is enough to read as a deliberate opening. Any fewer looks like
  // a styling accident; any more starts to compete with the headline.
  const openingWordCount = Math.min(4, Math.max(1, words.length - 1));
  const opening = words.slice(0, openingWordCount).join(" ");
  const rest = words.slice(openingWordCount).join(" ");

  return (
    <Text style={t.prose}>
      <Text style={styles.leadIn}>{opening}</Text>
      {rest ? ` ${rest}` : ""}
    </Text>
  );
}

/**
 * Body copy.
 *
 * Single column. The web app sets this in two columns on anything wider than
 * `sm`, which is right for a broadsheet page and wrong for a 375pt phone: two
 * columns at that measure is about twenty characters a line, and CSS multi-col
 * has no equivalent here in any case. One column of Caslon at 16.5pt is the
 * honest phone translation of a broadsheet column.
 */
export function Prose({ paragraphs, leadIn = false }: { paragraphs: string[]; leadIn?: boolean }) {
  return (
    <View>
      {paragraphs.map((para, i) => (
        <View key={i} style={i > 0 ? styles.paraGap : undefined}>
          {leadIn && i === 0 ? <LeadIn text={para} /> : <Text style={t.prose}>{para}</Text>}
        </View>
      ))}
    </View>
  );
}

/** Wraps a headline so the whole block is the target, as on the web. */
function StoryLink({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Link href={`/story/${id}`} asChild>
      {/*
        Only the headline navigates, which matches the web app, where
        `data-story-link` sits on the headline alone and the deck below it is
        not part of the target.
      */}
      <Pressable style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
        {children}
      </Pressable>
    </Link>
  );
}

/**
 * The lead: the story the ranking put first, given the whole measure.
 *
 * "It must read as a newspaper page, not a card feed" is the requirement, and
 * this is where that is won or lost. No container, no border, no elevation —
 * the lead is distinguished by the size of its type and the rules around it,
 * which is the only way a printed page could distinguish anything.
 */
export function LeadStory({ story }: { story: Story }) {
  const size = leadSize(story.headline);

  return (
    <View style={styles.leadWrap}>
      <KickerRule label={story.section} />

      <StoryLink id={story.id}>
        <Text style={[t.headlineCaps, size, styles.leadHeadline]}>{story.headline}</Text>
      </StoryLink>

      <RuleBand style={styles.leadBand} />

      <Text style={[t.deck, styles.leadDeck]}>{story.deck}</Text>

      <View style={styles.leadBylineWrap}>
        <Byline
          sourceCount={story.sourceCount}
          publishedAt={story.publishedAt}
          align="center"
        />
      </View>

      <View style={styles.leadProse}>
        <Prose paragraphs={story.body} leadIn />
      </View>

      <StoryLink id={story.id}>
        <View style={styles.readButton}>
          <Text style={t.kicker}>Read the full column</Text>
        </View>
      </StoryLink>
    </View>
  );
}

/**
 * A story below the lead: headline, deck, and the count.
 *
 * Separated from its neighbours by a hairline rather than by a gap, so the
 * column reads as continuous type broken by rules — a page — instead of a
 * stack of tiles.
 */
export function ColumnItem({ story, showSection = true }: { story: Story; showSection?: boolean }) {
  return (
    <View style={styles.itemWrap}>
      {showSection ? <KickerRule label={story.section} tone="faint" /> : null}

      <StoryLink id={story.id}>
        <Text style={[t.headline, styles.itemHeadline]}>{story.headline}</Text>
      </StoryLink>

      <Text style={[t.prose, styles.itemDeck]} numberOfLines={4}>
        {story.deck}
      </Text>

      <View style={styles.itemByline}>
        <Hairline style={styles.itemHair} />
        <Byline sourceCount={story.sourceCount} publishedAt={story.publishedAt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    // The web app tints a headline on hover. A phone has no hover, so the same
    // acknowledgement happens on press.
    opacity: 0.62,
  },
  leadWrap: {
    paddingTop: 22,
  },
  leadHeadline: {
    marginTop: 14,
  },
  leadBand: {
    marginVertical: 18,
  },
  leadDeck: {
    fontSize: 18,
    lineHeight: 26,
    textAlign: "center",
    // 48ch on the web. A phone column is narrower than that, so the constraint
    // never binds and only the centring is worth carrying across.
    paddingHorizontal: 4,
  },
  leadBylineWrap: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ink.rule,
  },
  leadProse: {
    marginTop: 20,
  },
  leadIn: {
    fontFamily: type.bodyBold,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: ink.ink,
  },
  paraGap: {
    marginTop: 15,
  },
  readButton: {
    marginTop: 22,
    alignSelf: "center",
    borderWidth: 2,
    borderColor: ink.ink,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  itemWrap: {
    paddingVertical: 18,
  },
  itemHeadline: {
    fontSize: 21,
    lineHeight: 25,
    marginTop: 10,
  },
  itemDeck: {
    marginTop: 8,
    fontSize: 15.5,
    lineHeight: 23,
    color: ink.soft,
  },
  itemByline: {
    marginTop: 12,
  },
  itemHair: {
    marginBottom: 10,
  },
});
