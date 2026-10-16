import { describe, expect, it } from 'vitest'
import { ENGINE_LEVELS, engineName, findLevel, levelOptions, seat } from './play.ts'

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
