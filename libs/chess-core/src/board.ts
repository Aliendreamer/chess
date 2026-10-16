import { Chess } from 'chess.js'
import type { Square } from 'chess.js'

/**
 * The board's rules without a board: which squares a picked piece may go to, whether a move needs a promotion choice,
 * the position after a move, click-to-move and click-to-premove, check, material and replaying a game. chess.js
 * underneath; in the club this is feedback only (D3) — the server's answer or next frame replaces what is shown.
 */

export type Color = 'white' | 'black'

/** The board themes a player may pick (board-look); Brown is the default. */
export const BOARD_THEMES = ['brown', 'blue', 'green', 'slate', 'walnut'] as const
export type BoardTheme = (typeof BOARD_THEMES)[number]

export const ANIMATIONS = ['off', 'fast', 'normal'] as const
export type Animation = (typeof ANIMATIONS)[number]
export const SITE_THEMES = ['dark', 'light'] as const
export type SiteTheme = (typeof SITE_THEMES)[number]
export const PIECE_SETS = ['cburnett'] as const

/** A player's display preferences (user-preferences): the club's `GET api/me/preferences`, the desktop's settings. */
export interface Preferences {
  boardTheme: BoardTheme
  pieceSet: (typeof PIECE_SETS)[number]
  animation: Animation
  coordinates: boolean
  siteTheme: SiteTheme
}

export const DEFAULT_PREFERENCES: Preferences = {
  boardTheme: 'brown',
  pieceSet: 'cburnett',
  animation: 'normal',
  coordinates: true,
  siteTheme: 'dark',
}

const ANIMATION_MS: Record<Animation, number> = { off: 0, fast: 120, normal: 200 }

export function animationMs(animation: Animation): number {
  return ANIMATION_MS[animation]
}

export function isPreferences(value: unknown): value is Preferences {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const one = (allowed: ReadonlyArray<string>, x: unknown) =>
    typeof x === 'string' && allowed.includes(x)
  return (
    one(BOARD_THEMES, v['boardTheme']) &&
    one(PIECE_SETS, v['pieceSet']) &&
    one(ANIMATIONS, v['animation']) &&
    typeof v['coordinates'] === 'boolean' &&
    one(SITE_THEMES, v['siteTheme'])
  )
}

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

export interface SquarePair {
  from: string
  to: string
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

const UCI = /^([a-h][1-8])([a-h][1-8])[qrbn]?$/

/** The two squares of a UCI move (`e7e8q` → e7, e8), or null when there is no usable move. */
export function uciSquares(uci: string | null | undefined): SquarePair | null {
  const m = uci ? UCI.exec(uci) : null
  return m?.[1] && m[2] ? { from: m[1], to: m[2] } : null
}
