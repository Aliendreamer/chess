import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import type { CommandOutcome } from './games'

/**
 * Game review (game-review): the API's shapes, the marks and scores as shown, the graph's points and the review's
 * polling. Client-safe; the reads are in `lib/server/review.ts`.
 */

export type MoveClass = 'none' | 'inaccuracy' | 'mistake' | 'blunder'

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

export interface BookExit {
  ply: number
  san: string
  color: 'white' | 'black'
  eco: string
  name: string
}

export interface ReviewView {
  status: 'none' | 'running' | 'complete'
  evaluated: number
  positions: number
  moves: Array<ReviewedMove>
  white: ReviewCounts
  black: ReviewCounts
  bookExit: BookExit | null
}

/** How often a running review is asked again. */
export const REVIEW_POLL_MS = 2000

const MARKS: Record<MoveClass, string> = { none: '', inaccuracy: '?!', mistake: '?', blunder: '??' }

export function markOf(cls: MoveClass | null): string {
  return cls ? MARKS[cls] : ''
}

/** One mark per ply, for the move list. */
export function marksFor(moves: ReadonlyArray<ReviewedMove>): Array<string> {
  return moves.map((m) => markOf(m.class))
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

/** Which of the engine's moves is on the board: the reviewed ply and how many of its line's moves are played. */
export interface PreviewState {
  ply: number
  upTo: number
}

export interface LinePreview {
  fen: string
  lastMove: { from: string; to: string } | null
}

/**
 * The engine's better line on the board (game-review): from the position before the reviewed move, its first `upTo`
 * SAN moves played (as far as they are legal). The board shows this instead of the game while the user looks at it.
 */
export function previewLine(
  fenBefore: string,
  line: ReadonlyArray<string>,
  upTo: number,
): LinePreview {
  const board = new Chess(fenBefore)
  let lastMove: LinePreview['lastMove'] = null
  for (const san of line.slice(0, upTo)) {
    try {
      const move = board.move(san)
      lastMove = { from: move.from, to: move.to }
    } catch {
      break
    }
  }
  return { fen: board.fen(), lastMove }
}

/** "White is better", "Black is winning", "Equal": the score in words, for the review's evaluation line. */
export function advantageText(m: Pick<ReviewedMove, 'cp' | 'mate'>): string {
  if (m.mate !== null) return m.mate > 0 ? 'White mates' : 'Black mates'
  if (m.cp === null) return ''
  const side = m.cp > 0 ? 'White' : 'Black'
  const pawns = Math.abs(m.cp)
  if (pawns < 30) return 'Equal'
  if (pawns < 100) return `${side} is slightly better`
  if (pawns < 300) return `${side} is better`
  return `${side} is winning`
}

/** A move as written in text: "7.Nf3", "7...Bd6". */
export function moveLabel(ply: number, san: string): string {
  const number = Math.ceil(ply / 2)
  return ply % 2 === 1 ? `${number}.${san}` : `${number}...${san}`
}

const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`)

/** "+0.35", "−1.20", "#−2" from White's side; the result after a board ending; "…" while unknown. */
export function scoreLabel(m: Pick<ReviewedMove, 'cp' | 'mate' | 'chances'>): string {
  if (m.mate !== null) return `#${minus(m.mate)}`
  if (m.cp !== null) {
    const pawns = (m.cp / 100).toFixed(2)
    return m.cp > 0 ? `+${pawns}` : m.cp < 0 ? `−${pawns.slice(1)}` : '0.00'
  }
  if (m.chances === 1) return '1–0'
  if (m.chances === -1) return '0–1'
  if (m.chances === 0) return '½–½'
  return '…'
}

export interface GraphPoint {
  ply: number
  x: number
  y: number
}

/** The evaluation graph: White's chances up, the start at the middle, moves not evaluated yet left out. */
export function graphPoints(
  moves: ReadonlyArray<ReviewedMove>,
  width: number,
  height: number,
): Array<GraphPoint> {
  const step = moves.length === 0 ? 0 : width / moves.length
  const y = (chances: number) => Math.round(((1 - chances) / 2) * height * 100) / 100
  const points: Array<GraphPoint> = [{ ply: 0, x: 0, y: y(0) }]
  for (const m of moves) {
    if (m.chances === null) continue
    points.push({ ply: m.ply, x: Math.round(m.ply * step * 100) / 100, y: y(m.chances) })
  }
  return points
}

/** The trainer for the opening the member left (opening-trainer), or null when the other player left it. */
export function bookLink(
  exit: BookExit,
  mine: 'white' | 'black' | null,
): { family: string; color: 'white' | 'black' } | null {
  if (exit.color !== mine) return null
  return { family: exit.name.split(':')[0]!.trim(), color: exit.color }
}

/**
 * A game's review on its page: loaded once `enabled` (the game has ended) when there is none yet, polled every
 * `pollMs` while running and the tab is visible, stopped once complete. `start` asks for the review (or asks again
 * for lost positions).
 */
export function useReview(
  initial: ReviewView | null,
  load: () => Promise<ReviewView | null>,
  start: () => Promise<CommandOutcome<ReviewView>>,
  pollMs = REVIEW_POLL_MS,
  enabled = true,
): {
  view: ReviewView | null
  busy: boolean
  error: string | null
  start: () => Promise<void>
} {
  const [view, setView] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = view?.status === 'running'
  const missing = view === null

  useEffect(() => {
    if (!enabled || !missing) return
    let live = true
    load()
      .then((next) => {
        if (live && next) setView(next)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [enabled, missing, load])

  useEffect(() => {
    if (!running) return
    let live = true
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      load()
        .then((next) => {
          if (live && next) setView(next)
        })
        .catch(() => undefined)
    }, pollMs)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [running, load, pollMs])

  return {
    view,
    busy,
    error,
    start: async () => {
      setBusy(true)
      setError(null)
      try {
        const outcome = await start()
        if (outcome.ok) setView(outcome.view)
        else setError(outcome.error)
      } finally {
        setBusy(false)
      }
    },
  }
}
