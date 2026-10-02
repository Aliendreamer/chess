import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryList, PositionPanel } from './library'
import type { ReactNode } from 'react'
import type { LibraryGameItem } from '#/lib/library'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
  }: {
    children: ReactNode
    to: string
    search?: Record<string, unknown>
  }) => (
    <a href={`${to}?${new URLSearchParams(search as Record<string, string>).toString()}`}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

const game = (over: Partial<LibraryGameItem> = {}): LibraryGameItem => ({
  id: 'g1',
  white: 'Fischer, Robert James',
  black: 'Spassky, Boris V',
  event: 'World Championship 28th',
  site: 'Reykjavik',
  round: '6',
  date: '1972.07.23',
  year: 1972,
  result: '1-0',
  eco: 'D59',
  opening: "Queen's Gambit Declined: Tartakower Defense",
  worldChampionship: true,
  ply: 81,
  source: 'PGN Mentor',
  licence: 'moves only (facts)',
  ...over,
})

describe('LibraryList', () => {
  it('lists each game with its players, year, event, result and opening, opening it on the analysis board', () => {
    render(<LibraryList games={[game()]} />)
    const link = screen.getByRole('link', { name: /Fischer, Robert James – Spassky, Boris V/ })
    expect(link.getAttribute('href')).toBe('/analysis?library=g1')
    expect(screen.getByText('1972')).toBeTruthy()
    expect(screen.getByText(/D59 Queen's Gambit Declined/)).toBeTruthy()
    expect(screen.getByText('World Championship')).toBeTruthy()
  })

  it('says when nothing matches', () => {
    render(<LibraryList games={[]} />)
    expect(screen.getByText('No library game matches.')).toBeTruthy()
  })
})

describe('PositionPanel', () => {
  it('counts the results and opens each game at the move it stood here', () => {
    render(
      <PositionPanel
        position={{
          games: 3,
          whiteWins: 1,
          draws: 1,
          blackWins: 1,
          items: [
            {
              id: 'g1',
              white: 'Fischer',
              black: 'Spassky',
              year: 1972,
              event: 'WCh',
              result: '1-0',
              ply: 12,
            },
          ],
        }}
      />,
    )
    expect(screen.getByText('3 games · white 1 · draws 1 · black 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Fischer – Spassky, 1972/ }).getAttribute('href')).toBe(
      '/analysis?library=g1&ply=12',
    )
  })

  it('says when no library game reached the position', () => {
    render(
      <PositionPanel position={{ games: 0, whiteWins: 0, draws: 0, blackWins: 0, items: [] }} />,
    )
    expect(screen.getByText('No library game reached this position.')).toBeTruthy()
  })
})
