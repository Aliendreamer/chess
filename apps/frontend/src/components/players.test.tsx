import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerStats } from './players'
import { PlayerLink } from './games'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params: { id: string } }) => (
    <a href={to.replace('$id', params.id)}>{children}</a>
  ),
}))

afterEach(cleanup)

describe('PlayerLink', () => {
  it('links a name to its profile', () => {
    render(<PlayerLink id={-2} name="Stockfish (Club)" />)
    expect(screen.getByRole('link', { name: 'Stockfish (Club)' }).getAttribute('href')).toBe(
      '/players/-2',
    )
  })

  it('leaves the unknown player (id 0) as plain text', () => {
    render(<PlayerLink id={0} name="Player 0" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Player 0')).toBeTruthy()
  })
})

describe('PlayerStats', () => {
  it('shows the totals, a bar and one row per game type', () => {
    render(
      <PlayerStats
        record={{
          wins: 3,
          draws: 1,
          losses: 2,
          byTimeControl: [
            { timeControl: '3+0', wins: 2, draws: 1, losses: 0 },
            { timeControl: '5+3', wins: 1, draws: 0, losses: 1 },
            { timeControl: '10+5', wins: 0, draws: 0, losses: 1 },
          ],
        }}
      />,
    )
    expect(screen.getByTestId('record-total').textContent).toBe('3 wins · 1 draw · 2 losses')
    expect(screen.getByRole('img', { name: '50% wins, 17% draws, 33% losses' })).toBeTruthy()
    const rows = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent))
    expect(rows).toEqual([
      ['Blitz', '3', '1', '1'],
      ['Rapid', '0', '0', '1'],
    ])
  })

  it('says when there are no finished games yet', () => {
    render(<PlayerStats record={{ wins: 0, draws: 0, losses: 0, byTimeControl: [] }} />)
    expect(screen.getByText('No finished games yet.')).toBeTruthy()
  })
})
