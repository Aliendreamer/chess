import { describe, expect, it } from 'vitest'
import { pieceSrc, squareStyles } from './board'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6 4.Qxf7+
const SCHOLAR_CHECK = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4'
// 1.e4 d5: the e4 pawn can take on d5.
const CAN_TAKE = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2'

describe('pieceSrc', () => {
  it('names the Cburnett file', () => {
    // Bundled as assets: a file URL, or inlined as a data URL when small.
    for (const src of [pieceSrc('w', 'n'), pieceSrc('b', 'k')])
      expect(src).toMatch(/^data:image\/svg\+xml|\.svg$/)
    expect(pieceSrc('w', 'n')).not.toBe(pieceSrc('b', 'k'))
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
