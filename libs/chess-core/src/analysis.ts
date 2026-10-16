import { playMove } from './tree.ts'
import type { StudyMove } from './tree.ts'

/**
 * Engine analysis without the transport (engine-analysis D1, D5): think levels, the position key evaluations are
 * stored under, scores as text, an engine line as tree moves, and which of two evaluations to keep.
 */
/** The think times a request may name (the API's `ThinkLevels`). */
export const THINK_LEVELS = ['quick', 'normal', 'deep'] as const
export type Think = (typeof THINK_LEVELS)[number]

export const THINKS: ReadonlyArray<{ value: Think; label: string }> = [
  { value: 'quick', label: 'Quick' },
  { value: 'normal', label: 'Normal' },
  { value: 'deep', label: 'Deep' },
]

/** One of the engine's lines, scored from White's side: centipawns, or mate in N (negative when Black mates). */
export interface EvaluationLine {
  cp: number | null
  mate: number | null
  pv: Array<string>
}

export interface Evaluation {
  thinkMs: number
  depth: number
  lines: Array<EvaluationLine>
}

/**
 * The cache key of a position, as the API makes it (D1): placement, side, castling and en passant, the square kept
 * only when a pawn of the side to move can take there. It lets the board find a position's evaluation whichever
 * library wrote its FEN.
 */
export function positionKey(fen: string): string {
  const [placement = '', side = 'w', castling = '-', ep = '-'] = fen.split(' ')
  return [
    placement,
    side,
    castling,
    ep !== '-' && canTakeEnPassant(placement, side, ep) ? ep : '-',
  ].join(' ')
}

function canTakeEnPassant(placement: string, side: string, square: string): boolean {
  const rows = placement.split('/')
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
  const row = rows[side === 'w' ? 3 : 4] // White takes from the 5th rank, Black from the 4th
  if (rows.length !== 8 || !row || square.length !== 2) return false
  const squares = [...row].flatMap((c) => (/\d/.test(c) ? Array<string>(Number(c)).fill('.') : [c]))
  const pawn = side === 'w' ? 'P' : 'p'
  return squares[file - 1] === pawn || squares[file + 1] === pawn
}

/** `+0.35`, `-1.20`, `0.00`, or `#3` / `#-2` for a mate. */
export function scoreText(line: Pick<EvaluationLine, 'cp' | 'mate'>): string {
  if (line.mate !== null) return `#${line.mate}`
  const cp = line.cp ?? 0
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`
}

/** A line's moves as tree nodes (SAN and FEN from chess.js), at most `max`; it stops at a move chess.js refuses. */
export function lineMoves(fen: string, pv: ReadonlyArray<string>, max = 10): Array<StudyMove> {
  const moves: Array<StudyMove> = []
  let at = fen
  for (const uci of pv.slice(0, max)) {
    const move = playMove(at, uci)
    if (!move) break
    moves.push(move)
    at = move.fen
  }
  return moves
}

/** Known evaluations by position key; a longer think replaces a shorter one, never the other way round. */
export function remember(
  known: ReadonlyMap<string, Evaluation>,
  answer: { key: string; evaluation: Evaluation | null },
): ReadonlyMap<string, Evaluation> {
  const had = known.get(answer.key)
  if (!answer.evaluation || (had && had.thinkMs > answer.evaluation.thinkMs)) return known
  return new Map(known).set(answer.key, answer.evaluation)
}
