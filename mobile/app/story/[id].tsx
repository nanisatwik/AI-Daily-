import { useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import PageSheet, { page } from "../../components/PageSheet";
import Folio from "../../components/Folio";
import { Prose } from "../../components/Stories";
import { Byline, Fleuron, Hairline, KickerRule, RuleBand, RuleTriple, SectionBanner } from "../../components/Furniture";
import { useEdition } from "../../lib/edition";
import { relativeTime } from "../../lib/time";
import type { Brief, Source } from "../../lib/api";
import { ink, paper } from "../../theme/tokens";
import { leadSize, t } from "../../theme/type";

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { edition, storyById, refreshing, refresh } = useEdition();
  const story = typeof id === "string" ? storyById(id) : undefined;

  /**
   * Out to the publisher.
   *
   * An in-app browser rather than handing off to Safari or Chrome: the reader
   * is following a citation, and they should come back to the paper with one
   * tap rather than having to find the app again. The chrome is tinted to the
   * paper so the seam is as small as the platform allows.
   *
   * `Linking.openURL` is the fallback because the custom-tab implementation can
   * fail on an Android device with every browser disabled, and in that case the
   * system can still usually resolve the intent.
   */
  const open = useCallback(async (url: string) => {
    if (!url) return;
    try {
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: paper.deep,
        controlsColor: ink.accent,
        enableBarCollapsing: true,
      });
    } catch {
      await Linking.openURL(url).catch(() => {
        // Nothing on the device can open a link. There is no useful recovery
        // and no dialog worth interrupting the reader with.
      });
    }
  }, []);

  if (!story) {
    return (
      <PageSheet refreshing={refreshing} onRefresh={refresh}>
        <Folio label="Not in this edition" />
        <View style={[page.measure, styles.missingWrap]}>
          <Text style={[t.headlineCaps, styles.missingHead]}>No such story</Text>
          <Fleuron />
          <Text style={[t.deck, styles.missingBody]}>
            {edition
              ? "This story is not in the edition on this device. It may have been in an earlier one."
              : "The edition has not been loaded yet."}
          </Text>
        </View>
      </PageSheet>
    );
  }

  const size = leadSize(story.headline);
  // The publisher that filed first in the cluster is the one the story leads
  // out to; `sources` arrives newest-first from the pipeline.
  const primary = story.sources[0];

  return (
    <PageSheet refreshing={refreshing} onRefresh={refresh}>
      <Folio label={story.section} />

      <View style={page.measure}>
        <View style={styles.head}>
          <KickerRule label={story.section} />

          <Text style={[t.headlineCaps, size, styles.headline]}>{story.headline}</Text>

          <RuleBand style={styles.band} />

          <Text style={[t.deck, styles.deck]}>{story.deck}</Text>

          <View style={styles.bylineWrap}>
            <Byline sourceCount={story.sourceCount} publishedAt={story.publishedAt} />
          </View>
        </View>

        <View style={styles.body}>
          <Prose paragraphs={story.body} leadIn />
        </View>

        {story.brief ? <BriefPanel brief={story.brief} /> : null}

        {/*
          Who reported it. This is the substance behind the tally marks, and the
          reason the marks can be trusted: every stroke is an outlet named here.
        */}
        {story.sources.length > 0 ? (
          <View style={styles.sourcesWrap}>
            <SectionBanner label="As reported by" />
            {story.sources.map((source, i) => (
              <SourceRow
                key={`${source.name}-${i}`}
                source={source}
                onPress={() => void open(source.url)}
              />
            ))}
          </View>
        ) : null}

        {primary?.url ? (
          <Pressable
            onPress={() => void open(primary.url)}
            style={({ pressed }) => [styles.readOriginal, pressed && styles.pressed]}
          >
            <Text style={t.kicker}>Read the original {"→"}</Text>
          </Pressable>
        ) : null}

        <View style={styles.colophon}>
          <RuleTriple />
          <Text style={[t.meta, styles.notice]}>
            {edition?.notice ??
              "Headlines, decks and sources are as filed by the publishers named."}
          </Text>
        </View>
      </View>
    </PageSheet>
  );
}

