import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { clickSquare, legalTargets, needsPromotion } from './moveInput'
import type { CommandOutcome } from './games'

/**
 * Game review (game-review): the API's shapes, the marks and scores as shown, the graph's points, the review's polling,
 * and the practice answer check. Client-safe; the reads are in `lib/server/review.ts`.
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

export interface PracticeItem {
  gameId: string
  ply: number
  fen: string
  playedUci: string
  playedSan: string
  acceptedUci: Array<string>
  bestLine: Array<string>
  class: 'mistake' | 'blunder'
  box: number
  white: string
  black: string
  playedAt: string | null
}

export interface PracticeNext {
  item: PracticeItem | null
  nextDueAt: string | null
}

export interface PracticeResult {
  box: number
  dueAt: string
  learned: boolean
}

export interface PracticeSummary {
  positions: number
  learned: number
  due: number
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

export function isAccepted(uci: string, accepted: ReadonlyArray<string>): boolean {
  return accepted.some((a) => a.toLowerCase() === uci.toLowerCase())
}

/** The side the member plays in a practice position: the side to move. */
export function practiceSide(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
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

export interface PracticeBoard {
  /** The member's move and whether the engine accepts it; null until they play (or ask for the answer). */
  answer: { uci: string | null; correct: boolean } | null
  selected: string | null
  promotion: { from: string; to: string } | null
  onSquareClick: (square: string) => void
  onDrop: (from: string, to: string) => boolean
  pickPromotion: (piece: 'q' | 'r' | 'b' | 'n') => void
  cancelPromotion: () => void
  /** "Show answer": counts as a wrong answer. */
  reveal: () => void
}

/**
 * One practice position on the board: the first move played is the answer (checked against the engine's accepted
 * moves) and `onAnswer` is called once with it. A new position needs a new hook (key the component by it).
 */
export function usePracticeBoard(
  item: Pick<PracticeItem, 'fen' | 'acceptedUci'>,
  onAnswer: (correct: boolean) => void,
): PracticeBoard {
  const [answer, setAnswer] = useState<PracticeBoard['answer']>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<PracticeBoard['promotion']>(null)
  const mine = practiceSide(item.fen) === 'white' ? 'w' : 'b'

  function play(uci: string | null) {
    if (answer) return
    const correct = uci !== null && isAccepted(uci, item.acceptedUci)
    setAnswer({ uci, correct })
    onAnswer(correct)
  }

  return {
    answer,
    selected,
    promotion,
    onSquareClick: (square) => {
      if (answer) return
      const result = clickSquare(item.fen, mine, selected, square)
      setSelected(result.selected)
      if (!result.move) return
      if (needsPromotion(item.fen, result.move.from, result.move.to)) setPromotion(result.move)
      else play(`${result.move.from}${result.move.to}`)
    },
    onDrop: (from, to) => {
      setSelected(null)
      if (answer || !legalTargets(item.fen, from).includes(to)) return false
      if (needsPromotion(item.fen, from, to)) {
        setPromotion({ from, to })
        return false
      }
      play(`${from}${to}`)
      return false // the board keeps the position: the answer is shown beside it
    },
    pickPromotion: (piece) => {
      if (!promotion) return
      setPromotion(null)
      play(`${promotion.from}${promotion.to}${piece}`)
    },
    cancelPromotion: () => setPromotion(null),
    reveal: () => play(null),
  }
}
