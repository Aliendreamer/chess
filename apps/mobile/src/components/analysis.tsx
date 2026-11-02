import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { THINKS, chances, lineMoves, moveNumber, playMove, scoreText } from '@chess/core'
import type { Evaluation, EvaluationLine, LibraryPosition, StudyMove, TreePath } from '@chess/core'
import type { Analysis } from '@chess/view'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT } from '@/theme/tokens'
import { Chip, TOUCH } from './primitives'

/** The score at the end of the side ahead: `0.4`, `2.1`, `M3` (no sign: the end says whose). */
export function barScore(line: Pick<EvaluationLine, 'cp' | 'mate'>): string {
  if (line.mate !== null) return `M${Math.abs(line.mate)}`
  return (Math.abs(line.cp ?? 0) / 100).toFixed(1)
}

/**
 * The evaluation as a bar across the top of the board (mobile-app D5: the board keeps the full width): White's winning
 * chances as its white part, White's end on White's side as the board is turned, the score at the end of the side
 * ahead. Named for a screen reader by the score.
 */
export function EvalBar({
  evaluation,
  orientation,
}: {
  evaluation: Evaluation | null
  orientation: 'white' | 'black'
}) {
  const { colors } = useTheme()
  const best = evaluation?.lines[0]
  const white = best ? (chances(best) + 1) / 2 : 0.5
  const whiteAhead = white >= 0.5
  // White's end is on the left when the board shows White from below.
  const whiteLeft = orientation === 'white'
  const scoreLeft = whiteAhead === whiteLeft
  return (
    <View
      testID="eval-bar"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Evaluation ${best ? scoreText(best) : 'pending'}`}
      style={[
        styles.bar,
        { backgroundColor: colors.fgMuted, flexDirection: whiteLeft ? 'row' : 'row-reverse' },
      ]}
    >
      <View
        style={{ width: `${Math.round(white * 1000) / 10}%`, backgroundColor: colors.fgPrimary }}
      />
      {best ? (
        <Text
          style={[
            styles.barScore,
            scoreLeft ? { left: 6 } : { right: 6 },
            { color: whiteAhead ? colors.surfacePage : colors.fgPrimary },
          ]}
        >
          {barScore(best)}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * The engine's best lines: each one's score and moves in SAN, or that the engine is on it. With `onPlay` a line is a
 * button: the analysis board plays it into the tree, a game its first move.
 */
export function EngineLines({
  fen,
  evaluation,
  error,
  onPlay,
}: {
  fen: string
  evaluation: Evaluation | null
  error?: string | null
  onPlay?: (moves: Array<StudyMove>) => void
}) {
  const { colors } = useTheme()
  return (
    <View testID="engine-lines" style={styles.lines}>
      {evaluation && evaluation.lines.length > 0 ? (
        evaluation.lines.map((line, i) => {
          const moves = lineMoves(fen, line.pv)
          const sans = moves.map((m) => m.san).join(' ')
          const body = (
            <>
              <Text style={[styles.score, { color: colors.fgPrimary }]}>{scoreText(line)}</Text>
              <Text numberOfLines={1} style={[styles.pv, { color: colors.fgBody }]}>
                {sans}
              </Text>
            </>
          )
          return onPlay && moves.length > 0 ? (
            <Pressable
              key={i}
              testID="engine-line"
              accessibilityRole="button"
              accessibilityLabel={`Play the line ${sans}, ${scoreText(line)}`}
              onPress={() => onPlay(moves)}
              style={({ pressed }) => [
                styles.line,
                pressed && { backgroundColor: colors.surfaceHover },
              ]}
            >
              {body}
            </Pressable>
          ) : (
            <View key={i} testID="engine-line" style={styles.line}>
              {body}
            </View>
          )
        })
      ) : (
        <Text style={[styles.small, { color: error ? colors.statusLoss : colors.fgMuted }]}>
          {error ?? 'The engine is thinking…'}
        </Text>
      )}
    </View>
  )
}

/** The engine's think time for the position on the board. */
export function ThinkChips({ analysis }: { analysis: Analysis }) {
  return (
    <View style={styles.wrap} accessibilityLabel="Think time">
      {THINKS.map((t) => (
        <Chip
          key={t.value}
          label={t.label}
          selected={analysis.think === t.value}
          onPress={() => analysis.setThink(t.value)}
        />
      ))}
    </View>
  )
}

/** Which of the engine's views a board shows; the engine is asked only while one of them is on. */
export interface EvaluationShown {
  bar: boolean
  line: boolean
}

/** Switches for the evaluation bar and the best moves, with a note (what they cost) while one is on. */
export function EvaluationSwitches({
  shown,
  onChange,
  note,
}: {
  shown: EvaluationShown
  onChange: (shown: EvaluationShown) => void
  note?: string
}) {
  const { colors } = useTheme()
  const toggle = (key: keyof EvaluationShown, label: string) => (
    <View style={styles.switchRow}>
      <Text style={[styles.body, { color: colors.fgBody }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={shown[key]}
        onValueChange={(on) => onChange({ ...shown, [key]: on })}
        trackColor={{ true: colors.accentFill, false: colors.lineStrong }}
      />
    </View>
  )
  return (
    <View>
      {toggle('bar', 'Evaluation bar')}
      {toggle('line', 'Best moves')}
      {note && (shown.bar || shown.line) ? (
        <Text testID="evaluation-warning" style={[styles.xs, { color: colors.fgMuted }]}>
          {note}
        </Text>
      ) : null}
    </View>
  )
}

/** First, previous, next and last move, then whatever the screen adds (flip). */
export function MoveNav({
  onFirst,
  onPrevious,
  onNext,
  onLast,
  children,
}: {
  onFirst: () => void
  onPrevious: () => void
  onNext: () => void
  onLast: () => void
  children?: ReactNode
}) {
  return (
    <View style={styles.nav}>
      <NavButton label="First move" glyph="⏮" onPress={onFirst} />
      <NavButton label="Previous move" glyph="‹" onPress={onPrevious} />
      <NavButton label="Next move" glyph="›" onPress={onNext} />
      <NavButton label="Last move" glyph="⏭" onPress={onLast} />
      {children}
    </View>
  )
}

export function NavButton({
  label,
  glyph,
  onPress,
}: {
  label: string
  glyph: string
  onPress: () => void
}) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        { backgroundColor: pressed ? colors.surfaceHover : colors.surfaceRaised },
      ]}
    >
      <Text style={[styles.navGlyph, { color: colors.fgPrimary }]}>{glyph}</Text>
    </Pressable>
  )
}

/**
 * A study's moves (studies D7): the main line, each variation in parentheses after the move it replaces, numbered as
 * the PGN is; every move a button, the current one marked, and its score once the engine has seen the position.
 */
export function MoveTree({
  tree,
  startFen,
  current,
  onSelect,
  scoreOf = () => null,
}: {
  tree: ReadonlyArray<StudyMove>
  startFen: string
  current: TreePath
  onSelect: (path: TreePath) => void
  scoreOf?: (fen: string) => string | null
}) {
  const { colors } = useTheme()
  const key = current.join('.')
  const move = (m: StudyMove, path: TreePath, number: string | null) => {
    const active = key === path.join('.')
    const score = scoreOf(m.fen)
    return (
      <Fragment key={path.join('.')}>
        {number ? <Text style={[styles.number, { color: colors.fgMuted }]}>{number}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.san}
          accessibilityState={{ selected: active }}
          onPress={() => onSelect(path)}
          style={[styles.move, active && { backgroundColor: colors.surfaceAccentSoft }]}
        >
          <Text style={[styles.san, { color: active ? colors.fgAccent : colors.fgBody }]}>
            {m.san}
          </Text>
        </Pressable>
        {score ? <Text style={[styles.xs, { color: colors.fgMuted }]}>{score}</Text> : null}
      </Fragment>
    )
  }
  const line = (
    moves: ReadonlyArray<StudyMove>,
    at: TreePath,
    fenBefore: string,
    startsLine: boolean,
  ): Array<ReactNode> => {
    const [main, ...variations] = moves
    if (!main) return []
    const mainPath = [...at, 0]
    return [
      move(main, mainPath, moveNumber(fenBefore, startsLine)),
      ...variations.map((variation, i) => {
        const path = [...at, i + 1]
        return (
          <Fragment key={`v${path.join('.')}`}>
            <Text style={[styles.paren, { color: colors.fgSecondary }]}>(</Text>
            {move(variation, path, moveNumber(fenBefore, true))}
            {line(variation.children, path, variation.fen, false)}
            <Text style={[styles.paren, { color: colors.fgSecondary }]}>)</Text>
          </Fragment>
        )
      }),
      ...line(main.children, mainPath, main.fen, variations.length > 0),
    ]
  }
  return (
    <View testID="move-tree" style={styles.tree}>
      {tree.length === 0 ? (
        <Text style={[styles.small, { color: colors.fgMuted }]}>
          No moves yet: play one on the board.
        </Text>
      ) : (
        line(tree, [], startFen, true)
      )}
    </View>
  )
}

const RESULT: Record<string, string> = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½', '*': '*' }

/**
 * "In the library" (library-explorer): the moves played here in the library's games (a tap plays one), how the games at
 * this position ended, and each of them (a tap opens it at this move).
 */
export function LibraryPanel({
  position,
  fen,
  onPlay,
  onOpenGame,
}: {
  position: LibraryPosition
  fen: string
  onPlay: (uci: string) => void
  onOpenGame: (id: string, ply: number) => void
}) {
  const { colors } = useTheme()
  return (
    <View testID="library-panel" style={styles.panel}>
      {position.moves.length > 0 ? (
        <View style={styles.wrap} accessibilityLabel="Moves played here">
          {position.moves.map((m) => {
            const san = playMove(fen, m.uci)?.san ?? m.uci
            return (
              <Pressable
                key={m.uci}
                accessibilityRole="button"
                accessibilityLabel={`Play ${san}`}
                onPress={() => onPlay(m.uci)}
                style={({ pressed }) => [
                  styles.explorerMove,
                  { backgroundColor: pressed ? colors.surfaceHover : colors.surfaceRaised },
                ]}
              >
                <Text style={[styles.san, { color: colors.fgPrimary }]}>{san}</Text>
                <Text style={[styles.xs, { color: colors.fgSecondary }]}>{m.games}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {position.games === 0 ? (
        <Text style={[styles.small, { color: colors.fgSecondary }]}>
          No library game reached this position.
        </Text>
      ) : (
        <>
          <Text style={[styles.small, { color: colors.fgBody }]}>
            {`${position.games} ${position.games === 1 ? 'game' : 'games'} · white ${position.whiteWins} · draws ${position.draws} · black ${position.blackWins}`}
          </Text>
          {position.items.map((g) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              onPress={() => onOpenGame(g.id, g.ply)}
              style={({ pressed }) => [
                styles.gameLine,
                pressed && { backgroundColor: colors.surfaceHover },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.body, styles.grow, { color: colors.fgPrimary }]}
              >
                {`${g.white} – ${g.black}${g.year ? `, ${g.year}` : ''}`}
              </Text>
              <Text style={[styles.mono, { color: colors.fgSecondary }]}>
                {RESULT[g.result] ?? g.result}
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { height: 16, borderRadius: RADIUS.control, overflow: 'hidden', justifyContent: 'center' },
  barScore: { position: 'absolute', fontFamily: FONTS.monoMedium, fontSize: TEXT['2xs'].size },
  lines: { gap: 2, minHeight: TEXT.sm.lineHeight },
  line: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 32,
    alignItems: 'center',
    paddingHorizontal: 4,
    borderRadius: RADIUS.control,
  },
  score: { width: 52, fontFamily: FONTS.monoMedium, fontSize: TEXT.sm.size },
  pv: { flex: 1, fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchRow: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nav: { flexDirection: 'row', gap: 8 },
  navButton: {
    flex: 1,
    minHeight: TOUCH,
    borderRadius: RADIUS.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navGlyph: { fontSize: 18 },
  tree: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, rowGap: 2 },
  number: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
  move: { paddingHorizontal: 4, paddingVertical: 6, borderRadius: RADIUS.control },
  san: { fontFamily: FONTS.monoMedium, fontSize: TEXT.sm.size },
  paren: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
  panel: { gap: 10 },
  explorerMove: {
    minHeight: TOUCH - 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.control,
  },
  gameLine: { minHeight: TOUCH - 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  xs: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
  body: { fontFamily: FONTS.sans, fontSize: TEXT.base.size, lineHeight: TEXT.base.lineHeight },
  mono: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
})
