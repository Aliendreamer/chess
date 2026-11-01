import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Line, Polygon, Rect } from 'react-native-svg'
import { advantageText, bookLink, graphPoints, moveLabel, scoreLabel } from '@chess/view'
import type { MoveClass, ReviewCounts, ReviewedMove } from '@chess/core'
import type { PreviewState, ReviewView } from '@chess/view'
import { appHref } from '@/lib/links'
import { useTheme } from '@/theme/theme'
import { FONTS, RADIUS, TEXT, type Colors } from '@/theme/tokens'
import { MobileLink } from './mobile-link'
import { ErrorLine } from './play'
import { Button, Eyebrow } from './primitives'

/** Game review (game-review) under a finished game: the graph, the move on the board as the review sees it, marks. */

const H = 80

const ARTICLE: Record<Exclude<MoveClass, 'none'>, string> = {
  inaccuracy: 'an inaccuracy',
  mistake: 'a mistake',
  blunder: 'a blunder',
}

function dot(colors: Colors, cls: Exclude<MoveClass, 'none'>): string {
  if (cls === 'inaccuracy') return colors.fgAccent
  if (cls === 'mistake') return colors.statusWaiting
  return colors.statusLoss
}

/** White's chances over the game, White up; marked moves are dots; a tap goes to that move. */
export function EvalGraph({
  moves,
  current,
  width,
  onSelect,
}: {
  moves: ReadonlyArray<ReviewedMove>
  current: number
  width: number
  onSelect: (ply: number) => void
}) {
  const { colors } = useTheme()
  const points = graphPoints(moves, width, H)
  const evaluated = moves.filter((m) => m.chances !== null).length
  const step = moves.length === 0 ? 0 : width / moves.length
  const line = points.map((p) => `${p.x},${p.y}`).join(' ')
  const area = `0,${H} ${line} ${points.at(-1)?.x ?? 0},${H}`
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Evaluation graph: ${evaluated} of ${moves.length} moves evaluated`}
      style={[styles.graph, { backgroundColor: colors.surfaceInset }]}
    >
      <Svg width={width} height={H}>
        <Polygon points={area} fill={colors.fgPrimary} fillOpacity={0.7} />
        <Line
          x1={0}
          y1={H / 2}
          x2={width}
          y2={H / 2}
          stroke={colors.lineDefault}
          strokeWidth={0.5}
        />
        {current > 0 ? (
          <Line
            x1={current * step}
            y1={0}
            x2={current * step}
            y2={H}
            stroke={colors.fgAccent}
            strokeWidth={1}
          />
        ) : null}
        {points.map((p) => {
          const cls = moves[p.ply - 1]?.class
          return cls && cls !== 'none' ? (
            <Circle key={p.ply} cx={p.x} cy={p.y} r={3} fill={dot(colors, cls)} />
          ) : null
        })}
        {moves.map((m) => (
          <Rect
            key={m.ply}
            testID={`graph-ply-${m.ply}`}
            x={(m.ply - 0.5) * step}
            y={0}
            width={step}
            height={H}
            fill="transparent"
            onPress={() => onSelect(m.ply)}
          />
        ))}
      </Svg>
    </View>
  )
}

/**
 * The move on the board as the review sees it: the evaluation in numbers and words, its mark, and the engine's better
 * line, each of its moves a button that shows the line up to there on the board.
 */
function MoveVerdict({
  move,
  preview,
  onPreview,
}: {
  move: ReviewedMove | undefined
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
}) {
  const { colors } = useTheme()
  if (!move)
    return <Text style={[styles.small, { color: colors.fgSecondary }]}>Start position.</Text>
  const label = moveLabel(move.ply, move.san)
  const words = advantageText(move)
  const marked = move.class && move.class !== 'none' ? move.class : null
  const line = marked && move.bestSan ? move.line : []
  const showing = preview?.ply === move.ply ? preview.upTo : 0
  return (
    <View testID="review-move" style={styles.verdict}>
      <View style={styles.row}>
        <Text testID="review-score" style={[styles.score, { color: colors.fgPrimary }]}>
          {scoreLabel(move)}
        </Text>
        {words ? <Text style={[styles.small, { color: colors.fgSecondary }]}>{words}</Text> : null}
      </View>
      <Text
        style={[
          styles.small,
          {
            color:
              marked === 'blunder' || marked === 'mistake' ? colors.statusLoss : colors.fgPrimary,
          },
        ]}
      >
        {marked ? `${label} is ${ARTICLE[marked]}.` : label}
      </Text>
      {line.length > 0 ? (
        <View style={styles.wrap} accessibilityLabel="Better line">
          <Text style={[styles.small, { color: colors.fgSecondary }]}>Better:</Text>
          {line.map((san, i) => (
            <Pressable
              key={`${i}-${san}`}
              accessibilityRole="button"
              accessibilityState={{ selected: showing === i + 1 }}
              onPress={() => onPreview({ ply: move.ply, upTo: i + 1 })}
              style={[
                styles.lineMove,
                {
                  borderColor: showing === i + 1 ? colors.lineAccent : colors.lineDefault,
                  backgroundColor:
                    showing === i + 1 ? colors.surfaceAccentSoft : colors.surfaceRaised,
                },
              ]}
            >
              <Text style={[styles.san, { color: colors.fgPrimary }]}>
                {i === 0 ? moveLabel(move.ply, san) : san}
              </Text>
            </Pressable>
          ))}
          {showing > 0 ? (
            <Button label="Back to the game" kind="ghost" onPress={() => onPreview(null)} />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function Counts({ white, black }: { white: ReviewCounts; black: ReviewCounts }) {
  const { colors } = useTheme()
  const row = (name: string, c: ReviewCounts | null) => (
    <View
      style={[
        styles.countRow,
        c && { borderTopColor: colors.lineDivider, borderTopWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[styles.small, styles.grow, { color: c ? colors.fgPrimary : colors.fgMuted }]}>
        {name}
      </Text>
      {(c ? [c.inaccuracies, c.mistakes, c.blunders] : ['?!', '?', '??']).map((n, i) => (
        <Text key={i} style={[styles.count, { color: c ? colors.fgPrimary : colors.fgMuted }]}>
          {String(n)}
        </Text>
      ))}
    </View>
  )
  return (
    <View accessibilityLabel="Marks per player">
      {row('Player', null)}
      {row('White', white)}
      {row('Black', black)}
    </View>
  )
}

/** The engine review under a finished game (game-review D8). */
export function ReviewPanel({
  review,
  mine,
  busy,
  error,
  onStart,
  current,
  onSelect,
  preview,
  onPreview,
}: {
  review: ReviewView | null
  mine: 'white' | 'black' | null
  busy: boolean
  error: string | null
  onStart: () => void
  /** The ply on the board (0 = the start). */
  current: number
  onSelect: (ply: number) => void
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
}) {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const status = review?.status ?? 'none'
  const exit = review?.bookExit ?? null
  const trainer = exit ? bookLink(exit, mine) : null
  return (
    <View testID="review-panel" style={[styles.panel, { borderColor: colors.lineDefault }]}>
      <Eyebrow>Engine review</Eyebrow>
      {status === 'none' ? (
        <Button label="Review with engine" disabled={busy} onPress={onStart} />
      ) : null}
      {status === 'running' && review ? (
        <View style={styles.row}>
          <Text style={[styles.small, styles.grow, { color: colors.fgSecondary }]}>
            {`Reviewing: ${review.evaluated} of ${review.positions} positions`}
          </Text>
          <Button label="Ask again" kind="ghost" disabled={busy} onPress={onStart} />
        </View>
      ) : null}
      {error ? <ErrorLine text={error} /> : null}
      {review && status !== 'none' ? (
        <>
          <EvalGraph
            moves={review.moves}
            current={current}
            width={width - 56}
            onSelect={onSelect}
          />
          <MoveVerdict move={review.moves[current - 1]} preview={preview} onPreview={onPreview} />
        </>
      ) : null}
      {review && status === 'complete' ? (
        <>
          <Counts white={review.white} black={review.black} />
          {exit ? (
            <Text testID="book-exit" style={[styles.small, { color: colors.fgSecondary }]}>
              {`Left the book with ${moveLabel(exit.ply, exit.san)} (${exit.color === 'white' ? 'White' : 'Black'}) · ${exit.eco} ${exit.name}`}
            </Text>
          ) : null}
          {trainer ? (
            <MobileLink
              to={appHref(`/trainer/${encodeURIComponent(trainer.family)}`, {
                color: trainer.color,
              })}
            >
              Train this opening
            </MobileLink>
          ) : null}
          {mine ? (
            <View style={styles.verdict}>
              <Text testID="review-training" style={[styles.small, { color: colors.fgSecondary }]}>
                Your mistakes from this game join your training on their own.
              </Text>
              <MobileLink to="/training">Open training</MobileLink>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { gap: 12, padding: 12, borderWidth: 1, borderRadius: RADIUS.card },
  graph: { borderRadius: RADIUS.control, overflow: 'hidden' },
  verdict: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  grow: { flex: 1 },
  score: { fontFamily: FONTS.monoMedium, fontSize: TEXT.base.size },
  small: { fontFamily: FONTS.sans, fontSize: TEXT.sm.size, lineHeight: TEXT.sm.lineHeight },
  san: { fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
  lineMove: {
    borderWidth: 1,
    borderRadius: RADIUS.control,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  count: { width: 40, textAlign: 'right', fontFamily: FONTS.mono, fontSize: TEXT.sm.size },
})
