import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ENGINE_LEVELS, THINK_SECONDS, pairMoves, reasonLabel } from '@chess/core'
import { outcome, resultMark, versus } from '@chess/local'
import type { ColourChoice, ThinkSeconds } from '@chess/core'
import type { DesktopGame, GameListItem } from '@chess/local'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT, type Colors } from '@/theme/tokens'
import { Piece } from './piece'
import { Button, Chip, TOUCH } from './primitives'

/** A level, your colour and the engine's think time, then an untimed game against Stockfish (desktop-app D5). */
export function EngineForm({
  level,
  color,
  think,
  busy,
  error,
  onLevel,
  onColor,
  onThink,
  onStart,
}: {
  level: string
  color: ColourChoice
  think: ThinkSeconds
  busy: boolean
  error: string | null
  onLevel: (level: string) => void
  onColor: (color: ColourChoice) => void
  onThink: (think: ThinkSeconds) => void
  onStart: () => void
}) {
  const { colors } = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceCard }]}>
      <View style={styles.wrap} accessibilityLabel="Level">
        {ENGINE_LEVELS.map((l) => (
          <Chip
            key={l.level}
            label={l.label}
            accessibilityLabel={`Level ${l.label}`}
            selected={l.level === level}
            onPress={() => onLevel(l.level)}
          />
        ))}
      </View>
      <View style={styles.wrap} accessibilityLabel="Your colour">
        {(['white', 'random', 'black'] as const).map((c) => (
          <Chip
            key={c}
            label={c === 'white' ? 'White' : c === 'black' ? 'Black' : 'Random'}
            selected={c === color}
            onPress={() => onColor(c)}
          >
            {c === 'random' ? (
              <Text style={[styles.die, { color: colors.fgPrimary }]}>⚄</Text>
            ) : (
              <Piece piece={c === 'white' ? 'wK' : 'bK'} size={24} />
            )}
          </Chip>
        ))}
      </View>
      <View style={[styles.wrap, styles.center]} accessibilityLabel="Think time">
        <Text style={[styles.small, { color: colors.fgSecondary }]}>The computer thinks</Text>
        {THINK_SECONDS.map((s) => (
          <Chip key={s} label={`${s} s`} selected={s === think} onPress={() => onThink(s)} />
        ))}
        <Text style={[styles.small, { color: colors.fgSecondary }]}>a move.</Text>
      </View>
      <Text style={[styles.small, { color: colors.fgSecondary }]}>
        Untimed: no clocks. You can take moves back, offer a draw or ask the computer to resign.
      </Text>
      <Button label="Play the computer" kind="primary" disabled={busy} onPress={onStart} />
      {error ? <ErrorLine text={error} /> : null}
    </View>
  )
}

export function ErrorLine({ text }: { text: string }) {
  const { colors } = useTheme()
  return (
    <Text accessibilityRole="alert" style={[styles.small, { color: colors.statusLoss }]}>
      {text}
    </Text>
  )
}

function tone(colors: Colors, result: ReturnType<typeof outcome>): string {
  if (result === 'win') return colors.statusWin
  if (result === 'loss') return colors.statusLoss
  if (result === 'draw') return colors.statusDraw
  return colors.fgMuted
}

