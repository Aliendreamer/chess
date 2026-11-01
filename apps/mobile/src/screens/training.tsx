import { useCallback, useReducer, useState } from 'react'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { lineSans, uciSquares } from '@chess/core'
import { answerTraining, nextTraining, trainingSummary } from '@chess/local'
import {
  DEFAULT_SETTINGS,
  SET_SIZE,
  answerArrows,
  excludeIds,
  firstMoveLabel,
  initialSession,
  isTrainingMode,
  misses,
  previewLine,
  progressStrip,
  promptText,
  sanOf,
  scoreText,
  sessionReducer,
  setComplete,
  sourceText,
  useCommand,
  verdictText,
} from '@chess/view'
import type {
  Mark,
  PreviewState,
  TrainingFilters,
  TrainingItem,
  TrainingPhase,
  TrainingSettings,
  TrainingSummary,
  TrainingVerdict,
} from '@chess/view'
import { Board } from '@/components/board'
import { MobileLink } from '@/components/mobile-link'
import { ErrorLine } from '@/components/play'
import { Button, Chip } from '@/components/primitives'
import { Screen } from '@/components/screen'
import { appHref } from '@/lib/links'
import { useServices } from '@/lib/services-context'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT } from '@/theme/tokens'

/**
 * Training (training D5): your own mistakes, or critical moments from master games, one position at a time. The
 * session (what was seen, the answers) is `sessionReducer`'s; the database only keeps each position's schedule.
 */

const PHASES: ReadonlyArray<{ value: TrainingPhase; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'middlegame', label: 'Middlegame' },
  { value: 'endgame', label: 'Endgame' },
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The pool for the chosen mode, in words. */
function poolText(mode: TrainingSettings['mode'], summary: TrainingSummary): string {
  if (mode === 'games') {
    const g = summary.games
    return `${plural(g.positions, 'position')} from your games · ${g.learned} learned · ${g.due} due`
  }
  const l = summary.library
  return `${plural(l.pool, 'master position')} · ${l.seen} seen · ${l.learned} learned · ${l.due} due`
}

function emptyText(settings: TrainingSettings): string {
  return settings.mode === 'games'
    ? 'No mistakes to train yet. Finished games are reviewed by the engine on their own, and your mistakes and blunders join here.'
    : 'No master position matches these filters.'
}

