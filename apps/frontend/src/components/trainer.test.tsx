import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ColorSwitch,
  DrillStatus,
  FamilyList,
  LinesTable,
  RunOutcome,
  StudyLinesTable,
  StudyList,
  TrainedFamilies,
  TrainerSourceSwitch,
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

describe('studies in the trainer (study-repertoire-trainer)', () => {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

  it('switches between the named openings and my studies with links', () => {
    render(<TrainerSourceSwitch source="studies" color="black" />)
    const named = screen.getByRole('link', { name: 'Named openings' })
    const mine = screen.getByRole('link', { name: 'My studies' })
    expect(named.getAttribute('href')).toBe('/trainer?color=black')
    expect(mine.getAttribute('href')).toBe('/trainer?color=black&source=studies')
    expect(mine.getAttribute('aria-current')).toBe('page')
    expect(named.getAttribute('aria-current')).toBeNull()
  })

  it('lists my studies with their lines and progress, each opening its drill', () => {
    render(
      <StudyList
        studies={[
          { id: 's1', title: 'My e4', lines: 2, learned: 1, createdAt: '2026-10-05T10:00:00Z' },
        ]}
        color="black"
      />,
    )
    expect(screen.getByRole('link', { name: /My e4/ }).getAttribute('href')).toBe(
      '/trainer/study/s1?color=black',
    )
    expect(screen.getByRole('img', { name: '1 of 2 learned' })).toBeTruthy()
  })

  it('points to the studies when there are none', () => {
    render(<StudyList studies={[]} color="white" />)
    expect(screen.getByRole('link', { name: 'Make a study' }).getAttribute('href')).toContain(
      '/studies',
    )
  })

  it("names the study's lines from the main line and shows their state", () => {
    render(
      <StudyLinesTable
        startFen={START}
        lines={[
          { key: 'a', moves: ['e2e4', 'e7e5', 'g1f3'], box: 4, dueAt: null },
          { key: 'b', moves: ['e2e4', 'e7e5', 'f2f4'], box: null, dueAt: null },
        ]}
      />,
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => r.textContent)).toEqual(['Main linelearned', '… 2.f4new'])
  })

  it("says a move is the study's other line without calling it wrong", () => {
    render(
      <DrillStatus
        line={{ moves: ['e2e4', 'e7e5', 'g1f3'] }}
        ply={2}
        yourMove
        wrong={null}
        otherLine={{ played: 'f2f4', expected: 'g1f3' }}
      />,
    )
    expect(screen.getByTestId('drill-status').textContent).toBe(
      '2.f4 is your other line here. This one goes 2.Nf3.',
    )
  })
})