/** The person's games, newest first: result, opponent and moves; a tap opens the game. */
export function GameRows({
  games,
  onOpen,
  empty = 'No games yet: play the computer.',
}: {
  games: ReadonlyArray<GameListItem>
  onOpen: (id: string) => void
  empty?: string
}) {
  const { colors } = useTheme()
  if (games.length === 0)
    return <Text style={[styles.small, { color: colors.fgMuted }]}>{empty}</Text>
  return (
    <View accessibilityLabel="Games">
      {games.map((g) => {
        const result = outcome(g)
        const mark = g.status === 'playing' ? 'Live' : resultMark(g.result)
        const detail = `${Math.ceil(g.ply / 2)} moves${g.reason ? ` · ${reasonLabel(g.reason)}` : ''}`
        return (
          <Pressable
            key={g.id}
            testID="game-row"
            accessibilityRole="button"
            onPress={() => onOpen(g.id)}
            style={({ pressed }) => [
              styles.gameRow,
              { borderBottomColor: colors.lineDivider },
              pressed && { backgroundColor: colors.surfaceHover },
            ]}
          >
            <Text style={[styles.mark, { color: tone(colors, result) }]}>{mark}</Text>
            <View style={styles.grow}>
              <Text numberOfLines={1} style={[styles.body, { color: colors.fgPrimary }]}>
                {versus(g.personColor, g.level)}
              </Text>
              <Text style={[styles.xs, { color: colors.fgSecondary }]}>{detail}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

/** A player's line above or below the board: the name and colour, the side to move marked. */
export function PlayerLine({
  name,
  color,
  toMove,
}: {
  name: string
  color: 'white' | 'black'
  toMove: boolean
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.player} testID={`player-${color}`}>
      <Text style={[styles.playerName, { color: colors.fgPrimary }]}>{name}</Text>
      <Text style={[styles.xs, { color: colors.fgSecondary }]}>
        {color}
        {toMove ? ' · to move' : ''}
      </Text>
    </View>
  )
}

/**
 * The game's moves as text that wraps under the board (mobile-app D5), numbered by move; a tap on a move shows the
 * position after it. `viewPly` is the move looked at, or null for the last.
 */
export function MoveText({
  sans,
  viewPly,
  onSelect,
}: {
  sans: ReadonlyArray<string>
  viewPly: number | null
  onSelect: (ply: number) => void
}) {
  const { colors } = useTheme()
  const current = viewPly ?? sans.length
  return (
    <View testID="move-list" style={styles.moves}>
      {sans.length === 0 ? (
        <Text style={[styles.small, { color: colors.fgMuted }]}>No moves yet.</Text>
      ) : (
        pairMoves(sans).map((pair, i) => (
          <View key={i} style={styles.pair}>
            <Text style={[styles.number, { color: colors.fgMuted }]}>{`${i + 1}.`}</Text>
            {pair.map((san, j) => {
              const ply = i * 2 + j + 1
              const on = ply === current
              return (
                <Pressable
                  key={j}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => onSelect(ply)}
                  style={[styles.move, on && { backgroundColor: colors.surfaceAccentSoft }]}
                >
                  <Text style={[styles.san, { color: on ? colors.fgAccent : colors.fgPrimary }]}>
                    {san}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ))
      )}
    </View>
  )
}

const OUTCOME_TEXT = { win: 'You won', loss: 'You lost', draw: 'Drawn' } as const

/** How a finished game ended, and what to do next. */
export function GameEnd({
  game,
  onNewGame,
  onSavePgn,
  onAnalyse,
}: {
  game: DesktopGame
  onNewGame: () => void
  onSavePgn: () => void
  onAnalyse: () => void
}) {
  const { colors } = useTheme()
  const result = outcome(game)
  return (
    <View
      testID="game-end"
      style={[
        styles.card,
        { backgroundColor: colors.surfaceAccentSoft, borderColor: colors.lineAccentSoft },
      ]}
    >
      <Text style={[styles.end, { color: tone(colors, result) }]}>
        {`${result ? OUTCOME_TEXT[result] : 'Game over'} · ${resultMark(game.result)}`}
      </Text>
      {game.reason ? (
        <Text style={[styles.small, { color: colors.fgSecondary }]}>
          {reasonLabel(game.reason)}
        </Text>
      ) : null}
      <View style={styles.wrap}>
        <Button label="New game" kind="primary" onPress={onNewGame} />
        <Button label="Analyse" onPress={onAnalyse} />
        <Button label="Save PGN" onPress={onSavePgn} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 12, borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  center: { alignItems: 'center' },
  grow: { flex: 1 },
  die: { fontSize: 22, lineHeight: 24 },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  xs: { fontFamily: FONTS.sans, fontSize: TEXT.xs.size, lineHeight: TEXT.xs.lineHeight },
  body: { fontFamily: FONTS.sans, fontSize: TEXT.base.size, lineHeight: TEXT.base.lineHeight },
  gameRow: {
    minHeight: TOUCH + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mark: { width: 40, fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
  player: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 12 },
  playerName: { fontFamily: FONTS.sansMedium, fontSize: TEXT.base.size },
  moves: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 2 },
  pair: { flexDirection: 'row', alignItems: 'center' },
  number: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size, marginRight: 2 },
  move: { paddingHorizontal: 4, paddingVertical: 6, borderRadius: RADIUS.control },
  san: { fontFamily: FONTS.monoMedium, fontSize: TEXT.sm.size },
  end: { fontFamily: FONTS.display, fontSize: TEXT['display-sm'].size },
})
