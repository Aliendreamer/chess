import { useEffect, useRef, useState } from 'react'
import { playMove } from './studies'
import type { CommandOutcome } from './games'
import type { StudyMove } from './studies'

/**
 * Engine analysis on the study board (engine-analysis D5): the wire shapes of `POST /api/analysis`, the pure rules the
 * panel shows them with, and the hook that asks and polls. One position at a time: the one on the board. Client-safe.
 * Evaluations are shared by everyone (D1), so a position someone else analysed is answered at once.
 */

export type Think = 'quick' | 'normal' | 'deep'

export const THINKS: ReadonlyArray<{ value: Think; label: string }> = [
  { value: 'quick', label: 'Quick' },
  { value: 'normal', label: 'Normal' },
  { value: 'deep', label: 'Deep' },
]

/** How often the board asks again while the engine is still working on the position. */
export const POLL_MS = 1500

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

/** `POST /api/analysis`: the position, with its evaluation once one at this think time or longer is known. */
export interface AnalysisView {
  key: string
  fen: string
  think: Think
  thinkMs: number
  evaluation: Evaluation | null
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
  answer: Pick<AnalysisView, 'key' | 'evaluation'>,
): ReadonlyMap<string, Evaluation> {
  const had = known.get(answer.key)
  if (!answer.evaluation || (had && had.thinkMs > answer.evaluation.thinkMs)) return known
  return new Map(known).set(answer.key, answer.evaluation)
}

export interface Analysis {
  think: Think
  setThink: (think: Think) => void
  /** The best evaluation known for a position, at any think time. */
  evaluationOf: (fen: string) => Evaluation | null
  /** Asks for this position at the chosen think time; the board polls until it is known. */
  analyse: (fen: string) => void
  /** The engine is working on the position asked for. */
  thinking: boolean
  error: string | null
}

/**
 * Asks, then polls every {@link POLL_MS} until the evaluation is there or the page leaves. Asking for another position
 * replaces the one being waited for; evaluations already known stay (they score the move tree).
 */
export function useAnalysis(
  request: (input: { fen: string; think: Think }) => Promise<CommandOutcome<AnalysisView>>,
): Analysis {
  const [think, setThink] = useState<Think>('normal')
  const [known, setKnown] = useState<ReadonlyMap<string, Evaluation>>(new Map())
  const [waiting, setWaiting] = useState<{ fen: string; think: Think; gen: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  async function ask(fen: string, at: Think, gen: number) {
    try {
      const outcome = await request({ fen, think: at })
      if (gen !== generation.current) return
      if (!outcome.ok) {
        setError(outcome.error)
        setWaiting(null)
        return
      }
      setKnown((k) => remember(k, outcome.view))
      setWaiting(outcome.view.evaluation ? null : { fen, think: at, gen })
    } catch (e) {
      if (gen !== generation.current) return
      setError(e instanceof Error ? e.message : 'The analysis failed.')
      setWaiting(null)
    }
  }

  // Each answer without an evaluation sets a new `waiting`, which schedules the next ask.
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => void ask(waiting.fen, waiting.think, waiting.gen), POLL_MS)
    return () => clearTimeout(timer)
  }, [waiting])

  return {
    think,
    setThink,
    evaluationOf: (fen) => known.get(positionKey(fen)) ?? null,
    analyse: (fen) => {
      const gen = ++generation.current
      setError(null)
      setWaiting({ fen, think, gen })
      void ask(fen, think, gen)
    },
    thinking: waiting !== null,
    error,
  }
}
