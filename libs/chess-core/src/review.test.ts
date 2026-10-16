import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { positionKey } from './analysis.ts'
import { STANDARD_START } from './tree.ts'
import { chances, lineSans, marksFor, missing, practice, review } from './review.ts'
import type { Evaluation, EvaluationLine } from './analysis.ts'
import type { ReviewInput, ReviewMove } from './review.ts'

// The backend's GameReviewerTests, case for case.

/** Fool's mate: 1.f3 e5 2.g4 Qh4#, 0-1 by checkmate. */
function foolsMate(): Array<ReviewMove> {
  const board = new Chess()
  return ['f2f3', 'e7e5', 'g2g4', 'd8h4'].map((uci, i) => {
    const m = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) })
    return { ply: i + 1, uci, san: m.san, fenAfter: board.fen() }
  })
}

const key = positionKey
const evaluation = (...lines: Array<EvaluationLine>): Evaluation => ({
  thinkMs: 800,
  depth: 18,
  lines,
})
const cp = (n: number, ...pv: Array<string>): EvaluationLine => ({ cp: n, mate: null, pv })
const mate = (n: number, ...pv: Array<string>): EvaluationLine => ({ cp: null, mate: n, pv })

/** Every position before a move evaluated: the start, after f3, after e5, after g4. */
const evaluations = (m: Array<ReviewMove>) =>
  new Map<string, Evaluation>([
    [key(STANDARD_START), evaluation(cp(20, 'e2e4'))],
    [key(m[0]!.fenAfter), evaluation(cp(-50, 'e7e5'))],
    [key(m[1]!.fenAfter), evaluation(cp(-60, 'b1c3', 'b8c6'), cp(-70, 'd2d4'), cp(-300, 'h2h3'))],
    [key(m[2]!.fenAfter), evaluation(mate(-1, 'd8h4'))],
  ])

const input = (
  moves: Array<ReviewMove>,
  evals: Map<string, Evaluation>,
  reason = 'Checkmate',
  result = '0-1',
): ReviewInput => ({
  moves,
  result,
  reason,
  evaluations: evals,
  openings: new Map([
    [key(moves[0]!.fenAfter), { eco: 'A00', name: 'Barnes Opening' }],
    [key(moves[1]!.fenAfter), { eco: 'A00', name: "Barnes Opening: Fool's Mate" }],
  ]),
})

describe('the game review (GameReviewerTests)', () => {
  it('turns scores into winning chances, a mate being certain', () => {
    expect(chances(cp(0))).toBeCloseTo(0, 3)
    expect(chances(cp(-150))).toBeCloseTo(-chances(cp(150)), 6)
    expect(chances(cp(300))).toBeGreaterThan(0.5)
    expect(chances(cp(300))).toBeLessThan(0.6)
    expect([chances(mate(3)), chances(mate(-2))]).toEqual([1, -1])
  })

  it('marks moves by the chances they lose against the engine’s move', () => {
    const moves = foolsMate()
    const r = review(input(moves, evaluations(moves)))
    expect(r.moves.map((m) => m.class)).toEqual(['inaccuracy', 'none', 'blunder', 'none'])
    expect([r.evaluated, r.positions]).toEqual([4, 4]) // the mate itself is judged from the result
    expect(r.white).toEqual({ inaccuracies: 1, mistakes: 0, blunders: 1 })
    expect(r.black).toEqual({ inaccuracies: 0, mistakes: 0, blunders: 0 })
    const g4 = r.moves[2]!
    expect([g4.bestUci, g4.bestSan]).toEqual(['b1c3', 'Nc3'])
    expect(g4.line).toEqual(['Nc3', 'Nc6'])
    expect(r.moves[3]?.chances).toBe(-1) // after Qh4#: Black has won
    expect(marksFor(r.moves)).toEqual(['?!', '', '??', ''])
  })

  it('never marks the engine’s own move', () => {
    const moves = foolsMate()
    const evals = evaluations(moves)
    evals.set(key(moves[1]!.fenAfter), evaluation(cp(900, 'b1c3'))) // a noisy evaluation after e5
    expect(review(input(moves, evals)).moves[1]?.class).toBe('none')
  })

  it('marks only what it can judge while in progress', () => {
    const moves = foolsMate()
    const evals = evaluations(moves)
    evals.delete(key(moves[2]!.fenAfter))
    const r = review(input(moves, evals))
    expect([r.evaluated, r.positions]).toEqual([3, 4])
    expect(r.moves.map((m) => m.class)).toEqual(['inaccuracy', 'none', null, null])
    expect(missing(input(moves, evals)).map((p) => p.key)).toEqual([key(moves[2]!.fenAfter)])
  })

  it('evaluates a resigned game’s last position like any other', () => {
    const moves = foolsMate().slice(0, 3)
    const i = input(moves, evaluations(moves), 'Resignation', '0-1')
    expect(review(i).positions).toBe(4)
    expect(missing(i)).toEqual([])
  })

  it('judges a drawn board ending from the result', () => {
    const moves = foolsMate()
    const r = review(input(moves, evaluations(moves), 'Stalemate', '1/2-1/2'))
    expect([r.moves[3]?.cp, r.moves[3]?.chances]).toEqual([0, 0])
  })

  it('finds the book exit after the last named position', () => {
    const moves = foolsMate()
    expect(review(input(moves, evaluations(moves))).bookExit).toEqual({
      ply: 3,
      san: 'g4',
      color: 'white',
      eco: 'A00',
      name: "Barnes Opening: Fool's Mate",
    })
    const named: ReviewInput = { ...input(moves, evaluations(moves)), openings: new Map() }
    expect(review(named).bookExit).toBeNull()
  })

  it('turns a player’s mistakes into practice with every move the engine accepts', () => {
    const moves = foolsMate()
    const i = input(moves, evaluations(moves))
    const all = practice(i, 'white')
    expect(all).toHaveLength(1)
    const g4 = all[0]!
    expect([g4.ply, g4.playedUci, g4.playedSan, g4.class]).toEqual([3, 'g2g4', 'g4', 'blunder'])
    expect(g4.fen).toBe(moves[1]!.fenAfter)
    expect(g4.acceptedUci).toEqual(['b1c3', 'd2d4']) // h3 loses too much to count
    expect(g4.bestLine).toEqual(['b1c3', 'b8c6'])
    expect(practice(i, 'black')).toEqual([])
  })

  it('reads UCI lines as SAN as far as they play', () => {
    expect(lineSans(STANDARD_START, ['e2e4', 'e7e5', 'e1e3', 'g1f3'])).toEqual(['e4', 'e5'])
  })
})
