import { useEffect, useRef, useState } from 'react'
import { playMove } from './studies'
import type { CommandOutcome } from './games'
import type { StudyMove } from './studies'

/**
 * Engine analysis on the study board (engine-analysis D5): the wire shapes of `POST /api/analysis`, the pure rules the
 * panel shows them with, and the hook that asks and polls. Client-safe. Evaluations are shared by everyone (D1), so a
 * position someone else analysed is answered at once.
 */

export type Think = 'quick' | 'normal' | 'deep'

export const THINKS: ReadonlyArray<{ value: Think; label: string }> = [
  { value: 'quick', label: 'Quick' },
  { value: 'normal', label: 'Normal' },
  { value: 'deep', label: 'Deep' },
]

/** How often the board asks again for positions the engine is still working on. */
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

export interface PositionAnswer {
  key: string
  fen: string
  evaluation: Evaluation | null
}

export interface AnalysisView {
  think: Think
  thinkMs: number
  positions: Array<PositionAnswer>
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
export function mergeEvaluations(
  known: ReadonlyMap<string, Evaluation>,
  answers: ReadonlyArray<PositionAnswer>,
): Map<string, Evaluation> {
  const next = new Map(known)
  for (const { key, evaluation } of answers) {
    const had = next.get(key)
    if (evaluation && (!had || evaluation.thinkMs >= had.thinkMs)) next.set(key, evaluation)
  }
  return next
}

/** The positions of a request still waiting for the engine, each once. */
export function stillPending(answers: ReadonlyArray<PositionAnswer>): Array<string> {
  const seen = new Set<string>()
  return answers
    .filter((a) => !a.evaluation && !seen.has(a.key) && seen.add(a.key))
    .map((a) => a.fen)
}

export interface Analysis {
  think: Think
  setThink: (think: Think) => void
  /** The best evaluation known for a position, at any think time. */
  evaluationOf: (fen: string) => Evaluation | null
  /** Asks for these positions at the chosen think time; the board polls until each is known. */
  analyse: (fens: ReadonlyArray<string>) => void
  /** `done of total` for the last request while positions are pending; null otherwise. */
  progress: { done: number; total: number } | null
  busy: boolean
  error: string | null
}

/**
 * Asks, then polls every {@link POLL_MS} for the positions still pending, until all are known or the page leaves. A
 * new request replaces the one being polled.
 */
export function useAnalysis(
  request: (input: {
    positions: Array<string>
    think: Think
  }) => Promise<CommandOutcome<AnalysisView>>,
): Analysis {
  const [think, setThink] = useState<Think>('normal')
  const [known, setKnown] = useState<ReadonlyMap<string, Evaluation>>(new Map())
  const [job, setJob] = useState<{ total: number; pending: Array<string>; think: Think } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)

  async function ask(fens: Array<string>, at: Think, total: number, gen: number) {
    try {
      const outcome = await request({ positions: fens, think: at })
      if (gen !== generation.current) return
      if (!outcome.ok) {
        setError(outcome.error)
        setJob(null)
        return
      }
      setKnown((k) => mergeEvaluations(k, outcome.view.positions))
      const pending = stillPending(outcome.view.positions)
      setJob(pending.length > 0 ? { total, pending, think: at } : null)
    } catch (e) {
      if (gen !== generation.current) return
      setError(e instanceof Error ? e.message : 'The analysis failed.')
      setJob(null)
    }
  }

  useEffect(() => {
    if (!job) return
    const gen = generation.current
    const timer = setTimeout(() => void ask(job.pending, job.think, job.total, gen), POLL_MS)
    return () => clearTimeout(timer)
  }, [job])

  async function analyse(fens: ReadonlyArray<string>) {
    const gen = ++generation.current
    const distinct = [...new Map(fens.map((f) => [positionKey(f), f])).values()]
    setError(null)
    setJob(null)
    setBusy(true)
    try {
      await ask(distinct, think, distinct.length, gen)
    } finally {
      if (gen === generation.current) setBusy(false)
    }
  }

  return {
    think,
    setThink,
    evaluationOf: (fen) => known.get(positionKey(fen)) ?? null,
    analyse: (fens) => void analyse(fens),
    progress: job ? { done: job.total - job.pending.length, total: job.total } : null,
    busy,
    error,
  }
}
