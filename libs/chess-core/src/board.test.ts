import { describe, expect, it } from 'vitest'
import {
  applyOptimistic,
  checkSquare,
  clickSquare,
  legalTargets,
  material,
  needsPromotion,
  pieceAt,
  placement,
  premoveClick,
  replay,
  resolvePremove,
  squaresFor,
  uciSquares,
} from './board.ts'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// White pawn on e7, black king on h8 away from the promotion square: e7e8 promotes.
const PROMO = '7k/4P3/8/8/8/8/8/4K3 w - - 0 1'
// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7+
const SCHOLAR_CHECK = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'
// 1.e4 d5: the e4 pawn can take on d5.
const CAN_TAKE = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2'

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

describe('checkSquare', () => {
  it('is the king of the side to move when it is in check', () => {
    expect(checkSquare(SCHOLAR_CHECK)).toBe('e8')
  })

  it('is null without check', () => {
    expect(checkSquare(START)).toBeNull()
  })
})

describe('resolvePremove', () => {
  const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

  it('plays a premove that is legal now', () => {
    expect(resolvePremove(AFTER_E4, { from: 'e7', to: 'e5' })).toBe('e7e5')
  })

  it('drops one that is not', () => {
    expect(resolvePremove(AFTER_E4, { from: 'e7', to: 'e4' })).toBeNull()
  })

  it('drops one when it is not our move after all', () => {
    expect(resolvePremove(START, { from: 'e7', to: 'e5' })).toBeNull()
  })

  it('promotes to a queen', () => {
    const PROMOTE = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1'
    expect(resolvePremove(PROMOTE, { from: 'e7', to: 'e8' })).toBe('e7e8q')
  })
})

describe('premoveClick', () => {
  const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

  it('selects my piece, then queues the move to any other square', () => {
    const first = premoveClick(AFTER_E4, 'w', null, 'g1')
    expect(first).toEqual({ selected: 'g1', premove: null })
    expect(premoveClick(AFTER_E4, 'w', 'g1', 'f3')).toEqual({
      selected: null,
      premove: { from: 'g1', to: 'f3' },
    })
  })

  it('a click on an empty square or a foreign piece with nothing selected clears', () => {
    expect(premoveClick(AFTER_E4, 'w', null, 'e5')).toEqual({ selected: null, premove: null })
    expect(premoveClick(AFTER_E4, 'w', null, 'e7')).toEqual({ selected: null, premove: null })
  })

  it('a second click on the selected piece deselects it', () => {
    expect(premoveClick(AFTER_E4, 'w', 'g1', 'g1')).toEqual({ selected: null, premove: null })
  })
})

describe('material', () => {
  it('is even at the start', () => {
    expect(material(START)).toEqual({
      white: { pieces: [], plus: 0 },
      black: { pieces: [], plus: 0 },
    })
  })

  it('shows what each side is up, like lichess', () => {
    // White has taken a knight and a pawn; Black has taken a pawn: White is a knight up.
    const fen = 'r1bqkbnr/ppp2ppp/8/3p4/4P3/8/PPP2PPP/RNBQKBNR w KQkq - 0 5'
    expect(material(fen)).toEqual({
      white: { pieces: ['n'], plus: 3 },
      black: { pieces: [], plus: 0 },
    })
  })

  it('lists the surplus on each side when the trade is uneven', () => {
    // Black won a rook for a bishop and a pawn.
    const fen = 'rn1qkbnr/ppppppp1/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 9'
    expect(material(fen)).toEqual({
      white: { pieces: ['p', 'b'], plus: 0 },
      black: { pieces: ['r'], plus: 1 },
    })
  })

  it('counts a promoted queen', () => {
    // White promoted the h-pawn and took Black's: two queens against one, pawns even.
    const fen = 'rnbqkbnr/ppppppp1/8/Q7/8/8/PPPPPPP1/RNBQKBNR b - - 0 9'
    expect(material(fen).white).toEqual({ pieces: ['q'], plus: 9 })
  })
})

describe('replay', () => {
  it('starts with the initial position', () => {
    expect(replay([])).toEqual([{ fen: START, lastMove: null }])
  })

  it('gives the position and move squares after every ply', () => {
    const positions = replay(['e4', 'e5', 'Nf3'])
    expect(positions).toHaveLength(4)
    expect(positions[1]?.lastMove).toEqual({ from: 'e2', to: 'e4' })
    expect(positions[3]?.fen.split(' ')[0]).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R',
    )
  })

  it('stops at a move it cannot read', () => {
    expect(replay(['e4', 'Ke7??', 'Nf3'])).toHaveLength(2)
  })
})

describe('uciSquares', () => {
  it('reads the two squares of a move, promotion included', () => {
    expect(uciSquares('e2e4')).toEqual({ from: 'e2', to: 'e4' })
    expect(uciSquares('e7e8q')).toEqual({ from: 'e7', to: 'e8' })
  })

  it('knows no squares without a usable move', () => {
    expect(uciSquares(null)).toBeNull()
    expect(uciSquares('e2')).toBeNull()
    expect(uciSquares('z9e4')).toBeNull()
  })
})
