import { describe, expect, it } from 'vitest'
import { STANDARD_START } from './tree.ts'
import {
  fenAfterPlies,
  judgeAnswer,
  judgeCritical,
  nextDrill,
  phaseOf,
  pickSpots,
  trainingIds,
  verdictOf,
} from './training.ts'
import type { EvaluationLine } from './analysis.ts'
import type { LibrarySpot } from './training.ts'

// The backend's CriticalMomentsTests and the pure TrainingServiceTests, case for case.

/** After 1. e4 e5 2. Nf3: Black to move, many moves. */
const OPEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'
/** White in check from the rook on a1 with one way out (Kh2). */
const ONLY_MOVE = '7k/8/8/8/8/8/6PP/r6K w - - 0 1'
const line = (cp: number, ...pv: Array<string>): EvaluationLine => ({ cp, mate: null, pv })

/** A seeded generator on [0, 1), so a test can run many rounds reproducibly. */
function seeded(seed: number): () => number {
  let s = seed + 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe('critical moments (CriticalMomentsTests)', () => {
  it('are a best move far ahead of the second, from the mover’s side', () => {
    // Black to move: −300 is Black's good line, +50 its second; the gap is measured for Black.
    const moment = judgeCritical(
      OPEN,
      [line(-300, 'b8c6', 'f1b5'), line(50, 'd7d6'), line(60, 'g8f6')],
      0.25,
    )
    expect(moment?.acceptedUci).toEqual(['b8c6'])
    expect(moment?.bestLine).toEqual(['b8c6', 'f1b5'])
    expect(moment!.gap).toBeGreaterThanOrEqual(0.25)
    expect(moment!.gap).toBeLessThanOrEqual(1)
  })

  it('are not lines close together', () => {
    expect(judgeCritical(OPEN, [line(-20, 'b8c6'), line(-5, 'd7d6')], 0.25)).toBeNull() // 0.05 apart
    const white = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    expect(
      judgeCritical(white, [line(300, 'g1f3'), line(290, 'b1c3'), line(-100, 'd1h5')], 0.25),
    ).toBeNull()
  })

  it('are never a single legal move or a single line', () => {
    expect(judgeCritical(ONLY_MOVE, [line(-50, 'h1h2'), line(-900, 'g2g3')], 0.25)).toBeNull()
    expect(judgeCritical(OPEN, [line(-300, 'b8c6')], 0.25)).toBeNull()
    expect(judgeCritical('not a fen', [line(-300, 'b8c6'), line(50, 'd7d6')], 0.25)).toBeNull()
  })

  it.each([
    [STANDARD_START, 'middlegame'],
    ['r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', 'endgame'], // queens off
    ['3qk3/pppppppp/8/8/8/8/PPPPPPPP/3QK3 w - - 0 1', 'endgame'], // a queen each: 9 ≤ 13
    ['3qkr2/pppppppp/8/8/8/8/PPPPPPPP/3QKR2 w - - 0 1', 'middlegame'], // queen and rook: 14
    ['3qk3/pppppppp/8/8/8/8/PPPPPPPP/2RQKR2 w - - 0 1', 'middlegame'], // one side over 13, queens on
  ])('reads the phase of %s from the material', (fen, phase) => {
    expect(phaseOf(fen)).toBe(phase)
  })

  it('picks one position per game a round, never the same position twice', () => {
    const spot = (positionKey: string, gameId: string, ply: number): LibrarySpot => ({
      positionKey,
      gameId,
      ply,
      nextUci: 'e2e4',
    })
    const spots = [
      spot('k1', 'a', 20),
      spot('k2', 'a', 21),
      spot('k1', 'b', 22),
      spot('k3', 'c', 30),
    ]
    for (let seed = 0; seed < 20; seed++) {
      const picked = pickSpots(spots, 10, seeded(seed))
      expect(new Set(picked.map((s) => s.gameId)).size).toBe(picked.length)
      expect(new Set(picked.map((s) => s.positionKey)).size).toBe(picked.length)
      expect(picked.some((s) => s.gameId === 'c')).toBe(true)
      expect(picked.length).toBeGreaterThanOrEqual(2)
    }
    expect(pickSpots(spots, 1, seeded(1))).toHaveLength(1)
  })

  it('replays the position of a ply from the moves', () => {
    expect(fenAfterPlies(['e2e4'], 0)).toBe(STANDARD_START)
    expect(
      fenAfterPlies(['e2e4', 'e7e5'], 1)?.startsWith(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b',
      ),
    ).toBe(true)
    expect(fenAfterPlies(['e2e4'], 2)).toBeNull()
    expect(fenAfterPlies(['e2e5'], 1)).toBeNull()
  })
})

describe('answers and sessions (TrainingServiceTests)', () => {
  it.each([
    [true, true, 'both'],
    [true, false, 'master'],
    [false, true, 'engine'],
    [false, false, 'none'],
  ] as const)('names a verdict master=%s engine=%s as %s', (master, engine, verdict) => {
    expect(verdictOf(master, engine)).toBe(verdict)
  })

  it('judges by the master’s move or the engine’s, and only the engine’s in your own games', () => {
    const master = { masterUci: 'g1f3', acceptedUci: ['b1c3'] }
    expect(judgeAnswer(master, 'g1f3')).toEqual({ correct: true, verdict: 'master' })
    expect(judgeAnswer(master, 'b1c3')).toEqual({ correct: true, verdict: 'engine' })
    expect(judgeAnswer(master, 'h2h3')).toEqual({ correct: false, verdict: 'none' })
    expect(judgeAnswer({ masterUci: null, acceptedUci: ['b1c3'] }, 'b1c3').verdict).toBe('engine')
  })

  it('brings mistakes back due first, oldest due, then by box and oldest answered, never an excluded one', () => {
    const now = new Date('2026-10-10T10:00:00Z')
    const drill = (id: string, box: number, due: string, updated: string) => ({
      id,
      box,
      dueAt: new Date(due),
      updatedAt: new Date(updated),
    })
    const drills = [
      drill('a', 2, '2026-10-12T00:00:00Z', '2026-10-01T00:00:00Z'),
      drill('b', 1, '2026-10-11T00:00:00Z', '2026-10-05T00:00:00Z'),
      drill('c', 1, '2026-10-11T00:00:00Z', '2026-10-03T00:00:00Z'),
      drill('d', 3, '2026-10-09T00:00:00Z', '2026-10-02T00:00:00Z'),
      drill('e', 0, '2026-10-08T00:00:00Z', '2026-10-02T00:00:00Z'),
    ]
    expect(nextDrill(drills, new Set(), now)).toBe('e') // oldest due
    expect(nextDrill(drills, new Set(['e']), now)).toBe('d')
    expect(nextDrill(drills, new Set(['e', 'd']), now)).toBe('c') // lowest box, oldest answered
    expect(nextDrill(drills, new Set(['e', 'd', 'c', 'b']), now)).toBe('a')
    expect(nextDrill(drills, new Set(['a', 'b', 'c', 'd', 'e']), now)).toBeNull()
  })

  it.each([
    ['games', 'g:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f:12', true],
    ['games', 'g:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f:0', false],
    ['games', 'p:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f', false],
    ['library', 'p:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f', true],
    ['library', 'p:0199F1C2A3B47C5D8E9F0A1B2C3D4E5F', false],
    ['library', 'p:0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f', false],
    ['other', 'p:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f', false],
  ] as const)('takes %s id %s as %s', (mode, id, valid) => {
    expect(trainingIds.isValid(mode, id)).toBe(valid)
  })

  it('makes ids from a game and ply or a position', () => {
    expect(trainingIds.game('0199F1C2-A3B4-7C5D-8E9F-0A1B2C3D4E5F', 12)).toBe(
      'g:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f:12',
    )
    expect(trainingIds.position('0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f')).toBe(
      'p:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f',
    )
  })
})
