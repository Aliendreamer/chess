import { Chess } from 'chess.js'
import { positionKey } from './analysis.ts'
import { STANDARD_START } from './tree.ts'
import type { Evaluation, EvaluationLine } from './analysis.ts'

/**
 * The engine review of a finished game (game-review D1, D4, D5), pure: every move judged by the winning chances it loses
 * against the engine's best move (lichess's scale), the book exit, and a player's mistakes as practice. Ported from the
 * backend's `Review/GameReviewer` and held to its cases by the tests.
 */

export type MoveClass = 'none' | 'inaccuracy' | 'mistake' | 'blunder'

/** One move of the game: its ply (1 = White's first), the move and the position after it. */
export interface ReviewMove {
  ply: number
  uci: string
  san: string
  fenAfter: string
}

export interface OpeningName {
  eco: string
  name: string
}

/** A finished game and what is known about its positions: evaluations and opening names by position key. */
export interface ReviewInput {
  moves: ReadonlyArray<ReviewMove>
  /** As PGN writes it: `1-0`, `0-1`, `1/2-1/2`. */
  result: string | null
  /** How it ended (`Checkmate` as the backend names it, or `checkmate` as the apps do). */
  reason: string | null
  evaluations: ReadonlyMap<string, Evaluation>
  openings: ReadonlyMap<string, OpeningName>
}

export interface ReviewedMove {
  ply: number
  uci: string
  san: string
  /** The score after the move, from White's side (null until evaluated, or decided by the result). */
  cp: number | null
  mate: number | null
  /** White's winning chances after the move, −1…1. */
  chances: number | null
  bestUci: string | null
  bestSan: string | null
  /** The engine's line from the position before the move, in SAN. */
  line: Array<string>
  /** Null until both positions are evaluated. */
  class: MoveClass | null
}

export interface ReviewCounts {
  inaccuracies: number
  mistakes: number
  blunders: number
}

/** The first move that left every named opening line, by whom, and the last opening the game was in. */
export interface BookExit {
  ply: number
  san: string
  color: 'white' | 'black'
  eco: string
  name: string
}

export interface ReviewResult {
  evaluated: number
  positions: number
  moves: Array<ReviewedMove>
  white: ReviewCounts
  black: ReviewCounts
  bookExit: BookExit | null
}

/** A position the review still needs from the engine. */
export interface ReviewPosition {
  key: string
  fen: string
}

/** A player's mistake, as training keeps it (game-review D7, training D2). */
export interface PracticePosition {
  ply: number
  fen: string
  playedUci: string
  playedSan: string
  acceptedUci: Array<string>
  bestLine: Array<string>
  class: 'mistake' | 'blunder'
}

/** A move the engine rates this close to its best is as good as its best (practice answers). */
export const TOLERANCE = 0.1

/** The engine moves shown after the better move. */
const LINE_LENGTH = 6

/** Endings decided on the board: the last position is judged from the result, never by the engine. */
const BOARD_ENDINGS = new Set([
  'checkmate',
  'stalemate',
  'insufficientmaterial',
  'threefoldrepetition',
  'fiftymoverule',
])

const MARKS: Record<MoveClass, string> = { none: '', inaccuracy: '?!', mistake: '?', blunder: '??' }

export function markOf(cls: MoveClass | null): string {
  return cls ? MARKS[cls] : ''
}

/** One mark per ply, for the move list. */
export function marksFor(moves: ReadonlyArray<Pick<ReviewedMove, 'class'>>): Array<string> {
  return moves.map((m) => markOf(m.class))
}

/** White's winning chances on −1…1: a logistic of the centipawns (lichess's constant); a mate is certain. */
export function chances(line: Pick<EvaluationLine, 'cp' | 'mate'>): number {
  if (line.mate !== null) return line.mate > 0 ? 1 : -1
  return 2 / (1 + Math.exp(-0.00368208 * (line.cp ?? 0))) - 1
}

/** The side to move's winning chances: what the gap between two lines and an answer's tolerance are measured in. */
export function chancesFor(line: Pick<EvaluationLine, 'cp' | 'mate'>, white: boolean): number {
  return (white ? 1 : -1) * chances(line)
}

/**
 * The engine's lines' first moves that are as good as its best (within {@link TOLERANCE}) for the side to move: every
 * one of them is a right answer. `lines` are best first.
 */
export function accepted(lines: ReadonlyArray<EvaluationLine>, white: boolean): Array<string> {
  const first = lines[0]
  if (!first) return []
  const best = chancesFor(first, white)
  return [
    ...new Set(
      lines
        .filter((l) => l.pv.length > 0 && best - chancesFor(l, white) < TOLERANCE)
        .map((l) => l.pv[0]!),
    ),
  ]
}

/** The positions the engine has yet to evaluate, once each. */
export function missing(input: ReviewInput): Array<ReviewPosition> {
  const seen = new Set<string>()
  const out: Array<ReviewPosition> = []
  for (const fen of positions(input)) {
    const key = positionKey(fen)
    if (seen.has(key)) continue
    seen.add(key)
    if (!input.evaluations.has(key)) out.push({ key, fen })
  }
  return out
}

