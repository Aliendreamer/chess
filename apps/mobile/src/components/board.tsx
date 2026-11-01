import { memo, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
} from 'react-native'
import Svg, { Circle, Defs, G, Line, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg'
import {
  animationMs,
  checkSquare,
  clickSquare,
  legalTargets,
  needsPromotion,
  placement,
  premoveClick,
  squaresFor,
} from '@chess/core'
import type { Color, Piece as PieceOf, SquarePair } from '@chess/core'
import { useTheme } from '../theme/theme'
import { FONTS, RADIUS } from '../theme/tokens'
import { Button } from './primitives'
import { Piece, type PieceCode } from './piece'

/**
 * The board (board-look, mobile-app 5.3): the Cburnett pieces on the board theme's squares with the desktop's
 * highlights. One responder over the whole board takes taps (tap the piece, tap its target) and drags, so a finger
 * that wobbles still taps; a screen reader moves through each square's "activate" action instead. The board picks
 * and promotes, and hands the finished move up as UCI: whether it is played is the screen's decision.
 */

export interface BoardProps {
  fen: string
  orientation: Color
  /** The board's width and height in points; the screen fits it to the window. */
  size: number
  /** The side the player moves (default: the side to move). */
  side?: Color
  /** A move as UCI (`e2e4`, `a7a8n`). Without it the board is read-only. */
  onMove?: (uci: string) => void
  /** Moves queued while the other side is to move; null drops the queued one. Without it there are no premoves. */
  onPremove?: (premove: SquarePair | null) => void
  lastMove?: SquarePair | null
  premove?: SquarePair | null
  /** Arrows the screen draws: a hint, the review's better move, a training answer. */
  arrows?: ReadonlyArray<SquarePair>
}

type Promo = 'q' | 'r' | 'b' | 'n'

const NAME: Record<PieceOf['type'], string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}

/** How far a finger must move before a press becomes a drag (as the desktop's 6px). */
const DRAG_DISTANCE = 6

/** The square under a point on the board as `orientation` shows it, or null off the board. */
export function squareAt(x: number, y: number, size: number, orientation: Color): string | null {
  const cell = size / 8
  const col = Math.floor(x / cell)
  const row = Math.floor(y / cell)
  if (col < 0 || col > 7 || row < 0 || row > 7) return null
  return squaresFor(orientation)[row * 8 + col] ?? null
}

/** Where a square's top-left corner is, in points. */
function offsetOf(square: string, size: number, orientation: Color) {
  const index = squaresFor(orientation).indexOf(square)
  const cell = size / 8
  return { x: (index % 8) * cell, y: Math.floor(index / 8) * cell }
}

function code(piece: PieceOf): PieceCode {
  return `${piece.color}${piece.type.toUpperCase()}` as PieceCode
}

const letter = (color: Color): 'w' | 'b' => (color === 'white' ? 'w' : 'b')

