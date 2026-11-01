import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { LibraryProgress } from '@/lib/services'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, TEXT } from '@/theme/tokens'

/** "Preparing the library … n %" while the bundled library loads on the first start (mobile-app D9); else nothing. */
export function LibraryProgressLine({ progress }: { progress: LibraryProgress }) {
  const { colors } = useTheme()
  const share = useSyncExternalStore(progress.subscribe, progress.current)
  if (share === null) return null
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      style={[styles.progress, { backgroundColor: colors.surfaceCard }]}
    >
      <Text style={[styles.progressText, { color: colors.fgMuted }]}>
        {`Preparing the library … ${Math.round(share * 100)} %`}
      </Text>
      <View style={[styles.track, { backgroundColor: colors.lineDivider }]}>
        <View
          style={[styles.fill, { backgroundColor: colors.accentFill, width: `${share * 100}%` }]}
        />
      </View>
    </View>
  )
}

/**
 * A tab's page: the page colour edge to edge, the content below the status bar (the tab bar keeps the bottom inset),
 * the status bar's text in the theme's contrast, and the library's progress line on top while it loads.
 */
export function Screen({
  title,
  children,
  scroll = true,
}: {
  title?: string
  children: ReactNode
  /** False for a page that scrolls itself (a list). */
  scroll?: boolean
}) {
  const { colors, preferences } = useTheme()
  const { libraryProgress } = useServices()
  const body = (
    <>
      {title ? (
        <Text accessibilityRole="header" style={[styles.title, { color: colors.fgPrimary }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </>
  )
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.page, { backgroundColor: colors.surfacePage }]}
    >
      <StatusBar barStyle={preferences.siteTheme === 'dark' ? 'light-content' : 'dark-content'} />
      <LibraryProgressLine progress={libraryProgress} />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content}>{body}</ScrollView>
      ) : (
        <View style={[styles.content, styles.fill1]}>{body}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  fill1: { flex: 1 },
  title: {
    fontFamily: FONTS.display,
    fontSize: TEXT['display-md'].size,
    lineHeight: TEXT['display-md'].lineHeight,
  },
  progress: { paddingHorizontal: 16, paddingVertical: 6, gap: 4 },
  progressText: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
  track: { height: 2, borderRadius: 1, overflow: 'hidden' },
  fill: { height: 2 },
})
