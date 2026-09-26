import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import type { Color } from './games'

/**
 * chess.js, for feedback only (D3): which squares a picked piece may go to, whether a move needs a promotion
 * choice, and the position to show while the server answers. None of this is authoritative — the move is always
 * posted, and the server's answer or next frame replaces whatever is shown here.
 */

export interface Piece {
  color: 'w' | 'b'
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
}

const FILES = 'abcdefgh'

function load(fen: string): Chess | null {
  try {
    return new Chess(fen)
  } catch {
    return null
  }
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value)
}

export function pieceAt(fen: string, square: string): Piece | null {
  const game = load(fen)
  if (!game || !isSquare(square)) return null
  const piece = game.get(square)
  return piece ? { color: piece.color, type: piece.type } : null
}

/** Target squares for the piece on `from`, sorted; empty when it isn't the side to move's piece. */
export function legalTargets(fen: string, from: string): Array<string> {
  const game = load(fen)
  if (!game || !isSquare(from)) return []
  const targets = new Set(game.moves({ square: from, verbose: true }).map((m) => m.to))
  return [...targets].sort()
}

export function needsPromotion(fen: string, from: string, to: string): boolean {
  const game = load(fen)
  if (!game || !isSquare(from)) return false
  return game
    .moves({ square: from, verbose: true })
    .some((m) => m.to === to && m.promotion !== undefined)
}

/** The FEN after `uci` (`e2e4`, `e7e8q`), or null when chess.js thinks it is illegal. */
export function applyOptimistic(fen: string, uci: string): string | null {
  const game = load(fen)
  const match = /^([a-h][1-8])([a-h][1-8])([nbrq])?$/.exec(uci)
  if (!game || !match) return null
  try {
    game.move({
      from: match[1] as Square,
      to: match[2] as Square,
      ...(match[3] ? { promotion: match[3] } : {}),
    })
    return game.fen()
  } catch {
    return null
  }
}

/** The 64 squares in reading order (top-left first) as seen from `side`. */
export function squaresFor(side: Color): Array<string> {
  const squares: Array<string> = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const file = side === 'white' ? col : 7 - col
      const rank = side === 'white' ? 8 - row : row + 1
      squares.push(`${FILES[file]}${rank}`)
    }
  }
  return squares
}

const PIECE_LETTER = /^[pnbrqkPNBRQK]$/

/** A FEN's placement field as `square → piece`, without chess.js: the board renders every frame with it. */
export function placement(fen: string): Record<string, Piece> {
  const board: Record<string, Piece> = {}
  const rows = (fen.split(' ')[0] ?? '').split('/')
  rows.forEach((row, r) => {
    let file = 0
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch)
      } else if (PIECE_LETTER.test(ch)) {
        const color = ch === ch.toUpperCase() ? 'w' : 'b'
        board[`${FILES[file]}${8 - r}`] = { color, type: ch.toLowerCase() as Piece['type'] }
        file += 1
      }
    }
  })
  return board
}

export interface ClickResult {
  selected: string | null
  /** Set when the click completes a move from the selected piece. */
  move: { from: string; to: string } | null
}

/**
 * Click-to-move: a click on your own piece selects it (or switches to it); a click on one of its legal targets
 * completes the move; any other click clears the selection. `mine` is the viewer's colour; when it is not their
 * turn nothing is selectable.
 */
export function clickSquare(
  fen: string,
  mine: 'w' | 'b',
  selected: string | null,
  square: string,
): ClickResult {
  const toMove = fen.split(' ')[1]
  if (toMove !== mine) return { selected: null, move: null }
  if (selected && selected !== square && legalTargets(fen, selected).includes(square)) {
    return { selected: null, move: { from: selected, to: square } }
  }
  const piece = placement(fen)[square]
  if (piece?.color === mine && selected !== square) return { selected: square, move: null }
  return { selected: null, move: null }
}
