import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board, PromotionPicker } from './Board'
import { MoveList } from './MoveList'
import { PlayerStrip } from './Clock'

afterEach(cleanup)

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('Board', () => {
  it('names each square and its piece', () => {
    render(<Board fen={START} orientation="white" />)
    expect(screen.getByRole('gridcell', { name: 'e1 white king' })).toBeDefined()
    expect(screen.getByRole('gridcell', { name: 'e4' })).toBeDefined()
  })

  it('from Black, a1 is at the top right', () => {
    render(<Board fen={START} orientation="black" />)
    const cells = screen.getAllByRole('gridcell').map((c) => c.getAttribute('data-square'))
    expect([cells[0], cells[7], cells[56], cells[63]]).toEqual(['h1', 'a1', 'h8', 'a8'])
  })

  it('reports clicks when interactive, and is inert without a handler', () => {
    const onSquareClick = vi.fn()
    const { rerender } = render(
      <Board fen={START} orientation="white" onSquareClick={onSquareClick} />,
    )
    fireEvent.click(screen.getByRole('gridcell', { name: 'e2 white pawn' }))
    expect(onSquareClick).toHaveBeenCalledWith('e2')

    rerender(<Board fen={START} orientation="white" />)
    expect(screen.getByRole('gridcell', { name: 'e2 white pawn' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('marks the selection', () => {
    render(<Board fen={START} orientation="white" selected="g1" targets={['f3', 'h3']} />)
    expect(
      screen.getByRole('gridcell', { name: 'g1 white knight' }).getAttribute('aria-selected'),
    ).toBe('true')
  })
})

describe('PromotionPicker', () => {
  it('offers queen, rook, bishop and knight', () => {
    const onPick = vi.fn()
    render(<PromotionPicker color="white" onPick={onPick} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'knight' }))
    expect(onPick).toHaveBeenCalledWith('n')
  })
})

describe('MoveList and PlayerStrip', () => {
  it('numbers the moves in pairs', () => {
    render(<MoveList sans={['e4', 'e5', 'Nf3']} />)
    expect(screen.getByTestId('move-list').textContent).toBe('1.e4e52.Nf3')
  })

  it('shows the clock text for the player', () => {
    render(<PlayerStrip name="ann" detail="white" ms={183000} active />)
    expect(screen.getByText('3:03')).toBeDefined()
  })
})
