import { describe, expect, it } from 'vitest'
import { recordByCategory, scoreShare } from './players'

describe('recordByCategory', () => {
  it('adds time controls into game types, in the usual order, leaving out types without games', () => {
    expect(
      recordByCategory([
        { timeControl: '5+3', wins: 1, draws: 0, losses: 1 },
        { timeControl: '3+0', wins: 2, draws: 1, losses: 0 },
        { timeControl: 'untimed', wins: 0, draws: 0, losses: 4 },
        { timeControl: '1+0', wins: 0, draws: 0, losses: 1 },
      ]),
    ).toEqual([
      { category: 'bullet', label: 'Bullet', wins: 0, draws: 0, losses: 1 },
      { category: 'blitz', label: 'Blitz', wins: 3, draws: 1, losses: 1 },
      { category: 'computer', label: 'Untimed', wins: 0, draws: 0, losses: 4 },
    ])
  })
})

describe('scoreShare', () => {
  it('turns a record into whole percentages that add up to 100', () => {
    expect(scoreShare({ wins: 1, draws: 1, losses: 1 })).toEqual({
      wins: 33,
      draws: 33,
      losses: 34,
    })
    expect(scoreShare({ wins: 0, draws: 0, losses: 0 })).toEqual({ wins: 0, draws: 0, losses: 0 })
  })
})
