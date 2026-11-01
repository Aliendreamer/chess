import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { importLibrary, libraryCount, searchLibrary } from '@chess/local'
import { useCommand } from '@chess/view'
import type { LibraryGameItem } from '@chess/core'
import type { LibraryImportReport, LibraryQuery } from '@chess/local'
import { ErrorLine } from '@/components/play'
import { Button, TOUCH } from '@/components/primitives'
import { Screen } from '@/components/screen'
import { appHref } from '@/lib/links'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT } from '@/theme/tokens'

const RESULT: Record<string, string> = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½', '*': '*' }

const text = (value: string | Array<string> | undefined) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
const year = (value: string | undefined) =>
  value !== undefined && /^\d{4}$/.test(value.trim()) ? Number(value.trim()) : undefined

/**
 * Your game library (game-library): the bundled games and the PGN collections you import, searched by player, event
 * and years; every game opens on the analysis board, where "In the library" is the explorer.
 */
export function LibraryScreen() {
  const services = useServices()
  const { db } = services
  const { colors } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{
    player?: string
    event?: string
    from?: string
    to?: string
  }>()
  const query: LibraryQuery = {
    ...(text(params.player) ? { player: text(params.player)! } : {}),
    ...(text(params.event) ? { event: text(params.event)! } : {}),
    ...(year(params.from) !== undefined ? { from: year(params.from)! } : {}),
    ...(year(params.to) !== undefined ? { to: year(params.to)! } : {}),
  }
  const key = JSON.stringify(query)
  const [found, setFound] = useState<{ games: Array<LibraryGameItem>; total: number } | null>(null)
  const [generation, setGeneration] = useState(0)
  const [player, setPlayer] = useState(query.player ?? '')
  const [event, setEvent] = useState(query.event ?? '')
  const [from, setFrom] = useState(query.from?.toString() ?? '')
  const [to, setTo] = useState(query.to?.toString() ?? '')
  const importing = useCommand()
  const [report, setReport] = useState<LibraryImportReport | null>(null)

  const load = useCallback(
    async () => ({
      games: await searchLibrary(db, JSON.parse(key) as LibraryQuery),
      total: await libraryCount(db),
    }),
    [db, key],
  )
  useEffect(() => {
    let live = true
    void load().then((f) => live && setFound(f))
    return () => {
      live = false
    }
  }, [load, generation])

  async function importFile() {
    const result = await importing.run(async () => {
      const pgn = await services.files.importText()
      return { ok: true as const, view: pgn === null ? null : await importLibrary(db, pgn, null) }
    })
    if (result) {
      setReport(result)
      setGeneration((g) => g + 1)
    }
  }

  function search() {
    router.setParams({
      player: player.trim() || undefined,
      event: event.trim() || undefined,
      from: year(from)?.toString(),
      to: year(to)?.toString(),
    })
  }

  const field = [
    styles.input,
    {
      color: colors.fgPrimary,
      backgroundColor: colors.surfaceInset,
      borderColor: colors.lineDefault,
    },
  ]
  const input = (label: string, value: string, set: (v: string) => void, numeric = false) => (
    <View style={numeric ? styles.yearField : styles.field}>
      <Text style={[styles.xs, { color: colors.fgSecondary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={set}
        onSubmitEditing={search}
        returnKeyType="search"
        autoCorrect={false}
        {...(numeric ? { keyboardType: 'number-pad' as const } : {})}
        style={field}
      />
    </View>
  )

  return (
    <Screen title="Library">
      {found ? (
        <Text style={[styles.small, { color: colors.fgSecondary }]}>{`${found.total} games`}</Text>
      ) : null}
      <Button
        label="Import a PGN file"
        disabled={importing.busy}
        onPress={() => void importFile()}
      />
      {importing.error ? <ErrorLine text={importing.error} /> : null}
      {report ? (
        <Text testID="library-report" style={[styles.small, { color: colors.fgSecondary }]}>
          {`Imported ${report.imported}, ${report.duplicates} already in the library, ${report.refused.length} not read.`}
          {report.refused
            .slice(0, 5)
            .map((r) => ` Game ${r.index}: ${r.error}`)
            .join('')}
        </Text>
      ) : null}
      <View
        accessibilityLabel="Search the library"
        style={[styles.card, { backgroundColor: colors.surfaceCard }]}
      >
        {input('Player', player, setPlayer)}
        {input('Event', event, setEvent)}
        <View style={styles.years}>
          {input('From', from, setFrom, true)}
          {input('To', to, setTo, true)}
        </View>
        <Button label="Search" kind="primary" onPress={search} />
      </View>
      {found === null ? null : found.games.length > 0 ? (
        <View testID="library-games">
          {found.games.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              accessibilityLabel={`${g.white} – ${g.black}, ${g.year ?? 'no year'}, ${RESULT[g.result] ?? g.result}`}
              onPress={() => router.push(appHref('/analyse', { library: g.id }) as Href)}
              style={({ pressed }) => [
                styles.game,
                { borderBottomColor: colors.lineDivider },
                pressed && { backgroundColor: colors.surfaceHover },
              ]}
            >
              <View style={styles.gameHead}>
                <Text
                  numberOfLines={1}
                  style={[styles.body, styles.grow, { color: colors.fgPrimary }]}
                >
                  {`${g.white} – ${g.black}`}
                </Text>
                <Text style={[styles.mono, { color: colors.fgPrimary }]}>
                  {RESULT[g.result] ?? g.result}
                </Text>
              </View>
              <Text style={[styles.xs, { color: colors.fgSecondary }]}>
                {[
                  g.year?.toString() ?? '—',
                  g.event,
                  [g.eco, g.opening].filter(Boolean).join(' ') || null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {g.worldChampionship ? (
                <Text style={[styles.xs, { color: colors.fgAccent }]}>World Championship</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.small, { color: colors.fgMuted }]}>
          {found.total === 0
            ? 'Your library is empty: import a PGN file of games.'
            : 'No game matches.'}
        </Text>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: { padding: 12, gap: 10, borderRadius: RADIUS.card },
  field: { gap: 4 },
  yearField: { gap: 4, flex: 1 },
  years: { flexDirection: 'row', gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.sans,
    fontSize: TEXT.base.size,
  },
  game: {
    minHeight: TOUCH + 8,
    paddingVertical: 10,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gameHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  grow: { flex: 1 },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  xs: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
  body: { fontFamily: FONTS.sans, fontSize: TEXT.base.size, lineHeight: TEXT.base.lineHeight },
  mono: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
})