export function TrainingScreen() {
  const { db } = useServices()
  const { colors } = useTheme()
  const { mode } = useLocalSearchParams<{ mode?: string }>()
  const [state, dispatch] = useReducer(sessionReducer, mode, (m?: string) =>
    initialSession(isTrainingMode(m) ? { ...DEFAULT_SETTINGS, mode: m } : DEFAULT_SETTINGS),
  )
  const [summary, setSummary] = useState<TrainingSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const answering = useCommand()
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const readSummary = useCallback(() => void trainingSummary(db).then(setSummary), [db])
  useFocusEffect(readSummary)

  async function fetchNext(settings: TrainingSettings, exclude: Array<string>) {
    setLoading(true)
    setLoadError(null)
    try {
      return await nextTraining(db, settings.mode, settings.filters, exclude)
    } catch {
      setLoadError('The next position could not be loaded. Try again.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function start() {
    setPreview(null)
    const first = await fetchNext(state.settings, [])
    if (first) dispatch({ type: 'started', next: first })
  }

  async function next() {
    if (loading) return
    setPreview(null)
    if (setComplete(state)) {
      dispatch({ type: 'finish' })
      readSummary()
      return
    }
    const answer = await fetchNext(state.settings, excludeIds(state))
    if (!answer) return
    dispatch({ type: 'next', next: answer })
    if (!answer.item) readSummary()
  }

  function finish() {
    setPreview(null)
    dispatch({ type: 'finish' })
    readSummary()
  }

  async function play(item: TrainingItem, uci: string) {
    dispatch({ type: 'played', uci })
    const verdict = await answering.run(() => answerTraining(db, item.mode, item.id, uci))
    dispatch(verdict ? { type: 'answered', verdict } : { type: 'refused' })
  }

  const revisited = state.revisit !== null ? state.answers[state.revisit] : undefined
  const set = (patch: Partial<TrainingSettings>) =>
    dispatch({ type: 'settings', settings: { ...state.settings, ...patch } })

  return (
    <Screen title="Training">
      {state.stage === 'start' ? (
        <>
          <Text style={[styles.small, { color: colors.fgSecondary }]}>
            Find the best move: in positions where you went wrong in your games, or at the critical
            moments of master games. A position you solve comes back later, each time after a longer
            gap.
          </Text>
          <View
            testID="training-start"
            style={[styles.card, { backgroundColor: colors.surfaceCard }]}
          >
            <View style={styles.wrap} accessibilityLabel="Mode">
              <Chip
                label="My games"
                selected={state.settings.mode === 'games'}
                onPress={() => set({ mode: 'games' })}
              />
              <Chip
                label="Master games"
                selected={state.settings.mode === 'library'}
                onPress={() => set({ mode: 'library' })}
              />
            </View>
            {state.settings.mode === 'library' ? (
              <MasterFilters
                filters={state.settings.filters}
                onChange={(filters) => set({ filters })}
              />
            ) : null}
            <View style={styles.wrap} accessibilityLabel="Length">
              <Chip
                label="10 positions"
                selected={state.settings.length === SET_SIZE}
                onPress={() => set({ length: SET_SIZE })}
              />
              <Chip
                label="Endless"
                selected={state.settings.length === 'endless'}
                onPress={() => set({ length: 'endless' })}
              />
            </View>
            {summary ? (
              <Text testID="training-pool" style={[styles.small, { color: colors.fgSecondary }]}>
                {poolText(state.settings.mode, summary)}
              </Text>
            ) : null}
            {state.empty ? (
              <Text
                testID="training-empty"
                accessibilityRole="alert"
                style={[styles.small, { color: colors.fgPrimary }]}
              >
                {emptyText(state.settings)}
              </Text>
            ) : null}
            {loadError ? <ErrorLine text={loadError} /> : null}
            <Button label="Start" kind="primary" disabled={loading} onPress={() => void start()} />
          </View>
        </>
      ) : null}
      {state.stage === 'play' && state.item ? (
        <>
          <Position
            key={state.item.id}
            item={state.item}
            enabled={state.played === null && !answering.busy}
            played={state.played}
            verdict={state.verdict}
            preview={preview}
            onPlay={(uci) => void play(state.item!, uci)}
          />
          <View testID="training" style={styles.panel}>
            <Text testID="training-prompt" style={[styles.prompt, { color: colors.fgPrimary }]}>
              {promptText(state.item)}
            </Text>
            <View style={styles.between}>
              {progressStrip(state) ? (
                <ProgressStrip marks={progressStrip(state)!} />
              ) : (
                <Text testID="training-score" style={[styles.score, { color: colors.fgPrimary }]}>
                  {scoreText(state.answers)}
                </Text>
              )}
              <Text style={[styles.xs, { color: colors.fgMuted }]}>
                {[
                  state.item.box === null ? 'New position' : `Box ${state.item.box}`,
                  state.pool === null ? null : `${state.pool} in the pool`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            {state.verdict && state.played ? (
              <>
                <Verdict
                  item={state.item}
                  answer={state.played}
                  verdict={state.verdict}
                  preview={preview}
                  onPreview={setPreview}
                />
                <View style={styles.wrap}>
                  <Button
                    label="Next"
                    kind="primary"
                    disabled={loading}
                    onPress={() => void next()}
                  />
                  {progressStrip(state) ? null : (
                    <Button label="Finish" disabled={loading} onPress={finish} />
                  )}
                </View>
              </>
            ) : (
              <Text style={[styles.small, { color: colors.fgSecondary }]}>
                {state.played ? 'Checking your move…' : 'Play your move on the board.'}
              </Text>
            )}
            {answering.error || loadError ? (
              <ErrorLine text={(answering.error ?? loadError)!} />
            ) : null}
          </View>
        </>
      ) : null}
      {state.stage === 'summary' ? (
        <>
          <View
            testID="training-summary"
            style={[styles.card, { backgroundColor: colors.surfaceCard }]}
          >
            <Text testID="training-final-score" style={[styles.final, { color: colors.fgPrimary }]}>
              {scoreText(state.answers)}
            </Text>
            {misses(state.answers).length === 0 ? (
              <Text style={[styles.small, { color: colors.fgSecondary }]}>No misses.</Text>
            ) : (
              <View accessibilityLabel="Misses" style={styles.misses}>
                {misses(state.answers).map((i) => (
                  <Chip
                    key={state.answers[i]!.item.id}
                    label={sourceText(state.answers[i]!.verdict.source)}
                    selected={state.revisit === i}
                    onPress={() => {
                      setPreview(null)
                      dispatch({ type: 'revisit', index: i })
                    }}
                  />
                ))}
              </View>
            )}
            <View style={styles.wrap}>
              <Button
                label={state.settings.length === SET_SIZE ? 'Another 10' : 'Again'}
                kind="primary"
                onPress={() => void start()}
              />
              <Button
                label="Change settings"
                onPress={() => dispatch({ type: 'settings', settings: state.settings })}
              />
            </View>
            {loadError ? <ErrorLine text={loadError} /> : null}
          </View>
          {revisited ? (
            <>
              <Position
                key={revisited.item.id}
                item={revisited.item}
                enabled={false}
                played={revisited.uci}
                verdict={revisited.verdict}
                preview={preview}
                onPlay={() => undefined}
              />
              <Verdict
                item={revisited.item}
                answer={revisited.uci}
                verdict={revisited.verdict}
                preview={preview}
                onPreview={setPreview}
              />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.small, { color: colors.fgSecondary }]}>{label}</Text>
      {children}
    </View>
  )
}

function yearOf(value: string): number | undefined {
  const n = Number(value)
  return value.trim() && Number.isInteger(n) ? n : undefined
}

/** Opening, player, years and phase for master games. */
function MasterFilters({
  filters,
  onChange,
}: {
  filters: TrainingFilters
  onChange: (filters: TrainingFilters) => void
}) {
  const { colors } = useTheme()
  const set = (patch: Partial<TrainingFilters>) => onChange({ ...filters, ...patch })
  const input = [
    styles.input,
    {
      color: colors.fgPrimary,
      backgroundColor: colors.surfaceInset,
      borderColor: colors.lineDefault,
    },
  ]
  const phase = filters.phase ?? 'any'
  return (
    <View testID="training-filters" style={styles.filters}>
      <Field label="Opening">
        <TextInput
          accessibilityLabel="Opening"
          value={filters.opening ?? ''}
          onChangeText={(opening) => set({ opening })}
          placeholder="B90 or Najdorf"
          placeholderTextColor={colors.fgMuted}
          style={input}
        />
      </Field>
      <Field label="Player">
        <TextInput
          accessibilityLabel="Player"
          value={filters.player ?? ''}
          onChangeText={(player) => set({ player })}
          placeholder="Carlsen"
          placeholderTextColor={colors.fgMuted}
          style={input}
        />
      </Field>
      <View style={styles.years}>
        <Field label="From year">
          <TextInput
            accessibilityLabel="From year"
            keyboardType="number-pad"
            value={filters.from === undefined ? '' : String(filters.from)}
            onChangeText={(v) => set({ from: yearOf(v) })}
            placeholder="1900"
            placeholderTextColor={colors.fgMuted}
            style={input}
          />
        </Field>
        <Field label="To year">
          <TextInput
            accessibilityLabel="To year"
            keyboardType="number-pad"
            value={filters.to === undefined ? '' : String(filters.to)}
            onChangeText={(v) => set({ to: yearOf(v) })}
            placeholder="2026"
            placeholderTextColor={colors.fgMuted}
            style={input}
          />
        </Field>
      </View>
      <View style={styles.wrap} accessibilityLabel="Phase">
        {PHASES.map((p) => (
          <Chip
            key={p.value}
            label={p.label}
            selected={phase === p.value}
            onPress={() => set({ phase: p.value })}
          />
        ))}
      </View>
    </View>
  )
}

/** One position on the board: answerable until a move is sent; then the move, the arrows and the line tapped. */
function Position({
  item,
  enabled,
  played,
  verdict,
  preview,
  onPlay,
}: {
  item: TrainingItem
  enabled: boolean
  played: string | null
  verdict: TrainingVerdict | null
  preview: PreviewState | null
  onPlay: (uci: string) => void
}) {
  const { width } = useWindowDimensions()
  const shown =
    preview && verdict
      ? previewLine(item.fen, lineSans(item.fen, verdict.bestLine), preview.upTo)
      : null
  return (
    <View testID="training-board" style={styles.bleed}>
      <Board
        fen={shown?.fen ?? item.fen}
        orientation={item.sideToMove}
        size={width}
        side={item.sideToMove}
        lastMove={shown?.lastMove ?? uciSquares(played)}
        arrows={verdict && !shown ? answerArrows(verdict) : []}
        {...(enabled && !shown ? { onMove: onPlay } : {})}
      />
    </View>
  )
}

/** ✓ ✗ · for a set of 10. */
function ProgressStrip({ marks }: { marks: ReadonlyArray<Mark> }) {
  const { colors } = useTheme()
  const right = marks.filter((m) => m === '✓').length
  const wrong = marks.filter((m) => m === '✗').length
  return (
    <Text
      testID="training-progress"
      accessible
      accessibilityLabel={`${right} right, ${wrong} wrong, ${marks.length - right - wrong} to go`}
      style={styles.score}
    >
      {marks.map((m, i) => (
        <Text
          key={i}
          style={{
            color: m === '✓' ? colors.statusWin : m === '✗' ? colors.statusLoss : colors.fgMuted,
          }}
        >
          {m}
        </Text>
      ))}
    </Text>
  )
}

/**
 * The verdict on an answer: right or wrong in words, the engine's line — each move a button that plays the line up
 * to it on the board — and where the position comes from.
 */
function Verdict({
  item,
  answer,
  verdict,
  preview,
  onPreview,
}: {
  item: TrainingItem
  answer: string
  verdict: TrainingVerdict
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
}) {
  const { colors } = useTheme()
  const line = lineSans(item.fen, verdict.bestLine)
  const showing = preview?.upTo ?? 0
  const s = verdict.source
  return (
    <View testID="training-verdict" accessibilityLiveRegion="polite" style={styles.verdict}>
      <Text style={[styles.small, { color: colors.fgSecondary }]}>
        {`You played ${firstMoveLabel(item.fen, sanOf(item.fen, answer))}.`}
      </Text>
      <Text
        testID="training-verdict-text"
        style={[
          styles.verdictText,
          { color: verdict.correct ? colors.statusWin : colors.statusLoss },
        ]}
      >
        {verdictText(item, verdict)}
      </Text>
      {line.length > 0 ? (
        <View style={styles.wrapCentre} accessibilityLabel="Engine line">
          <Text style={[styles.small, { color: colors.fgSecondary }]}>Engine:</Text>
          {line.map((san, i) => (
            <Pressable
              key={`${i}-${san}`}
              accessibilityRole="button"
              accessibilityState={{ selected: showing === i + 1 }}
              onPress={() => onPreview({ ply: 0, upTo: i + 1 })}
              style={[
                styles.lineMove,
                {
                  borderColor: showing === i + 1 ? colors.lineAccent : colors.lineDefault,
                  backgroundColor:
                    showing === i + 1 ? colors.surfaceAccentSoft : colors.surfaceRaised,
                },
              ]}
            >
              <Text style={[styles.mono, { color: colors.fgPrimary }]}>
                {i === 0 ? firstMoveLabel(item.fen, san) : san}
              </Text>
            </Pressable>
          ))}
          {showing > 0 ? (
            <Button label="Back to the position" kind="ghost" onPress={() => onPreview(null)} />
          ) : null}
        </View>
      ) : null}
      <View testID="training-source" style={styles.wrapCentre}>
        <Text style={[styles.xs, { color: colors.fgMuted }]}>{`${sourceText(s)} · `}</Text>
        <MobileLink
          to={
            s.kind === 'library'
              ? appHref('/analysis', { library: s.libraryGameId, ply: s.ply })
              : `/games/${encodeURIComponent(s.gameId)}`
          }
        >
          the game
        </MobileLink>
      </View>
      {verdict.learned ? (
        <Text style={[styles.xs, { color: colors.fgSecondary }]}>Learned.</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 12, borderRadius: RADIUS.card },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrapCentre: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  filters: { gap: 10 },
  field: { gap: 4, flex: 1 },
  years: { flexDirection: 'row', gap: 10 },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.sans,
    fontSize: TEXT.base.size,
  },
  bleed: { marginHorizontal: -16 },
  panel: { gap: 10 },
  prompt: { fontFamily: FONTS.display, fontSize: TEXT['display-xs'].size },
  score: { fontFamily: FONTS.mono, fontSize: TEXT.base.size, letterSpacing: 2 },
  final: { fontFamily: FONTS.display, fontSize: TEXT['display-sm'].size },
  misses: { gap: 6 },
  verdict: { gap: 6 },
  verdictText: {
    fontFamily: FONTS.sansMedium,
    fontSize: TEXT.sm.size,
    lineHeight: TEXT.sm.lineHeight,
  },
  lineMove: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  xs: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
  mono: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
})
