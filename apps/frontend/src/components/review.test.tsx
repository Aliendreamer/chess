import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EvalGraph, ReviewPanel } from './review'
import type { ReactNode } from 'react'
import type { ReviewView, ReviewedMove } from '#/lib/review'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, unknown>
  }) => {
    const path = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)
    const query = search
      ? `?${new URLSearchParams(search as Record<string, string>).toString()}`
      : ''
    return <a href={`${path}${query}`}>{children}</a>
  },
}))

afterEach(cleanup)

const move = (ply: number, over: Partial<ReviewedMove> = {}): ReviewedMove => ({
  ply,
  uci: 'a2a3',
  san: 'a3',
  cp: 10,
  mate: null,
  chances: 0.02,
  bestUci: 'a2a3',
  bestSan: 'a3',
  line: ['a3'],
  class: 'none',
  ...over,
})

const FOOLS: Array<ReviewedMove> = [
  move(1, { san: 'f3', cp: -50, chances: -0.09, bestSan: 'e4', line: ['e4'], class: 'inaccuracy' }),
  move(2, { san: 'e5', cp: -60, chances: -0.11 }),
  move(3, {
    san: 'g4',
    cp: null,
    mate: -1,
    chances: -1,
    bestSan: 'Nc3',
    line: ['Nc3', 'Nc6'],
    class: 'blunder',
  }),
  move(4, { san: 'Qh4#', cp: null, chances: -1 }),
]

const review = (over: Partial<ReviewView> = {}): ReviewView => ({
  status: 'complete',
  evaluated: 4,
  positions: 4,
  moves: FOOLS,
  white: { inaccuracies: 1, mistakes: 0, blunders: 1 },
  black: { inaccuracies: 0, mistakes: 0, blunders: 0 },
  bookExit: { ply: 3, san: 'g4', color: 'white', eco: 'A00', name: 'Barnes Opening: Fool’s Mate' },
  ...over,
})

const panel = (props: Partial<Parameters<typeof ReviewPanel>[0]> = {}) => (
  <ReviewPanel
    review={review()}
    mine="white"
    canStart
    busy={false}
    error={null}
    onStart={vi.fn()}
    current={4}
    onSelect={vi.fn()}
    preview={null}
    onPreview={vi.fn()}
    {...props}
  />
)

describe('ReviewPanel', () => {
  it('offers a review to a player of an unreviewed game, and says so to others', () => {
    const onStart = vi.fn()
    const { rerender } = render(panel({ review: review({ status: 'none', moves: [] }), onStart }))
    fireEvent.click(screen.getByRole('button', { name: 'Review with engine' }))
    expect(onStart).toHaveBeenCalled()
    rerender(panel({ review: review({ status: 'none', moves: [] }), canStart: false }))
    expect(screen.getByText('Not reviewed yet.')).toBeTruthy()
  })

  it('shows the progress while the engine works', () => {
    render(panel({ review: review({ status: 'running', evaluated: 3 }) }))
    expect(screen.getByTestId('review-progress').textContent).toBe('Reviewing: 3 of 4 positions')
  })

  it('names the current move’s mistake with its score and the better line', () => {
    render(panel({ current: 3 }))
    expect(screen.getByTestId('review-score').textContent).toBe('#−1')
    expect(screen.getByTestId('review-move').textContent).toContain('Black mates')
    expect(screen.getByTestId('review-move').textContent).toContain('2.g4 is a blunder.')
    const line = screen.getByRole('group', { name: 'Better line' })
    expect(line.textContent).toBe('Better:2.Nc3Nc6')
  })

  it('shows a move of the better line on the board when clicked, and goes back', () => {
    const onPreview = vi.fn()
    const { rerender } = render(panel({ current: 3, onPreview }))
    fireEvent.click(screen.getByRole('button', { name: 'Nc6' }))
    expect(onPreview).toHaveBeenCalledWith({ ply: 3, upTo: 2 })
    rerender(panel({ current: 3, onPreview, preview: { ply: 3, upTo: 1 } }))
    expect(screen.getByRole('button', { name: '2.Nc3' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the game' }))
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })

  it('a move that is not marked shows only its score', () => {
    render(panel({ current: 2 }))
    expect(screen.getByTestId('review-move').textContent).toBe(
      '−0.60Black is slightly better1...e5',
    )
    expect(screen.queryByRole('group', { name: 'Better line' })).toBeNull()
  })

  it('counts each player’s marks and links the trainer for the opening the member left', () => {
    render(panel())
    expect(screen.getByRole('row', { name: /White 1 0 1/ })).toBeTruthy()
    expect(screen.getByTestId('book-exit').textContent).toContain(
      'Left the book with 2.g4 (White) · A00 Barnes Opening',
    )
    expect(screen.getByRole('link', { name: 'Train this opening' }).getAttribute('href')).toBe(
      '/trainer/Barnes Opening?color=white',
    )
  })

  it('no longer offers to practise the mistakes: finished games join training on their own', () => {
    render(panel())
    expect(screen.queryByRole('button', { name: 'Practise my mistakes' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open training' }).getAttribute('href')).toBe(
      '/training',
    )
  })
})

describe('EvalGraph', () => {
  it('describes itself and goes to a move when clicked', () => {
    const onSelect = vi.fn()
    render(<EvalGraph moves={FOOLS} current={2} onSelect={onSelect} />)
    expect(
      screen.getByRole('img', { name: 'Evaluation graph: 4 of 4 moves evaluated' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByTestId('graph-ply-3'))
    expect(onSelect).toHaveBeenCalledWith(3)
  })
})
