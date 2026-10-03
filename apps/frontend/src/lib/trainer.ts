import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { STANDARD_START } from './studies'
import { clickSquare, legalTargets, needsPromotion } from './moveInput'

/**
 * The opening trainer (opening-trainer): its API shapes and the drill — the board plays the other side of a named line,
 * the member plays theirs, a wrong move is shown with the right one and counted. Client-safe; the reads are in
 * `lib/server/trainer.ts`.
 */

export type TrainerColor = 'white' | 'black'

/** One line of a family with the member's progress on it (box null = never trained). */
export interface TrainerLine {
  key: string
  name: string
  eco: string
  moves: Array<string>
  box: number | null
  dueAt: string | null
}

export interface FamilyProgress {
  name: string
  lines: number
  learned: number
}

export interface NextLine {
  line: TrainerLine | null
  /** When nothing is due: when the next line is. */
  nextDueAt: string | null
}

export interface RunResult {
  lineKey: string
  box: number
  dueAt: string
  learned: boolean
}

export interface TrainedFamily {
  name: string
  color: TrainerColor
  lines: number
  learned: number
}

/** From box 3 a line counts as learned (the server's rule, mirrored for the labels). */
export const LEARNED_BOX = 3

export function lineState(line: Pick<TrainerLine, 'box'>): 'new' | 'learning' | 'learned' {
  if (line.box === null) return 'new'
  return line.box >= LEARNED_BOX ? 'learned' : 'learning'
}

export function isColor(value: unknown): value is TrainerColor {
  return value === 'white' || value === 'black'
}

/** White plays the even plies. */
export function isMemberMove(ply: number, color: TrainerColor): boolean {
  return (ply % 2 === 0) === (color === 'white')
}

/** A move is the line's when its UCI is, promotion piece included. */
export function matches(played: string, expected: string): boolean {
  return played.toLowerCase() === expected.toLowerCase()
}

/** The position after the line's first `ply` moves. */
export function fenAfter(moves: ReadonlyArray<string>, ply: number): string {
  const board = new Chess(STANDARD_START)
  for (const uci of moves.slice(0, ply)) {
    const promotion = uci[4]
    board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(promotion ? { promotion } : {}) })
  }
  return board.fen()
}

/** A move of the line in notation, numbered (`3...Nf6`), for the feedback. */
export function sanAt(moves: ReadonlyArray<string>, ply: number, uci = moves[ply] ?? ''): string {
  try {
    const board = new Chess(fenAfter(moves, ply))
    const promotion = uci[4]
    const m = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(promotion ? { promotion } : {}),
    })
    const number = Math.floor(ply / 2) + 1
    return `${number}${ply % 2 === 0 ? '.' : '...'}${m.san}`
  } catch {
    return uci
  }
}

/** The line's first `ply` moves in numbered notation: "1.e4 e5 2.Nf3". */
export function lineText(moves: ReadonlyArray<string>, ply: number): string {
  return moves
    .slice(0, ply)
    .map((_, i) => {
      const san = sanAt(moves, i)
      return i % 2 === 0 ? san : san.replace(/^\d+\.\.\./, '')
    })
    .join(' ')
}

export interface Drill {
  ply: number
  fen: string
  yourMove: boolean
  wrong: { played: string; expected: string } | null
  mistakes: number
  done: boolean
  /** The member's move, as UCI; ignored while it is not their turn. */
  play: (uci: string) => void
  /** Board input, as on the study board: click-to-move, drag, and the promotion choice. */
  selected: string | null
  promotion: { from: string; to: string } | null
  onSquareClick: (square: string) => void
  onDrop: (from: string, to: string) => boolean
  pickPromotion: (piece: 'q' | 'r' | 'b' | 'n') => void
  cancelPromotion: () => void
}

/**
 * One run through a line: the board plays the other side `delayMs` after it is its turn; the member's moves are checked
 * against the line, a wrong one stays shown (and counted) until the right one is played. `onDone(mistakes)` is called
 * once when the line ends. A new line needs a new hook (key the component by the line).
 */
export function useDrill(
  line: TrainerLine,
  color: TrainerColor,
  onDone: (mistakes: number) => void,
  delayMs = 400,
): Drill {
  const [ply, setPly] = useState(0)
  const [wrong, setWrong] = useState<Drill['wrong']>(null)
  const [mistakes, setMistakes] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<Drill['promotion']>(null)
  const finished = useRef(false)
  const done = ply >= line.moves.length
  const yourMove = !done && isMemberMove(ply, color)

  useEffect(() => {
    if (done || yourMove) return
    const timer = setTimeout(() => setPly((p) => p + 1), delayMs)
    return () => clearTimeout(timer)
  }, [ply, done, yourMove, delayMs])

  useEffect(() => {
    if (done && !finished.current) {
      finished.current = true
      onDone(mistakes)
    }
  }, [done, mistakes, onDone])

  function play(uci: string) {
    if (!yourMove) return
    const expected = line.moves[ply]!
    if (matches(uci, expected)) {
      setWrong(null)
      setPly(ply + 1)
    } else {
      setWrong({ played: uci, expected })
      setMistakes((m) => m + 1)
    }
  }

  const fen = fenAfter(line.moves, ply)
  const mine = color === 'white' ? 'w' : 'b'

  return {
    ply,
    fen,
    yourMove,
    wrong,
    mistakes,
    done,
    play,
    selected,
    promotion,
    onSquareClick: (square) => {
      if (!yourMove) return
      const result = clickSquare(fen, mine, selected, square)
      setSelected(result.selected)
      if (!result.move) return
      if (needsPromotion(fen, result.move.from, result.move.to)) setPromotion(result.move)
      else play(`${result.move.from}${result.move.to}`)
    },
    onDrop: (from, to) => {
      setSelected(null)
      if (!yourMove || !legalTargets(fen, from).includes(to)) return false
      if (needsPromotion(fen, from, to)) {
        setPromotion({ from, to })
        return false
      }
      play(`${from}${to}`)
      // A wrong move goes back: the board keeps the line's position.
      return matches(`${from}${to}`, line.moves[ply]!)
    },
    pickPromotion: (piece) => {
      if (!promotion) return
      setPromotion(null)
      play(`${promotion.from}${promotion.to}${piece}`)
    },
    cancelPromotion: () => setPromotion(null),
  }
}
