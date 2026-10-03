import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ColorSwitch,
  DrillStatus,
  FamilyList,
  LinesTable,
  RunOutcome,
  TrainedFamilies,
} from './trainer'
import type { ReactNode } from 'react'
import type { TrainerLine } from '#/lib/trainer'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    search,
    ...rest
  }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
    search?: Record<string, unknown>
  }) => {
    const path = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to)
    return (
      <a
        href={`${path}?${new URLSearchParams(search as Record<string, string>).toString()}`}
        {...rest}
      >
        {children}
      </a>
    )
  },
}))

afterEach(cleanup)

const line = (over: Partial<TrainerLine> = {}): TrainerLine => ({
  key: 'k',
  name: 'Ruy Lopez: Berlin Defense',
  eco: 'C65',
  moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'g8f6'],
  box: null,
  dueAt: null,
  ...over,
})

describe('FamilyList', () => {
  it('links each family for the colour with its progress', () => {
    render(<FamilyList families={[{ name: 'Ruy Lopez', lines: 41, learned: 23 }]} color="black" />)
    expect(screen.getByRole('link', { name: /Ruy Lopez/ }).getAttribute('href')).toBe(
      '/trainer/Ruy Lopez?color=black',
    )
    expect(screen.getByRole('img', { name: '23 of 41 learned' })).toBeTruthy()
    expect(screen.getByText('23 of 41 learned', { selector: 'span' })).toBeTruthy()
  })

  it('says when no family matches', () => {
    render(<FamilyList families={[]} color="white" />)
    expect(screen.getByText('No opening matches.')).toBeTruthy()
  })
})

describe('ColorSwitch', () => {
  it('links both colours, the current one marked', () => {
    render(<ColorSwitch color="white" />)
    expect(screen.getByRole('link', { name: 'As White' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'As Black' }).getAttribute('href')).toBe(
      '/trainer?color=black',
    )
  })
})

describe('DrillStatus', () => {
  it('asks for the member’s move, or waits for the board', () => {
    const { rerender } = render(<DrillStatus line={line()} ply={1} yourMove wrong={null} />)
    expect(screen.getByTestId('drill-status').textContent).toBe('Your move.')
    rerender(<DrillStatus line={line()} ply={0} yourMove={false} wrong={null} />)
    expect(screen.getByTestId('drill-status').textContent).toBe('The board plays…')
  })

  it('shows a wrong move with the right one', () => {
    render(
      <DrillStatus line={line()} ply={5} yourMove wrong={{ played: 'a7a6', expected: 'g8f6' }} />,
    )
    expect(screen.getByTestId('drill-status').textContent).toBe(
      '3...a6 is not the line. Play 3...Nf6.',
    )
  })
})

describe('RunOutcome', () => {
  it('says what the run did to the line', () => {
    const { rerender } = render(
      <RunOutcome
        mistakes={0}
        result={{ lineKey: 'k', box: 3, dueAt: '2026-10-10T00:00:00Z', learned: true }}
      />,
    )
    expect(screen.getByTestId('run-outcome').textContent).toBe(
      'Clean. Learned — due again 10 Oct 2026.',
    )
    rerender(
      <RunOutcome
        mistakes={2}
        result={{ lineKey: 'k', box: 0, dueAt: '2026-10-03T00:00:00Z', learned: false }}
      />,
    )
    expect(screen.getByTestId('run-outcome').textContent).toBe(
      '2 mistakes. This line comes back first.',
    )
  })
})

describe('LinesTable', () => {
  it('lists each line with its state', () => {
    render(
      <LinesTable
        lines={[
          line(),
          line({ key: 'b', name: 'Ruy Lopez: Morphy Defense', box: 1 }),
          line({ key: 'c', box: 4 }),
        ]}
      />,
    )
    const rows = screen.getByRole('table', { name: 'Lines' }).querySelectorAll('tbody tr')
    expect([...rows].map((r) => r.querySelector('td:last-child')?.textContent)).toEqual([
      'new',
      'learning',
      'learned',
    ])
  })
})

describe('TrainedFamilies', () => {
  it('lists the families trained, or invites to train', () => {
    const { rerender } = render(
      <TrainedFamilies families={[{ name: 'Ruy Lopez', color: 'white', lines: 41, learned: 2 }]} />,
    )
    expect(screen.getByRole('link', { name: /Ruy Lopez · as White/ }).getAttribute('href')).toBe(
      '/trainer/Ruy Lopez?color=white',
    )
    rerender(<TrainedFamilies families={[]} />)
    expect(screen.getByText(/No openings trained yet/)).toBeTruthy()
  })
})