/** Whether the system asks for less motion; the board then moves its pieces without sliding them. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduced(on))
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    return () => {
      live = false
      sub.remove()
    }
  }, [])
  return reduced
}

export function Board({
  fen,
  orientation,
  size,
  side,
  onMove,
  onPremove,
  lastMove,
  premove,
  arrows = [],
}: BoardProps) {
  const { board, preferences } = useTheme()
  const cell = size / 8
  const pieces = placement(fen)
  const toMove = fen.split(' ')[1] === 'b' ? 'b' : 'w'
  const mine = side ? letter(side) : toMove
  const myTurn = mine === toMove
  const interactive = onMove !== undefined

  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<SquarePair | null>(null)
  const [dragFrom, setDragFrom] = useState<string | null>(null)
  const [dragAt] = useState(() => new Animated.ValueXY())
  const press = useRef<{ square: string; x: number; y: number } | null>(null)

  // A new position drops what was picked.
  const [seen, setSeen] = useState(fen)
  if (seen !== fen) {
    setSeen(fen)
    setSelected(null)
    setPromotion(null)
  }

  // The last move slides in, unless it was dropped there by hand or the system asks for less motion.
  const reduced = useReducedMotion()
  const [slide] = useState(() => new Animated.Value(1))
  const dropped = useRef<string | null>(null)
  const ms = reduced ? 0 : animationMs(preferences.animation)
  const sliding = lastMove && pieces[lastMove.to] ? lastMove : null
  useEffect(() => {
    const byHand = sliding && dropped.current === `${sliding.from}${sliding.to}`
    dropped.current = null
    if (!sliding || byHand || ms === 0) {
      slide.setValue(1)
      return
    }
    slide.setValue(0)
    Animated.timing(slide, { toValue: 1, duration: ms, useNativeDriver: true }).start()
    // Only a new position slides a piece.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen])

  const targets = selected && myTurn && interactive ? legalTargets(fen, selected) : []
  const check = checkSquare(fen)

  function finish(from: string, to: string) {
    setSelected(null)
    if (needsPromotion(fen, from, to)) setPromotion({ from, to })
    else onMove?.(`${from}${to}`)
  }

  function tap(square: string) {
    if (!interactive || promotion) return
    if (myTurn) {
      const result = clickSquare(fen, mine, selected, square)
      setSelected(result.selected)
      if (result.move) finish(result.move.from, result.move.to)
      return
    }
    if (!onPremove) return
    const queued = premoveClick(fen, mine, selected, square)
    setSelected(queued.selected)
    if (queued.premove) onPremove(queued.premove)
    else if (!queued.selected && premove) onPremove(null)
  }

  function drop(from: string, to: string | null) {
    if (to === from) {
      setSelected(from)
      return
    }
    setSelected(null)
    if (!to) return
    if (myTurn) {
      if (!legalTargets(fen, from).includes(to)) return
      dropped.current = `${from}${to}`
      finish(from, to)
    } else {
      onPremove?.({ from, to })
    }
  }

  const point = (event: GestureResponderEvent) => ({
    x: event.nativeEvent.locationX,
    y: event.nativeEvent.locationY,
  })

  function onGrant(event: GestureResponderEvent) {
    const { x, y } = point(event)
    const square = squareAt(x, y, size, orientation)
    press.current = square ? { square, x, y } : null
  }

  function onDragMove(event: GestureResponderEvent) {
    const start = press.current
    if (!start) return
    const { x, y } = point(event)
    if (!dragFrom) {
      const far = Math.hypot(x - start.x, y - start.y) >= DRAG_DISTANCE
      const movable = pieces[start.square]?.color === mine && (myTurn || onPremove !== undefined)
      if (!far || !movable || promotion) return
      setDragFrom(start.square)
      setSelected(start.square)
    }
    dragAt.setValue({ x: x - cell / 2, y: y - cell / 2 })
  }

  function onRelease(event: GestureResponderEvent) {
    const start = press.current
    press.current = null
    if (!start) return
    if (dragFrom) {
      const { x, y } = point(event)
      setDragFrom(null)
      drop(dragFrom, squareAt(x, y, size, orientation))
    } else {
      tap(start.square)
    }
  }

  function onTerminate() {
    press.current = null
    setDragFrom(null)
  }

  function onAction(square: string, event: AccessibilityActionEvent) {
    if (event.nativeEvent.actionName === 'activate') tap(square)
  }

  const coordinates = preferences.coordinates
  const bottomRank = orientation === 'white' ? '1' : '8'
  const leftFile = orientation === 'white' ? 'a' : 'h'
  const label = Math.max(9, Math.round(cell * 0.2))

  // The picker sits beside the touch layer, not in it: `box-only` keeps touches from everything inside.
  return (
    <View style={{ width: size, height: size }}>
      <View
        accessibilityLabel="Chess board"
        pointerEvents="box-only"
        onStartShouldSetResponder={() => interactive}
        onMoveShouldSetResponder={() => interactive}
        onResponderTerminationRequest={() => !dragFrom}
        onResponderGrant={onGrant}
        onResponderMove={onDragMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onTerminate}
        style={[styles.board, { width: size, height: size }]}
      >
        {squaresFor(orientation).map((square) => {
          const piece = pieces[square]
          // a1 is dark, h1 light: file index + rank is odd on the dark squares.
          const light = (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0
          const target = targets.includes(square)
          const isLast = lastMove?.from === square || lastMove?.to === square
          const isPremove = premove?.from === square || premove?.to === square
          const slidingHere = sliding?.to === square
          const offset = slidingHere ? offsetOf(sliding.from, size, orientation) : null
          const here = slidingHere ? offsetOf(square, size, orientation) : null
          const name = piece
            ? `, ${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}`
            : ''
          return (
            <View
              key={square}
              accessible
              accessibilityLabel={`${square}${name}${target ? ', move here' : ''}`}
              accessibilityRole={interactive ? 'button' : undefined}
              accessibilityState={{ selected: selected === square }}
              accessibilityActions={interactive ? [{ name: 'activate' }] : undefined}
              onAccessibilityAction={(event) => onAction(square, event)}
              style={[
                styles.square,
                {
                  width: cell,
                  height: cell,
                  backgroundColor: light ? board.light : board.dark,
                  zIndex: slidingHere ? 1 : 0,
                },
              ]}
            >
              {isLast ? (
                <View
                  testID={`last-${square}`}
                  style={[StyleSheet.absoluteFill, { backgroundColor: board.last }]}
                />
              ) : null}
              {isPremove ? (
                <View
                  testID={`premove-${square}`}
                  style={[StyleSheet.absoluteFill, { backgroundColor: board.premove }]}
                />
              ) : null}
              {selected === square ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: board.selected }]} />
              ) : null}
              {check === square ? <CheckGlow size={cell} testID={`check-${square}`} /> : null}
              {coordinates && square[1] === bottomRank ? (
                <Text
                  style={[
                    styles.file,
                    { color: light ? board.dark : board.light, fontSize: label },
                  ]}
                >
                  {square[0]}
                </Text>
              ) : null}
              {coordinates && square[0] === leftFile ? (
                <Text
                  style={[
                    styles.rank,
                    { color: light ? board.dark : board.light, fontSize: label },
                  ]}
                >
                  {square[1]}
                </Text>
              ) : null}
              {piece && dragFrom !== square ? (
                <Animated.View
                  style={
                    offset && here
                      ? {
                          transform: [
                            {
                              translateX: slide.interpolate({
                                inputRange: [0, 1],
                                outputRange: [offset.x - here.x, 0],
                              }),
                            },
                            {
                              translateY: slide.interpolate({
                                inputRange: [0, 1],
                                outputRange: [offset.y - here.y, 0],
                              }),
                            },
                          ],
                        }
                      : undefined
                  }
                >
                  <Piece piece={code(piece)} size={cell} />
                </Animated.View>
              ) : null}
              {target ? <TargetMark size={cell} capture={!!piece} color={board.target} /> : null}
            </View>
          )
        })}
        {arrows.length > 0 ? (
          <Arrows arrows={arrows} size={size} orientation={orientation} />
        ) : null}
        {dragFrom && pieces[dragFrom] ? (
          <Animated.View
            style={[
              styles.dragged,
              { width: cell, height: cell },
              { transform: dragAt.getTranslateTransform() },
            ]}
          >
            <Piece piece={code(pieces[dragFrom])} size={cell} />
          </Animated.View>
        ) : null}
      </View>
      {promotion ? (
        <PromotionPicker
          color={toMove}
          size={cell}
          onPick={(type) => {
            const { from, to } = promotion
            setPromotion(null)
            onMove?.(`${from}${to}${type}`)
          }}
          onCancel={() => setPromotion(null)}
        />
      ) : null}
    </View>
  )
}

// Lichess's green.
const ARROW = 'rgba(21, 120, 27, 0.8)'

/** Arrows from square centre to square centre, the head short of the centre so the piece shows. */
function Arrows({
  arrows,
  size,
  orientation,
}: {
  arrows: ReadonlyArray<SquarePair>
  size: number
  orientation: Color
}) {
  const cell = size / 8
  const centre = (square: string) => {
    const at = offsetOf(square, size, orientation)
    return { x: at.x + cell / 2, y: at.y + cell / 2 }
  }
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {arrows.map(({ from, to }) => {
        const a = centre(from)
        const b = centre(to)
        const length = Math.hypot(b.x - a.x, b.y - a.y)
        if (length === 0) return null
        const ux = (b.x - a.x) / length
        const uy = (b.y - a.y) / length
        const head = cell * 0.4
        // The shaft stops where the head starts; the head's tip stops a little short of the centre.
        const tip = { x: b.x - ux * cell * 0.15, y: b.y - uy * cell * 0.15 }
        const base = { x: tip.x - ux * head, y: tip.y - uy * head }
        const wing = { x: -uy * head * 0.6, y: ux * head * 0.6 }
        return (
          <G key={`${from}${to}`}>
            <Line
              testID={`arrow-${from}-${to}`}
              x1={String(a.x)}
              y1={String(a.y)}
              x2={String(base.x)}
              y2={String(base.y)}
              stroke={ARROW}
              strokeWidth={cell * 0.18}
              strokeLinecap="round"
            />
            <Polygon
              points={`${tip.x},${tip.y} ${base.x + wing.x},${base.y + wing.y} ${base.x - wing.x},${base.y - wing.y}`}
              fill={ARROW}
            />
          </G>
        )
      })}
    </Svg>
  )
}

