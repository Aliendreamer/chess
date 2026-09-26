import { describe, expect, it } from 'vitest'
import {
  applyOptimistic,
  clickSquare,
  legalTargets,
  needsPromotion,
  pieceAt,
  placement,
  squaresFor,
} from './moveInput'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// White pawn on e7, black king on h8 away from the promotion square: e7e8 promotes.
const PROMO = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1'

describe('legalTargets', () => {
  it('lists where the picked piece may go', () => {
    expect(legalTargets(START, 'e2')).toEqual(['e3', 'e4'])
    expect(legalTargets(START, 'g1')).toEqual(['f3', 'h3'])
  })

  it('is empty for an empty square or the side not to move', () => {
    expect(legalTargets(START, 'e4')).toEqual([])
    expect(legalTargets(START, 'e7')).toEqual([])
  })
})

describe('needsPromotion', () => {
  it('is true only for a pawn reaching the last rank', () => {
    expect(needsPromotion(PROMO, 'e7', 'e8')).toBe(true)
    expect(needsPromotion(START, 'e2', 'e4')).toBe(false)
  })
})

describe('applyOptimistic', () => {
  it('returns the position after a legal move', () => {
    expect(applyOptimistic(START, 'e2e4')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    )
  })

  it('handles a promotion suffix', () => {
    expect(applyOptimistic(PROMO, 'e7e8q')).toBe('4Q2k/8/8/8/8/8/8/4K3 b - - 0 1')
  })

  it('is null for an illegal move instead of throwing', () => {
    expect(applyOptimistic(START, 'e2e5')).toBeNull()
    expect(applyOptimistic(START, 'zz')).toBeNull()
  })
})

describe('pieceAt and squaresFor', () => {
  it('reads a piece from a FEN', () => {
    expect(pieceAt(START, 'e1')).toEqual({ color: 'w', type: 'k' })
    expect(pieceAt(START, 'e4')).toBeNull()
  })

  it('lists the squares top-left to bottom-right for each side', () => {
    const white = squaresFor('white')
    const black = squaresFor('black')
    expect([white[0], white[7], white[56], white[63]]).toEqual(['a8', 'h8', 'a1', 'h1'])
    expect([black[0], black[7], black[56], black[63]]).toEqual(['h1', 'a1', 'h8', 'a8'])
  })
})

describe('placement', () => {
  it('maps a FEN placement to squares', () => {
    const board = placement('7k/4P3/8/8/8/8/8/4K3 w - - 0 1')
    expect(board).toEqual({
      h8: { color: 'b', type: 'k' },
      e7: { color: 'w', type: 'p' },
      e1: { color: 'w', type: 'k' },
    })
  })
})

describe('clickSquare', () => {
  it('selects your piece, then a legal target completes the move', () => {
    expect(clickSquare(START, 'w', null, 'e2')).toEqual({ selected: 'e2', move: null })
    expect(clickSquare(START, 'w', 'e2', 'e4')).toEqual({
      selected: null,
      move: { from: 'e2', to: 'e4' },
    })
  })

  it('switches to another of your pieces, and a second click on the same one deselects', () => {
    expect(clickSquare(START, 'w', 'e2', 'g1')).toEqual({ selected: 'g1', move: null })
    expect(clickSquare(START, 'w', 'e2', 'e2')).toEqual({ selected: null, move: null })
  })

  it('an illegal target or an opponent piece clears the selection', () => {
    expect(clickSquare(START, 'w', 'e2', 'e5')).toEqual({ selected: null, move: null })
    expect(clickSquare(START, 'w', null, 'e7')).toEqual({ selected: null, move: null })
  })

  it('nothing is selectable when it is not your turn', () => {
    expect(clickSquare(START, 'b', null, 'e7')).toEqual({ selected: null, move: null })
  })
})
