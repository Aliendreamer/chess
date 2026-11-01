import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { FEEDS, currentEvents, latestNews } from '@chess/local'
import { ageText, hostOf, timeControlLabel } from '@chess/view'
import type { ChessEvent, NewsItem } from '@chess/core'
import { ExternalLink } from '@/components/external-link'
import { Chip, Section } from '@/components/primitives'
import { Screen } from '@/components/screen'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, TEXT } from '@/theme/tokens'

const SHOWN = 60

/**
 * Chess news and the tournaments being played (chess-news): headlines kept from the sources, each opening the article
 * in the browser, and the events now, each opening on lichess. Read again each time the tab shows.
 */
export function NewsScreen() {
  const { db } = useServices()
  const { colors } = useTheme()
  const [source, setSource] = useState<string | null>(null)
  const [read, setRead] = useState<{ items: Array<NewsItem>; events: Array<ChessEvent> } | null>(
    null,
  )

  useFocusEffect(
    useCallback(() => {
      let live = true
      void Promise.all([latestNews(db, SHOWN, source ?? undefined), currentEvents(db, 5)]).then(
        ([items, events]) => live && setRead({ items, events }),
      )
      return () => {
        live = false
      }
    }, [db, source]),
  )

  const now = Date.now()
  return (
    <Screen title="News">
      <Text style={[styles.small, { color: colors.fgSecondary }]}>
        Headlines and links only, fetched every hour while the app is open and kept for 90 days;
        every article opens in your browser.
      </Text>
      <View style={styles.wrap} accessibilityLabel="Source">
        <Chip label="All" selected={source === null} onPress={() => setSource(null)} />
        {FEEDS.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            selected={source === s.id}
            onPress={() => setSource(s.id)}
          />
        ))}
      </View>
      {read && source === null && read.events.length > 0 ? (
        <Section title="Events now">
          <View style={styles.list}>
            {read.events.map((e) => {
              const url = e.roundUrl ?? e.url
              return (
                <View key={e.id} style={[styles.item, { borderTopColor: colors.lineDivider }]}>
                  <View style={styles.eventHead}>
                    {e.ongoing ? (
                      <Text
                        style={[
                          styles.live,
                          { color: colors.surfacePage, backgroundColor: colors.statusLoss },
                        ]}
                      >
                        LIVE
                      </Text>
                    ) : null}
                    <ExternalLink
                      url={url}
                      label={`${e.name} (opens ${hostOf(url)})`}
                      style={styles.title}
                    >
                      {e.name}
                    </ExternalLink>
                  </View>
                  <Text style={[styles.xs, { color: colors.fgSecondary }]}>
                    {[e.location, timeControlLabel(e.fideTc), e.roundName]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              )
            })}
          </View>
        </Section>
      ) : null}
      {read === null ? null : read.items.length === 0 ? (
        <Text testID="news-empty" style={[styles.small, { color: colors.fgMuted }]}>
          Nothing yet: the news is fetched once the phone is online.
        </Text>
      ) : (
        <View testID="news" style={styles.list}>
          {read.items.map((n) => (
            <View key={n.id} style={[styles.item, { borderTopColor: colors.lineDivider }]}>
              <ExternalLink
                url={n.url}
                label={`${n.title} (opens ${hostOf(n.url)})`}
                style={[styles.title, { color: colors.fgPrimary }]}
              >
                {n.title}
              </ExternalLink>
              <Text style={[styles.xs, { color: colors.fgSecondary }]}>
                {`${n.sourceName} · ${ageText(n.publishedAt, now)}`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { paddingHorizontal: 2 },
  item: { paddingVertical: 10, gap: 2, borderTopWidth: StyleSheet.hairlineWidth },
  eventHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  live: {
    fontFamily: FONTS.sansSemiBold,
    fontSize: TEXT['2xs'].size,
    paddingHorizontal: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  title: { fontSize: TEXT.base.size, lineHeight: TEXT.base.lineHeight },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  xs: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
})