export function review(input: ReviewInput): ReviewResult {
  const keys = new Set(positions(input).map(positionKey))
  const moves = input.moves.map((_, i) => judge(input, i))
  return {
    evaluated: [...keys].filter((k) => input.evaluations.has(k)).length,
    positions: keys.size,
    moves,
    white: count(moves.filter((m) => m.ply % 2 === 1)),
    black: count(moves.filter((m) => m.ply % 2 === 0)),
    bookExit: book(input),
  }
}

/** The mistakes and blunders of the player of `color`. */
export function practice(input: ReviewInput, color: 'white' | 'black'): Array<PracticePosition> {
  const parity = color === 'white' ? 1 : 0
  return review(input)
    .moves.filter((m) => m.ply % 2 === parity && (m.class === 'mistake' || m.class === 'blunder'))
    .map((m) => {
      const before = fenBefore(input, m.ply - 1)
      const lines = input.evaluations.get(positionKey(before))!.lines
      return {
        ply: m.ply,
        fen: before,
        playedUci: m.uci,
        playedSan: m.san,
        acceptedUci: accepted(lines, parity === 1),
        bestLine: [...lines[0]!.pv],
        class: m.class as 'mistake' | 'blunder',
      }
    })
}

/** UCI moves from a position as SAN, as far as they play. */
export function lineSans(fen: string, ucis: ReadonlyArray<string>): Array<string> {
  const board = new Chess(fen)
  const sans: Array<string> = []
  for (const uci of ucis) {
    try {
      const promotion = uci[4]
      sans.push(
        board.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          ...(promotion ? { promotion } : {}),
        }).san,
      )
    } catch {
      break
    }
  }
  return sans
}

/** The positions before each move, and the last one unless the board decided the game. */
function positions(input: ReviewInput): Array<string> {
  const n = terminal(input) ? input.moves.length : input.moves.length + 1
  return Array.from({ length: n }, (_, i) => fenBefore(input, i))
}

/** The position after `ply` moves. */
function fenBefore(input: ReviewInput, ply: number): string {
  return ply === 0 ? STANDARD_START : input.moves[ply - 1]!.fenAfter
}

function terminal(input: ReviewInput): boolean {
  // The backend names reasons `Checkmate`, the apps' wire `checkmate`: either is the same ending.
  return input.reason !== null && BOARD_ENDINGS.has(input.reason.toLowerCase())
}

function judge(input: ReviewInput, index: number): ReviewedMove {
  const move = input.moves[index]!
  const white = move.ply % 2 === 1
  const before = fenBefore(input, index)
  const best = input.evaluations.get(positionKey(before))?.lines[0] ?? null
  const after = scoreAfter(input, index)
  const bestUci = best?.pv[0] ?? null
  const line = best && bestUci ? lineSans(before, best.pv.slice(0, LINE_LENGTH)) : []

  let cls: MoveClass | null = null
  if (best && after.chances !== null) {
    const sign = white ? 1 : -1
    const loss = sign * chances(best) - sign * after.chances
    cls =
      move.uci === bestUci
        ? 'none'
        : loss >= 0.3
          ? 'blunder'
          : loss >= 0.2
            ? 'mistake'
            : loss >= 0.1
              ? 'inaccuracy'
              : 'none'
  }
  return {
    ply: move.ply,
    uci: move.uci,
    san: move.san,
    cp: after.cp,
    mate: after.mate,
    chances: after.chances,
    bestUci,
    bestSan: line[0] ?? null,
    line,
    class: cls,
  }
}

/** The score after the move: the result's for a board ending, otherwise the engine's when known. */
function scoreAfter(
  input: ReviewInput,
  index: number,
): { cp: number | null; mate: number | null; chances: number | null } {
  if (index === input.moves.length - 1 && terminal(input)) {
    if (input.result === '1-0') return { cp: null, mate: null, chances: 1 }
    if (input.result === '0-1') return { cp: null, mate: null, chances: -1 }
    return { cp: 0, mate: null, chances: 0 }
  }
  const line = input.evaluations.get(positionKey(input.moves[index]!.fenAfter))?.lines[0]
  return line
    ? { cp: line.cp, mate: line.mate, chances: chances(line) }
    : { cp: null, mate: null, chances: null }
}

function count(moves: ReadonlyArray<ReviewedMove>): ReviewCounts {
  return {
    inaccuracies: moves.filter((m) => m.class === 'inaccuracy').length,
    mistakes: moves.filter((m) => m.class === 'mistake').length,
    blunders: moves.filter((m) => m.class === 'blunder').length,
  }
}

function book(input: ReviewInput): BookExit | null {
  for (let ply = input.moves.length; ply >= 1; ply--) {
    const opening = input.openings.get(positionKey(input.moves[ply - 1]!.fenAfter))
    if (!opening) continue
    if (ply === input.moves.length) return null // the whole game is a named line
    const next = input.moves[ply]!
    return {
      ply: next.ply,
      san: next.san,
      color: next.ply % 2 === 1 ? 'white' : 'black',
      eco: opening.eco,
      name: opening.name,
    }
  }
  return null
}
