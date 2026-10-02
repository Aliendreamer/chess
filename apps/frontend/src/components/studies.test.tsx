import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisBoard, MoveTree, StudyList } from './studies'
import type { ReactNode } from 'react'
import type { StudyMove } from '#/lib/studies'
import type { Analysis } from '#/lib/analysis'
import { STANDARD_START, playMove, useMoveTree } from '#/lib/studies'
import { DEFAULT_PREFERENCES, PreferencesContext } from '#/lib/auth'

// The router's <Link> needs a router; the list only needs an anchor to its study.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params }: { children: ReactNode; params: { id: string } }) => (
    <a href={`/studies/${params.id}`}>{children}</a>
  ),
}))

afterEach(cleanup)

/** Builds a line of real moves from a start, so SAN and FEN are the board's own. */
function line(fen: string, ucis: Array<string>): Array<StudyMove> {
  const [first, ...rest] = ucis
  if (!first) return []
  const move = playMove(fen, first)!
  return [{ ...move, children: line(move.fen, rest) }]
}

describe('MoveTree', () => {
  // 1.e4 e5 (1...c5 2.Nf3) 2.Nf3
  const e4 = playMove(STANDARD_START, 'e2e4')!
  const tree: Array<StudyMove> = [
    { ...e4, children: [...line(e4.fen, ['e7e5', 'g1f3']), ...line(e4.fen, ['c7c5', 'g1f3'])] },
  ]

  it('shows the main line with each variation in brackets after the move it replaces', () => {
    render(<MoveTree tree={tree} startFen={STANDARD_START} current={[]} onSelect={() => {}} />)

    expect(screen.getByTestId('move-tree').textContent).toBe(
      '1.e4e5(1...c5 2.Nf3)2.Nf3'.replace(' ', ''),
    )
  })

  it('marks the current move and selects the one clicked', () => {
    const onSelect = vi.fn()
    render(<MoveTree tree={tree} startFen={STANDARD_START} current={[0, 1]} onSelect={onSelect} />)

    expect(screen.getByRole('button', { name: 'c5' }).getAttribute('aria-current')).toBe('step')
    fireEvent.click(screen.getByRole('button', { name: 'e5' }))
    expect(onSelect).toHaveBeenCalledWith([0, 0])
  })

  it('invites a first move when there is none', () => {
    render(<MoveTree tree={[]} startFen={STANDARD_START} current={[]} onSelect={() => {}} />)

    expect(screen.getByText('No moves yet: play one on the board.')).toBeDefined()
  })
})

describe('StudyList', () => {
  it('links each study with its players and whether it is shared', () => {
    render(
      <StudyList
        studies={[
          {
            id: 's1',
            title: 'Ruy',
            white: 'ann',
            black: 'bob',
            shared: true,
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 's2',
            title: 'Blank',
            white: null,
            black: null,
            shared: false,
            createdAt: '',
            updatedAt: '',
          },
        ]}
      />,
    )

    const rows = screen.getByTestId('study-list').querySelectorAll('li')
    expect(rows[0]?.textContent).toBe('Ruyann – bob · shared')
    expect(rows[1]?.textContent).toBe('Blank')
    expect(screen.getByRole('link', { name: 'Ruy' }).getAttribute('href')).toBe('/studies/s1')
  })
})

describe('AnalysisBoard (analysis-board)', () => {
  const analysis: Analysis = {
    think: 'normal',
    setThink: vi.fn(),
    evaluationOf: () => null,
    analyse: vi.fn(),
    thinking: false,
    error: null,
  }

  function Harness({ editable }: { editable: boolean }) {
    const e4 = playMove(STANDARD_START, 'e2e4')!
    const editor = useMoveTree(STANDARD_START, [
      { ...e4, children: [{ ...playMove(e4.fen, 'e7e5')!, children: [] }] },
    ])
    // No slide: jsdom cannot measure squares for react-chessboard's animation.
    return (
      <PreferencesContext value={{ ...DEFAULT_PREFERENCES, animation: 'off' }}>
        <AnalysisBoard
          editor={editor}
          analysis={analysis}
          editable={editable}
          header={<h1>Heading</h1>}
        >
          <p>tools</p>
        </AnalysisBoard>
      </PreferencesContext>
    )
  }

  it('lays out the board, the header, the tree, the engine and the page tools', () => {
    render(<Harness editable />)
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /e4/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /e5/ })).toBeTruthy()
    expect(screen.getByText('tools')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Flip board' })).toBeTruthy()
  })

  it('selects a move from the tree', () => {
    render(<Harness editable={false} />)
    fireEvent.click(screen.getByRole('button', { name: /e4/ }))
    expect(screen.getByRole('button', { name: /e4/ }).getAttribute('aria-current')).toBe('step')
  })
})
