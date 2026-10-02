import { Chess } from 'chess.js'
import { applyOptimistic, needsPromotion, placement, squaresFor } from './moveInput'
import type { CSSProperties } from 'react'
import type { Color } from './games'
import type { Piece } from './moveInput'

/**
 * What the board shows on top of the position (board-look): lichess-style highlights as react-chessboard square
 * styles, and the premove rule. The colours are theme variables from `styles.css`, so a board theme changes them all.
 */

export const BOARD_THEMES = ['brown', 'blue', 'green', 'slate', 'walnut'] as const
export type BoardTheme = (typeof BOARD_THEMES)[number]

export interface SquarePair {
  from: string
  to: string
}

export interface Highlights {
  lastMove?: SquarePair | null | undefined
  selected?: string | null | undefined
  /** Legal targets of the selected piece: a dot on an empty square, a ring on a capture. */
  targets?: ReadonlyArray<string> | undefined
  premove?: SquarePair | null | undefined
  /** Squares circled with a right-click. */
  circles?: ReadonlyArray<string> | undefined
}

const DOT = 'radial-gradient(var(--board-target) 19%, transparent 20%)'
const RING = 'radial-gradient(transparent 79%, var(--board-target) 80%)'
const CHECK =
  'radial-gradient(ellipse at center, rgba(255, 0, 0, 1) 0%, rgba(231, 0, 0, 1) 25%, rgba(169, 0, 0, 0) 89%)'

export function pieceSrc(color: Piece['color'], type: Piece['type']): string {
  return `/pieces/cburnett/${color}${type.toUpperCase()}.svg`
}

/** The square of the side to move's king when it is in check, else null. */
export function checkSquare(fen: string): string | null {
  let game: Chess
  try {
    game = new Chess(fen)
  } catch {
    return null
  }
  if (!game.isCheck()) return null
  const turn = game.turn()
  const king = Object.entries(placement(fen)).find(([, p]) => p.type === 'k' && p.color === turn)
  return king ? king[0] : null
}

/** Square styles for react-chessboard: only the squares that carry a highlight are present. */
export function squareStyles(fen: string, h: Highlights): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {}
  const add = (square: string, style: CSSProperties) => {
    styles[square] = { ...styles[square], ...style }
  }
  const pieces = placement(fen)
  if (h.lastMove) {
    add(h.lastMove.from, { backgroundColor: 'var(--board-last)' })
    add(h.lastMove.to, { backgroundColor: 'var(--board-last)' })
  }
  if (h.premove) {
    add(h.premove.from, { backgroundColor: 'var(--board-premove)' })
    add(h.premove.to, { backgroundColor: 'var(--board-premove)' })
  }
  if (h.selected) add(h.selected, { backgroundColor: 'var(--board-selected)' })
  const check = checkSquare(fen)
  if (check) add(check, { backgroundImage: CHECK })
  for (const target of h.targets ?? []) {
    add(target, { backgroundImage: pieces[target] ? RING : DOT })
  }
  for (const circle of h.circles ?? []) {
    add(circle, { boxShadow: 'inset 0 0 0 4px var(--board-circle)', borderRadius: '50%' })
  }
  return styles
}

/** The premove as UCI if it is legal in `fen` (a pawn reaching the last rank becomes a queen), else null. */
export function resolvePremove(fen: string, premove: SquarePair): string | null {
  const promotion = needsPromotion(fen, premove.from, premove.to) ? 'q' : ''
  const uci = `${premove.from}${premove.to}${promotion}`
  return applyOptimistic(fen, uci) ? uci : null
}

export interface PremoveClick {
  selected: string | null
  premove: SquarePair | null
}

/**
 * Click-to-premove while the opponent is to move: a click on my piece selects it (or switches to it), and a click on
 * any other square queues the move without checking it; anything else clears both.
 */
export function premoveClick(
  fen: string,
  mine: Piece['color'],
  selected: string | null,
  square: string,
): PremoveClick {
  const mineHere = placement(fen)[square]?.color === mine
  if (selected === square) return { selected: null, premove: null }
  if (mineHere) return { selected: square, premove: null }
  if (selected) return { selected: null, premove: { from: selected, to: square } }
  return { selected: null, premove: null }
}

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as const
const ORDER = ['p', 'n', 'b', 'r', 'q'] as const
type Captured = (typeof ORDER)[number]

export interface SideMaterial {
  /** The opponent's piece types this side is up, one entry per piece, pawns first. */
  pieces: Array<Captured>
  /** Points ahead (pawn 1, knight and bishop 3, rook 5, queen 9); 0 for the side behind or level. */
  plus: number
}

/** The material imbalance as lichess shows it: per piece type, the surplus goes under the side that has it. */
export function material(fen: string): { white: SideMaterial; black: SideMaterial } {
  const count = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  }
  for (const piece of Object.values(placement(fen))) count[piece.color][piece.type] += 1
  const white: SideMaterial = { pieces: [], plus: 0 }
  const black: SideMaterial = { pieces: [], plus: 0 }
  let points = 0
  for (const type of ORDER) {
    const diff = count.w[type] - count.b[type]
    const side = diff > 0 ? white : black
    for (let i = 0; i < Math.abs(diff); i++) side.pieces.push(type)
    points += diff * VALUE[type]
  }
  if (points > 0) white.plus = points
  if (points < 0) black.plus = -points
  return { white, black }
}

export interface Position {
  fen: string
  lastMove: SquarePair | null
}

/** Every position of a game from the standard start, one per ply, by replaying its SAN; stops at an unreadable move. */
export function replay(sans: ReadonlyArray<string>): Array<Position> {
  const game = new Chess()
  const positions: Array<Position> = [{ fen: game.fen(), lastMove: null }]
  for (const san of sans) {
    try {
      const move = game.move(san)
      positions.push({ fen: game.fen(), lastMove: { from: move.from, to: move.to } })
    } catch {
      break
    }
  }
  return positions
}

export interface BoardSquare {
  square: string
  light: boolean
  piece: Piece | null
}

/** Every square in drawing order for `orientation` (top-left first), with its colour and piece: a static board's cells. */
export function boardSquares(fen: string, orientation: Color): Array<BoardSquare> {
  const pieces = placement(fen)
  return squaresFor(orientation).map((square) => ({
    square,
    // a1 is dark, h1 light: file index + rank is odd on the dark squares.
    light: (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 0,
    piece: pieces[square] ?? null,
  }))
}

const UCI = /^([a-h][1-8])([a-h][1-8])[qrbn]?$/

/** The two squares of a UCI move (`e7e8q` → e7, e8), or null when there is no usable move. */
export function uciSquares(uci: string | null | undefined): SquarePair | null {
  const m = uci ? UCI.exec(uci) : null
  return m?.[1] && m[2] ? { from: m[1], to: m[2] } : null
}