/** A dot on an empty target, a ring on a capture. */
function TargetMark({ size, capture, color }: { size: number; capture: boolean; color: string }) {
  const half = size / 2
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {capture ? (
        <Circle
          cx={half}
          cy={half}
          r={half * 0.9}
          stroke={color}
          strokeWidth={size * 0.1}
          fill="none"
        />
      ) : (
        <Circle cx={half} cy={half} r={size * 0.19} fill={color} />
      )}
    </Svg>
  )
}

/** The red glow under a king in check, as the desktop's gradient. */
const CheckGlow = memo(function CheckGlow({ size, testID }: { size: number; testID: string }) {
  return (
    <Svg testID={testID} width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="check" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="rgb(255, 0, 0)" stopOpacity={1} />
          <Stop offset="0.25" stopColor="rgb(231, 0, 0)" stopOpacity={1} />
          <Stop offset="0.89" stopColor="rgb(169, 0, 0)" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill="url(#check)" />
    </Svg>
  )
})

const CHOICES: ReadonlyArray<{ type: Promo; label: string }> = [
  { type: 'q', label: 'Queen' },
  { type: 'r', label: 'Rook' },
  { type: 'b', label: 'Bishop' },
  { type: 'n', label: 'Knight' },
]

/** The four promotion choices over the board, queen first. */
function PromotionPicker({
  color,
  size,
  onPick,
  onCancel,
}: {
  color: 'w' | 'b'
  size: number
  onPick: (type: Promo) => void
  onCancel: () => void
}) {
  const { board, colors } = useTheme()
  const big = Math.max(size, 48)
  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel="Promote to"
      style={[StyleSheet.absoluteFill, styles.promotion]}
    >
      <View style={[styles.choices, { backgroundColor: colors.surfaceRaised }]}>
        <View style={styles.row}>
          {CHOICES.map(({ type, label }) => (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onPick(type)}
              style={({ pressed }) => [
                styles.choice,
                {
                  width: big,
                  height: big,
                  backgroundColor: pressed ? board.dark : board.light,
                },
              ]}
            >
              <Piece piece={`${color}${type.toUpperCase()}` as PieceCode} size={big - 8} />
            </Pressable>
          ))}
        </View>
        <Button label="Cancel" kind="ghost" onPress={onCancel} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: RADIUS.board,
    overflow: 'hidden',
  },
  square: { position: 'relative' },
  file: { position: 'absolute', right: 3, bottom: 1, fontFamily: FONTS.sansSemiBold },
  rank: { position: 'absolute', left: 3, top: 1, fontFamily: FONTS.sansSemiBold },
  dragged: { position: 'absolute', left: 0, top: 0, zIndex: 2 },
  promotion: {
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  choices: { padding: 8, borderRadius: RADIUS.card, gap: 4, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  choice: { borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center' },
})
