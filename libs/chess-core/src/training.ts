import { Chess } from 'chess.js'
import { accepted, chancesFor } from './review.ts'
import { STANDARD_START } from './tree.ts'
import type { EvaluationLine } from './analysis.ts'

/**
 * Training without its storage (training D1–D4): which library positions are critical moments, a position's phase, which
 * positions the miner looks at next, the verdict on an answer, and the order mistakes come back in. Ported from the
 * backend's `Training/` (CriticalMoments, TrainingVerdicts, TrainingIds, TrainingReads.NextDrill) with its cases.
 */

/** The defaults of `Training:*` (training D3). */
export const TRAINING_DEFAULTS = { minPly: 20, minGap: 0.25, perGame: 3, inFlight: 20 } as const

/** A position the engine found one move clearly best in. */
export interface CriticalMoment {
  acceptedUci: Array<string>
  bestLine: Array<string>
  gap: number
}

/**
 * Critical when the side to move has at least two legal moves, the engine gave two lines, and its best gains at least
 * `minGap` in winning chances over its second; null (quiet) otherwise.
 */
export function judgeCritical(
  fen: string,
  lines: ReadonlyArray<EvaluationLine>,
  minGap: number,
): CriticalMoment | null {
  let board: Chess
  try {
    board = new Chess(fen)
  } catch {
    return null
  }
  if (board.moves().length < 2) return null
  const scored = lines.filter((l) => l.pv.length > 0)
  if (scored.length < 2) return null
  const white = board.turn() === 'w'
  const gap = chancesFor(scored[0]!, white) - chancesFor(scored[1]!, white)
  return gap < minGap
    ? null
    : { acceptedUci: accepted(scored, white), bestLine: [...scored[0]!.pv], gap }
}

export type Phase = 'middlegame' | 'endgame'

/** A side's non-pawn, non-king material at or under this (Q9 R5 B3 N3) is an endgame. */
const ENDGAME_MATERIAL = 13

/** Endgame when both queens are off, or each side has at most 13 points of pieces; otherwise middlegame. */
export function phaseOf(fen: string): Phase {
  let white = 0
  let black = 0
  let queens = false
  for (const c of fen.split(' ')[0] ?? '') {
    const value = { q: 9, r: 5, b: 3, n: 3 }[c.toLowerCase()] ?? 0
    if (c === 'q' || c === 'Q') queens = true
    if (c >= 'A' && c <= 'Z') white += value
    else black += value
  }
  return !queens || (white <= ENDGAME_MATERIAL && black <= ENDGAME_MATERIAL)
    ? 'endgame'
    : 'middlegame'
}

/** A library position the miner may pick: its key, game, ply and the move the game played there. */
export interface LibrarySpot {
  positionKey: string
  gameId: string
  ply: number
  nextUci: string
}

/**
 * At most one position per game per round, at most `max`, never a position twice: a random one of each game's spots,
 * games in random order. `random` is on [0, 1), as `Math.random`.
 */
export function pickSpots(
  spots: Iterable<LibrarySpot>,
  max: number,
  random: () => number,
): Array<LibrarySpot> {
  const games = new Map<string, Array<LibrarySpot>>()
  for (const s of spots) games.set(s.gameId, [...(games.get(s.gameId) ?? []), s])
  const shuffle = <T>(xs: Array<T>) =>
    xs
      .map((x) => ({ x, r: random() }))
      .sort((a, b) => a.r - b.r)
      .map((e) => e.x)
  const keys = new Set<string>()
  const picked: Array<LibrarySpot> = []
  for (const game of shuffle([...games.values()])) {
    if (picked.length >= max) break
    const spot = shuffle(game.filter((s) => !keys.has(s.positionKey)))[0]
    if (spot) {
      keys.add(spot.positionKey)
      picked.push(spot)
    }
  }
  return picked
}

/** The position after the first `ply` moves of a game from the start; null when they do not play. */
export function fenAfterPlies(moves: ReadonlyArray<string>, ply: number): string | null {
  if (ply > moves.length) return null
  const board = new Chess(STANDARD_START)
  for (const uci of moves.slice(0, ply)) {
    try {
      board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci[4] ? { promotion: uci[4] } : {}),
      })
    } catch {
      return null
    }
  }
  return board.fen()
}

/** Which move a right answer was: the master's, one the engine accepts, both, or neither. */
export type Verdict = 'master' | 'engine' | 'both' | 'none'

export function verdictOf(master: boolean, engine: boolean): Verdict {
  return master ? (engine ? 'both' : 'master') : engine ? 'engine' : 'none'
}

/**
 * An answer judged: in master games the master's move or an engine-accepted one is right; in the player's own games
 * (no master move) only an engine-accepted one.
 */
export function judgeAnswer(
  position: { masterUci: string | null; acceptedUci: ReadonlyArray<string> },
  uci: string,
): { correct: boolean; verdict: Verdict } {
  const master = position.masterUci !== null && uci === position.masterUci
  const engine = position.acceptedUci.includes(uci)
  return { correct: master || engine, verdict: verdictOf(master, engine) }
}

export type TrainingMode = 'games' | 'library'

/** A position's id: `g:{gameId}:{ply}` for one of the player's mistakes, `p:{positionId}` for a master position. */
export const trainingIds = {
  game: (gameId: string, ply: number) => `g:${gameId.replaceAll('-', '').toLowerCase()}:${ply}`,
  position: (positionId: string) => `p:${positionId.replaceAll('-', '').toLowerCase()}`,
  isValid(mode: string, id: string): boolean {
    if (mode === 'games') {
      const m = /^g:[0-9a-f]{32}:([0-9]{1,4})$/.exec(id)
      return m !== null && Number(m[1]) >= 1
    }
    return mode === 'library' && /^p:[0-9a-f]{32}$/.test(id)
  },
}

/** A mistake in the player's pool, as the session order needs it. */
export interface DrillState {
  id: string
  box: number
  dueAt: Date
  updatedAt: Date
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The player's mistakes: the due ones first (oldest due first), then the rest by box, oldest answered first; never an
 * excluded one. Null when every one is excluded.
 */
export function nextDrill(
  drills: Iterable<DrillState>,
  exclude: ReadonlySet<string>,
  now: Date,
): string | null {
  const open = [...drills].filter((d) => !exclude.has(d.id))
  const due = open
    .filter((d) => d.dueAt.getTime() <= now.getTime())
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || byId(a, b))[0]
  if (due) return due.id
  return (
    open.sort(
      (a, b) => a.box - b.box || a.updatedAt.getTime() - b.updatedAt.getTime() || byId(a, b),
    )[0]?.id ?? null
  )
}
