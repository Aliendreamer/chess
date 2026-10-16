import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board, BoardPlaceholder, PromotionPicker, pieceSrc, squareStyles } from './board.tsx'

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

// The components (board-look): moved from the club's games.test.tsx with them.
afterEach(cleanup)

describe('Board', () => {
  it('renders an empty board on the server, every square named', () => {
    const html = renderToString(<Board fen={START} orientation="white" />)
    expect(html.match(/data-square="/g)?.length).toBe(64)
    expect(html).not.toContain('<img')
    // a1 is a dark square and h1 a light one.
    expect(html).toMatch(/data-square="a1" class="[^"]*bg-board-dark/)
    expect(html).toMatch(/data-square="h1" class="[^"]*bg-board-light/)
  })

  it('draws the Cburnett pieces once mounted', () => {
    const { container } = render(<Board fen={START} orientation="white" />)
    const images = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(images).toHaveLength(32)
    expect(images).toContain(pieceSrc('w', 'k'))
    expect(images).toContain(pieceSrc('b', 'n'))
  })

  it('from Black, h1 comes first', () => {
    const { container } = render(<Board fen={START} orientation="black" />)
    const squares = [...container.querySelectorAll('[data-square]')].map((c) =>
      c.getAttribute('data-square'),
    )
    expect([squares[0], squares[7], squares[56], squares[63]]).toEqual(['h1', 'a1', 'h8', 'a8'])
  })

  it('reports clicks when interactive', () => {
    const onSquareClick = vi.fn()
    const { container } = render(
      <Board fen={START} orientation="white" onSquareClick={onSquareClick} />,
    )
    fireEvent.click(container.querySelector('[data-square="e2"]')!)
    expect(onSquareClick).toHaveBeenCalledWith('e2')
  })
})

describe('PromotionPicker', () => {
  it('offers queen, rook, bishop and knight', () => {
    const onPick = vi.fn()
    render(<PromotionPicker color="white" onPick={onPick} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'knight' }))
    expect(onPick).toHaveBeenCalledWith('n')
  })

  it('shows the pieces of the promoting side, queen first', () => {
    const { container } = render(
      <PromotionPicker color="black" onPick={() => {}} onCancel={() => {}} />,
    )
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      pieceSrc('b', 'q'),
      pieceSrc('b', 'r'),
      pieceSrc('b', 'b'),
      pieceSrc('b', 'n'),
    ])
  })
})

describe('BoardPlaceholder (ui-polish)', () => {
  it('is a named group like the live board', () => {
    render(<BoardPlaceholder orientation="white" />)
    expect(screen.getByRole('group', { name: 'Chess board' })).toBeTruthy()
  })
})
