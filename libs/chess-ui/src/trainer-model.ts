import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { STANDARD_START, clickSquare, legalTargets, needsPromotion } from '@chess/core'

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

/** One of the member's studies in the trainer (study-repertoire-trainer), for one side. */
export interface StudyTraining {
  id: string
  title: string
  lines: number
  learned: number
  createdAt: string
}

/** A study line with the member's state (box null = never trained); the moves run from the study's start. */
export interface StudyLine {
  key: string
  moves: Array<string>
  box: number | null
  dueAt: string | null
}

export interface StudyDrill {
  id: string
  title: string
  startFen: string
  /** Tree order: the main line first. */
  lines: Array<StudyLine>
}

export interface NextStudyLine {
  line: StudyLine | null
  nextDueAt: string | null
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

/** The side to move and the move number at a start position (a study may start anywhere). */
function startOf(startFen: string): { whiteFirst: boolean; number: number } {
  const [, side, , , , full] = startFen.split(' ')
  return { whiteFirst: side !== 'b', number: Number(full) > 0 ? Number(full) : 1 }
}

/** Whether ply `ply` (0 = the first move from the start) is White's. */
function whiteMoves(ply: number, startFen: string): boolean {
  return (ply % 2 === 0) === startOf(startFen).whiteFirst
}

/** Whose move each ply is: White plays the even plies from the standard start. */
export function isMemberMove(ply: number, color: TrainerColor, startFen = STANDARD_START): boolean {
  return whiteMoves(ply, startFen) === (color === 'white')
}

/** A move is the line's when its UCI is, promotion piece included. */
export function matches(played: string, expected: string): boolean {
  return played.toLowerCase() === expected.toLowerCase()
}

/** The position after the line's first `ply` moves. */
export function fenAfter(
  moves: ReadonlyArray<string>,
  ply: number,
  startFen = STANDARD_START,
): string {
  const board = new Chess(startFen)
  for (const uci of moves.slice(0, ply)) {
    const promotion = uci[4]
    board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(promotion ? { promotion } : {}) })
  }
  return board.fen()
}

/** A move of the line in notation, numbered (`3...Nf6`), for the feedback. */
export function sanAt(
  moves: ReadonlyArray<string>,
  ply: number,
  uci = moves[ply] ?? '',
  startFen = STANDARD_START,
): string {
  try {
    const board = new Chess(fenAfter(moves, ply, startFen))
    const promotion = uci[4]
    const m = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(promotion ? { promotion } : {}),
    })
    const start = startOf(startFen)
    const number = start.number + Math.floor((ply + (start.whiteFirst ? 0 : 1)) / 2)
    return `${number}${whiteMoves(ply, startFen) ? '.' : '...'}${m.san}`
  } catch {
    return uci
  }
}

/** The line's first `ply` moves in numbered notation: "1.e4 e5 2.Nf3". */
export function lineText(
  moves: ReadonlyArray<string>,
  ply: number,
  startFen = STANDARD_START,
): string {
  return movesText(moves, 0, ply, startFen)
}

/** Moves `from`–`to` in numbered notation; the first one shown keeps its number even when it is Black's. */
function movesText(
  moves: ReadonlyArray<string>,
  from: number,
  to: number,
  startFen: string,
): string {
  const shown: Array<string> = []
  for (let i = from; i < to; i++) {
    const san = sanAt(moves, i, moves[i], startFen)
    shown.push(i === from || whiteMoves(i, startFen) ? san : san.replace(/^\d+\.\.\./, ''))
  }
  return shown.join(' ')
}

/**
 * A move that is not this line's but another line's of the same study from this very position (the same moves so
 * far): the drill says so instead of counting a mistake (study-repertoire-trainer D7).
 */
export function otherLineMove(
  lines: ReadonlyArray<ReadonlyArray<string>>,
  line: ReadonlyArray<string>,
  ply: number,
  uci: string,
): boolean {
  return lines.some(
    (other) =>
      other !== line &&
      other.length > ply &&
      matches(other[ply]!, uci) &&
      other.slice(0, ply).every((m, i) => m === line[i]),
  )
}

/** A study line named by its moves from where it leaves the main line: "… 2...Nf6 3.Nxe5", or "Main line". */
export function studyLineLabel(
  main: ReadonlyArray<string>,
  moves: ReadonlyArray<string>,
  startFen = STANDARD_START,
): string {
  let i = 0
  while (i < moves.length && i < main.length && moves[i] === main[i]) i++
  if (i === moves.length && i === main.length) return 'Main line'
  // A line that is the main line cut short shows its last move.
  const from = Math.min(i, moves.length - 1)
  return `… ${movesText(moves, from, moves.length, startFen)}`
}

/** What a drill runs through: a line's moves, from the standard start unless it is a study's. */
export interface DrillLine {
  key: string
  moves: Array<string>
}

export interface Drill {
  ply: number
  fen: string
  yourMove: boolean
  wrong: { played: string; expected: string } | null
  /** The member played another line of the study here: not a mistake, but this line goes on with `expected`. */
  otherLine: { played: string; expected: string } | null
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
  line: DrillLine,
  color: TrainerColor,
  onDone: (mistakes: number) => void,
  delayMs = 400,
  startFen = STANDARD_START,
  otherLines: ReadonlyArray<ReadonlyArray<string>> = [],
): Drill {
  const [ply, setPly] = useState(0)
  const [wrong, setWrong] = useState<Drill['wrong']>(null)
  const [otherLine, setOtherLine] = useState<Drill['otherLine']>(null)
  const [mistakes, setMistakes] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<Drill['promotion']>(null)
  const finished = useRef(false)
  const done = ply >= line.moves.length
  const yourMove = !done && isMemberMove(ply, color, startFen)

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
      setOtherLine(null)
      setPly(ply + 1)
    } else if (otherLineMove(otherLines, line.moves, ply, uci)) {
      setWrong(null)
      setOtherLine({ played: uci, expected })
    } else {
      setOtherLine(null)
      setWrong({ played: uci, expected })
      setMistakes((m) => m + 1)
    }
  }

  const fen = fenAfter(line.moves, ply, startFen)
  const mine = color === 'white' ? 'w' : 'b'

  return {
    ply,
    fen,
    yourMove,
    wrong,
    otherLine,
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
