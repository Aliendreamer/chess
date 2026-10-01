import { Chess } from 'chess.js'
import { applyOptimistic, needsPromotion, placement } from './moveInput'
import type { CSSProperties } from 'react'
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
