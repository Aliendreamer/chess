import { describe, expect, it } from 'vitest'
import {
  boardSquares,
  checkSquare,
  material,
  pieceSrc,
  premoveClick,
  replay,
  resolvePremove,
  squareStyles,
  uciSquares,
} from './board'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7+
const SCHOLAR_CHECK = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'
// 1.e4 d5: the e4 pawn can take on d5.
const CAN_TAKE = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2'

describe('pieceSrc', () => {
  it('names the Cburnett file', () => {
    expect(pieceSrc('w', 'n')).toBe('/pieces/cburnett/wN.svg')
    expect(pieceSrc('b', 'k')).toBe('/pieces/cburnett/bK.svg')
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

describe('squareStyles', () => {
  it('tints the last move and the selection', () => {
    const styles = squareStyles(START, { lastMove: { from: 'e2', to: 'e4' }, selected: 'g1' })
    expect(styles.e2?.backgroundColor).toBe('var(--board-last)')
    expect(styles.e4?.backgroundColor).toBe('var(--board-last)')
    expect(styles.g1?.backgroundColor).toBe('var(--board-selected)')
  })

  it('draws a dot on an empty target and a ring on a capture', () => {
    const styles = squareStyles(CAN_TAKE, { selected: 'e4', targets: ['e5', 'd5'] })
    expect(styles.e5?.backgroundImage).toContain('var(--board-target) 19%')
    expect(styles.d5?.backgroundImage).toContain('transparent 79%')
  })

  it('glows the king in check', () => {
    expect(squareStyles(SCHOLAR_CHECK, {}).e8?.backgroundImage).toContain('rgba(255, 0, 0')
  })

  it('marks a premove and drawn circles', () => {
    const styles = squareStyles(START, { premove: { from: 'e7', to: 'e5' }, circles: ['d4'] })
    expect(styles.e7?.backgroundColor).toBe('var(--board-premove)')
    expect(styles.e5?.backgroundColor).toBe('var(--board-premove)')
    expect(styles.d4?.boxShadow).toContain('var(--board-circle)')
  })

  it('leaves untouched squares out', () => {
    expect(Object.keys(squareStyles(START, {}))).toEqual([])
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

describe('boardSquares', () => {
  it('lists a8 to h1 for White with the colour and piece of each square', () => {
    const squares = boardSquares(START, 'white')
    expect(squares).toHaveLength(64)
    expect(squares[0]).toEqual({ square: 'a8', light: true, piece: { color: 'b', type: 'r' } })
    expect(squares[63]).toEqual({ square: 'h1', light: true, piece: { color: 'w', type: 'r' } })
    expect(squares.find((s) => s.square === 'a1')?.light).toBe(false)
    expect(squares.find((s) => s.square === 'e4')?.piece).toBeNull()
    expect(squares.filter((s) => s.piece !== null)).toHaveLength(32)
  })

  it('turns the board round for Black', () => {
    const squares = boardSquares(START, 'black')
    expect(squares[0]?.square).toBe('h1')
    expect(squares[63]?.square).toBe('a8')
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