function SourceRow({ source, onPress }: { source: Source; onPress: () => void }) {
  const filed = relativeTime(source.publishedAt);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View style={styles.sourceRow}>
        <View style={styles.sourceNameWrap}>
          <Text style={[t.headline, styles.sourceName]}>{source.name}</Text>
          {filed ? <Text style={t.meta}>{filed}</Text> : null}
        </View>
        <Text style={[t.kicker, styles.sourceCue]}>{"↗"}</Text>
      </View>
      <Hairline />
    </Pressable>
  );
}

/**
 * The brief, with its provenance printed on it.
 *
 * Every story in the edition as published carries `brief: null`, so this
 * renders on no story today — it is here because the field is part of the
 * payload and the web app can fill it, and a client that dropped it silently
 * would start omitting content the moment enrichment runs.
 *
 * The label is not optional and is not a caption. The codebase's position, and
 * the payload's own notice, is that generated text may not be presented as
 * reporting; so the panel says which of the two kinds it is before the reader
 * reaches a word of it.
 */
function BriefPanel({ brief }: { brief: Brief }) {
  const isMachine = brief.provenance === "machine-written";

  return (
    <View style={styles.brief}>
      <View style={styles.briefStamp}>
        <Text style={[t.kicker, styles.briefStampText]}>
          {isMachine ? "Machine-written" : "Compiled from sources"}
        </Text>
      </View>

      <Text style={[t.meta, styles.briefProvenance]}>
        {isMachine
          ? "Model output. Not reporting, and not checked by an editor."
          : "Publishers' own sentences, selected automatically. Not original reporting."}
      </Text>

      {brief.tldr ? <Text style={[t.prose, styles.briefTldr]}>{brief.tldr}</Text> : null}

      {brief.keyPoints.map((point, i) => (
        <View key={i} style={styles.briefPoint}>
          <Text style={[t.prose, styles.briefBullet]}>{"—"}</Text>
          <Text style={[t.prose, styles.briefPointText]}>{point}</Text>
        </View>
      ))}

      {brief.whyItMatters ? (
        <View style={styles.briefField}>
          <Text style={[t.kicker, styles.briefFieldLabel]}>Why it matters</Text>
          <Text style={t.prose}>{brief.whyItMatters}</Text>
        </View>
      ) : null}

      {brief.whoIsAffected ? (
        <View style={styles.briefField}>
          <Text style={[t.kicker, styles.briefFieldLabel]}>Who is affected</Text>
          <Text style={t.prose}>{brief.whoIsAffected}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    paddingTop: 22,
  },
  headline: {
    marginTop: 14,
  },
  band: {
    marginVertical: 18,
  },
  deck: {
    fontSize: 18,
    lineHeight: 26,
  },
  bylineWrap: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: ink.rule,
  },
  body: {
    marginTop: 22,
  },
  sourcesWrap: {
    marginTop: 36,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    gap: 12,
  },
  sourceNameWrap: {
    flexShrink: 1,
    gap: 3,
  },
  sourceName: {
    fontSize: 17,
  },
  sourceCue: {
    color: ink.accent,
  },
  readOriginal: {
    marginTop: 26,
    alignSelf: "center",
    borderWidth: 2,
    borderColor: ink.ink,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  pressed: {
    opacity: 0.6,
  },
  brief: {
    marginTop: 30,
    borderWidth: 1,
    borderColor: ink.rule,
    backgroundColor: paper.deep,
    padding: 16,
    gap: 12,
  },
  briefStamp: {
    alignSelf: "flex-start",
    backgroundColor: ink.accent,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  briefStampText: {
    color: paper.base,
  },
  briefProvenance: {
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 12,
    lineHeight: 17,
  },
  briefTldr: {
    fontSize: 16,
  },
  briefPoint: {
    flexDirection: "row",
    gap: 9,
  },
  briefBullet: {
    color: ink.accent,
  },
  briefPointText: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 24,
  },
  briefField: {
    gap: 5,
  },
  briefFieldLabel: {
    color: ink.faint,
  },
  colophon: {
    marginTop: 38,
    gap: 12,
  },
  notice: {
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  missingWrap: {
    paddingVertical: 80,
    gap: 20,
  },
  missingHead: {
    fontSize: 30,
    lineHeight: 33,
    textAlign: "center",
  },
  missingBody: {
    textAlign: "center",
  },
});
