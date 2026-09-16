import { useMemo } from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import PageSheet, { page } from "../components/PageSheet";
import Masthead from "../components/Masthead";
import StaleNotice from "../components/StaleNotice";
import { ColumnItem, LeadStory } from "../components/Stories";
import { Fleuron, RuleTriple, SectionBanner } from "../components/Furniture";
import { useEdition } from "../lib/edition";
import { ink } from "../theme/tokens";
import { t } from "../theme/type";

/**
 * How deep the front page runs.
 *
 * The web app carries the lead, four secondary stories and an eighteen-story
 * strip below the fold — twenty-three of the edition's fifty-odd — and sends
 * the rest to the inner sheets. The same division holds here: a front page
 * that simply listed every story would be a feed with a nameplate on it, and
 * the desks exist to carry the depth. Every story is reachable from Sections.
 */
const FRONT_PAGE_DEPTH = 23;

export default function FrontPage() {
  const { edition, freshness, refreshing, refresh } = useEdition();

  const [lead, rest] = useMemo(() => {
    const stories = edition?.stories ?? [];
    return [stories[0], stories.slice(1, FRONT_PAGE_DEPTH)] as const;
  }, [edition]);

  if (!edition) {
    return (
      <PageSheet refreshing={refreshing} onRefresh={refresh}>
        <View style={[page.measure, styles.holdingWrap]}>
          <Text style={[t.headlineCaps, styles.holdingHead]}>
            {freshness.state === "loading" ? "Going to press" : "The press is unreachable"}
          </Text>
          <Fleuron />
          <Text style={[t.deck, styles.holdingBody]}>
            {freshness.state === "loading"
              ? "Setting the type."
              : `${freshness.state === "empty" ? freshness.reason : "No edition"} — and there is no edition saved on this device yet. Pull down to try again.`}
          </Text>
        </View>
      </PageSheet>
    );
  }

  return (
    <PageSheet refreshing={refreshing} onRefresh={refresh}>
      <StaleNotice freshness={freshness} />

      <View style={page.measure}>
        <Masthead
          date={edition.edition.date}
          edition={edition.edition.number}
          itemsIngested={edition.edition.itemsIngested}
          eventsPublished={edition.edition.eventsPublished}
        />

        {lead ? <LeadStory story={lead} /> : null}

        {rest.length > 0 ? (
          <View style={styles.wireWrap}>
            <SectionBanner label="More from the wire" />
            {rest.map((story, i) => (
              <View key={story.id} style={i > 0 ? styles.wireItem : undefined}>
                <ColumnItem story={story} />
              </View>
            ))}
          </View>
        ) : null}

        {/*
          The jump line. A broadsheet tells you where the rest of the paper is
          rather than pretending the front page is all of it.
        */}
        <Link href="/sections" asChild>
          <Pressable style={({ pressed }) => [styles.jump, pressed && styles.pressed]}>
            <Text style={[t.deck, styles.jumpText]}>
              Continued on the inner sheets {"—"} {edition.edition.eventsPublished} stories
              across {edition.sections.length} desks
            </Text>
            <Text style={[t.kicker, styles.jumpCue]}>Browse by desk {"→"}</Text>
          </Pressable>
        </Link>

        <View style={styles.colophon}>
          <RuleTriple />
          {/*
            The payload ships this notice precisely so a client cannot render
            the edition without it. It is the provenance of everything above.
          */}
          <Text style={[t.meta, styles.notice]}>{edition.notice}</Text>
          <Text style={[t.meta, styles.publishers]}>
            As filed by {edition.publishers.join(" · ")}
          </Text>
        </View>
      </View>
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  holdingWrap: {
    flex: 1,
    justifyContent: "center",
    gap: 20,
    paddingVertical: 80,
  },
  holdingHead: {
    fontSize: 30,
    lineHeight: 33,
    textAlign: "center",
  },
  holdingBody: {
    textAlign: "center",
  },
  wireWrap: {
    marginTop: 34,
  },
  wireItem: {
    borderTopWidth: 1,
    borderTopColor: ink.rule,
  },
  jump: {
    marginTop: 26,
    borderTopWidth: 3,
    borderBottomWidth: 1,
    borderColor: ink.ink,
    paddingVertical: 16,
    gap: 10,
  },
  jumpText: {
    textAlign: "center",
  },
  jumpCue: {
    color: ink.accent,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  colophon: {
    marginTop: 38,
    gap: 14,
  },
  notice: {
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  publishers: {
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 11.5,
    lineHeight: 17,
    color: ink.faint,
  },
});
