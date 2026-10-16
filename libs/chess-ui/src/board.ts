import { checkSquare, placement } from '@chess/core'
import bB from './pieces/bB.svg?url'
import bK from './pieces/bK.svg?url'
import bN from './pieces/bN.svg?url'
import bP from './pieces/bP.svg?url'
import bQ from './pieces/bQ.svg?url'
import bR from './pieces/bR.svg?url'
import wB from './pieces/wB.svg?url'
import wK from './pieces/wK.svg?url'
import wN from './pieces/wN.svg?url'
import wP from './pieces/wP.svg?url'
import wQ from './pieces/wQ.svg?url'
import wR from './pieces/wR.svg?url'
import type { CSSProperties } from 'react'
import type { Piece, SquarePair } from '@chess/core'

/**
 * What the board shows on top of the position (board-look): lichess-style highlights as react-chessboard square
 * styles, and the premove rule. The colours are theme variables from `theme.css`, so a board theme changes them all.
 */

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

/** The Cburnett pieces (Wikimedia, BSD-3; see apps/frontend/ATTRIBUTION.md), bundled by each app as assets. */
const PIECES: Record<string, string> = { bB, bK, bN, bP, bQ, bR, wB, wK, wN, wP, wQ, wR }

export function pieceSrc(color: Piece['color'], type: Piece['type']): string {
  return PIECES[`${color}${type.toUpperCase()}`]!
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
