import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryList, PositionPanel } from './library.tsx'
import type { ReactNode } from 'react'
import type { LibraryGameItem } from './library-model.ts'

afterEach(cleanup)

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

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
              source: 'PGN Mentor',
              sourceRef: null,
            },
          ],
          moves: [],
        }}
        fen={START}
        onPlay={vi.fn()}
        source="all"
        onSource={vi.fn()}
      />,
    )
    expect(screen.getByText('3 games · white 1 · draws 1 · black 1')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Fischer – Spassky, 1972/ }).getAttribute('href')).toBe(
      '/analysis?library=g1&ply=12',
    )
  })

  it('says when no library game reached the position', () => {
    render(
      <PositionPanel
        position={{ games: 0, whiteWins: 0, draws: 0, blackWins: 0, items: [], moves: [] }}
        fen={START}
        onPlay={vi.fn()}
        source="all"
        onSource={vi.fn()}
      />,
    )
    expect(screen.getByText('No library game reached this position.')).toBeTruthy()
  })
})

describe('the explorer (library-explorer)', () => {
  it('lists the moves played next in notation with counts, a result bar and the opening reached', () => {
    const onPlay = vi.fn()
    render(
      <PositionPanel
        position={{
          games: 3,
          whiteWins: 1,
          draws: 1,
          blackWins: 1,
          items: [],
          moves: [
            {
              uci: 'e2e4',
              games: 2,
              whiteWins: 1,
              draws: 1,
              blackWins: 0,
              eco: 'B00',
              opening: "King's Pawn",
            },
            {
              uci: 'd2d4',
              games: 1,
              whiteWins: 0,
              draws: 0,
              blackWins: 1,
              eco: null,
              opening: null,
            },
          ],
        }}
        fen={START}
        onPlay={onPlay}
        source="all"
        onSource={vi.fn()}
      />,
    )
    const rows = screen
      .getByRole('table', { name: 'Moves played here' })
      .querySelectorAll('tbody tr')
    expect([...rows].map((r) => r.querySelector('button')?.textContent)).toEqual(['e4', 'd4'])
    expect(screen.getByText("B00 King's Pawn")).toBeTruthy()
    expect(
      screen.getByRole('img', { name: '50% white wins, 50% draws, 0% black wins' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play e4' }))
    expect(onPlay).toHaveBeenCalledWith('e2e4')
  })
})

describe('the explorer by source (broadcast-explorer)', () => {
  const broadcastGame = {
    id: 'b1',
    white: 'Carlsen',
    black: 'Nepomniachtchi',
    year: 2026,
    event: 'Synthetic Open',
    result: '1-0',
    ply: 3,
    source: 'lichess broadcasts',
    sourceRef: 'https://lichess.org/broadcast/s/r/abc',
  }
  const position = {
    games: 1,
    whiteWins: 1,
    draws: 0,
    blackWins: 0,
    items: [broadcastGame],
    moves: [],
  }

  it('switches the source and credits what it counts', () => {
    const onSource = vi.fn()
    render(
      <PositionPanel
        position={position}
        fen={START}
        onPlay={vi.fn()}
        source="all"
        onSource={onSource}
      />,
    )
    const group = screen.getByRole('group', { name: 'Source' })
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'All',
      'World Championships',
      'Broadcasts',
    ])
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Broadcasts' }))
    expect(onSource).toHaveBeenCalledWith('broadcasts')
    expect(
      screen.getByRole('link', { name: 'Lichess broadcasts, CC BY-SA 4.0' }).getAttribute('href'),
    ).toBe('https://database.lichess.org/#broadcasts')
    expect(screen.getByRole('link', { name: 'World Championships from PGN Mentor' })).toBeTruthy()
    expect(screen.getByText(/indexed for their first 20 moves/)).toBeTruthy()
  })

  it('links a broadcast game to its lichess page', () => {
    render(
      <PositionPanel
        position={position}
        fen={START}
        onPlay={vi.fn()}
        source="broadcasts"
        onSource={vi.fn()}
      />,
    )
    expect(
      screen
        .getByRole('link', { name: 'Carlsen – Nepomniachtchi on lichess' })
        .getAttribute('href'),
    ).toBe('https://lichess.org/broadcast/s/r/abc')
    expect(screen.queryByRole('link', { name: 'World Championships from PGN Mentor' })).toBeNull()
  })

  it('says nothing about broadcast indexing when only the curated games count', () => {
    render(
      <PositionPanel
        position={position}
        fen={START}
        onPlay={vi.fn()}
        source="wc"
        onSource={vi.fn()}
      />,
    )
    expect(screen.queryByText(/indexed for their first 20 moves/)).toBeNull()
  })
})
