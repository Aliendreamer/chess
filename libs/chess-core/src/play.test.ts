import { describe, expect, it } from 'vitest'
import {
  ENGINE_LEVELS,
  buildPgn,
  engineName,
  findLevel,
  judgeMove,
  levelOptions,
  reasonLabel,
  reasonText,
  seat,
} from './play.ts'

describe('engine levels', () => {
  it('are the five seeded players, found by level', () => {
    expect(ENGINE_LEVELS.map((l) => l.label)).toEqual([
      'Casual',
      'Club',
      'Expert',
      'Master',
      'Maximum',
    ])
    expect(findLevel('2000')?.userId).toBe(-3)
    expect(findLevel('3000')).toBeNull()
    expect(engineName(findLevel('1320')!)).toBe('Stockfish (Casual)')
  })

  it('set a limited Elo, or full strength for Maximum', () => {
    expect(levelOptions(findLevel('1600')!)).toEqual([
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1600',
    ])
    expect(levelOptions(findLevel('max')!)[0]).toBe('setoption name UCI_LimitStrength value false')
  })

  it('seat the person as chosen, or by the coin', () => {
    expect(seat('black', () => true)).toEqual({ person: 'black', engine: 'white' })
    expect(seat('random', () => true)).toEqual({ person: 'white', engine: 'black' })
    expect(seat('random', () => false).person).toBe('black')
  })
})

describe('judging a move (desktop-app D6)', () => {
  it('gives SAN and the position, and ends the game on checkmate for the mover', () => {
    const m = judgeMove(['f2f3', 'e7e5', 'g2g4'], 'd8h4')
    expect(m?.san).toBe('Qh4#')
    expect(m?.end).toEqual({ result: '0-1', reason: 'checkmate' })
    expect(judgeMove([], 'e2e4')?.end).toBeNull()
  })

  it('refuses an illegal move', () => {
    expect(judgeMove([], 'e2e5')).toBeNull()
    expect(judgeMove(['e2e4'], 'e2e4')).toBeNull()
  })

  it('draws by threefold repetition, stalemate and insufficient material', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']
    expect(judgeMove(shuffle, 'f6g8')?.end).toEqual({
      result: '1/2-1/2',
      reason: 'threefoldRepetition',
    })
    // Sam Loyd's ten-move stalemate.
    const loyd = [
      'e2e3',
      'a7a5',
      'd1h5',
      'a8a6',
      'h5a5',
      'h7h5',
      'h2h4',
      'a6h6',
      'a5c7',
      'f7f6',
      'c7d7',
      'e8f7',
      'd7b7',
      'd8d3',
      'b7b8',
      'd3h7',
      'b8c8',
      'f7g6',
    ]
    expect(judgeMove(loyd, 'c8e6')?.end).toEqual({ result: '1/2-1/2', reason: 'stalemate' })
  })

  it('names how a game ended for people', () => {
    expect(reasonLabel('fiftyMoveRule')).toBe('50-move rule')
    expect(reasonText('checkmate')).toBe('checkmate')
  })
})

describe('PGN (D22)', () => {
  it('writes the roster, the numbered moves and the result', () => {
    const pgn = buildPgn({
      event: 'Casual game',
      site: 'Chess desktop',
      date: new Date('2026-10-16T12:00:00Z'),
      white: 'You',
      black: 'Stockfish "Casual"',
      result: '0-1',
      reason: 'checkmate',
      sans: ['f3', 'e5', 'g4', 'Qh4#'],
    })
    expect(pgn).toContain('[Date "2026.10.16"]')
    expect(pgn).toContain('[Black "Stockfish \\"Casual\\""]')
    expect(pgn).toContain('[Termination "normal"]')
    expect(pgn.trim().endsWith('1. f3 e5 2. g4 Qh4# 0-1')).toBe(true)
  })

  it('wraps long movetext under 80 columns', () => {
    const sans = Array.from({ length: 80 }, (_, i) => (i % 2 ? 'Nf6' : 'Nf3'))
    const pgn = buildPgn({
      event: 'e',
      site: 's',
      date: new Date(0),
      white: 'w',
      black: 'b',
      result: '*',
      reason: null,
      sans,
    })
    const movetext = pgn.split('\n\n')[1]!.trim().split('\n')
    expect(movetext.length).toBeGreaterThan(1)
    expect(movetext.every((l) => l.length <= 79)).toBe(true)
  })
})
