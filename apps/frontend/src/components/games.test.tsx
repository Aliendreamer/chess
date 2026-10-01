import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Board,
  ClaimPanel,
  GameControls,
  MoveList,
  MoveNav,
  PlayerStrip,
  PromotionPicker,
  YourTurnList,
} from './games'
import type { ReactNode } from 'react'
import type { GameView } from '#/lib/games'

// The router's <Link> needs a router; the lists only need an anchor to their game.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params }: { children: ReactNode; params: { id: string } }) => (
    <a href={`/games/${params.id}`}>{children}</a>
  ),
}))

afterEach(cleanup)

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('Board', () => {
  it('renders an empty board on the server, every square named', () => {
    const html = renderToString(<Board fen={START} orientation="white" />)
    expect(html.match(/data-square="/g)?.length).toBe(64)
    expect(html).not.toContain('<img')
  })

  it('draws the Cburnett pieces once mounted', () => {
    const { container } = render(<Board fen={START} orientation="white" />)
    const images = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(images).toHaveLength(32)
    expect(images).toContain('/pieces/cburnett/wK.svg')
    expect(images).toContain('/pieces/cburnett/bN.svg')
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
      '/pieces/cburnett/bQ.svg',
      '/pieces/cburnett/bR.svg',
      '/pieces/cburnett/bB.svg',
      '/pieces/cburnett/bN.svg',
    ])
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

describe('game-page-navigation', () => {
  it("shows the surplus as the opponent's pieces and the points ahead", () => {
    const { container } = render(
      <PlayerStrip
        name="ann"
        detail="white"
        opponentColor="b"
        material={{ pieces: ['p', 'n'], plus: 4 }}
      />,
    )
    expect([...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      '/pieces/cburnett/bP.svg',
      '/pieces/cburnett/bN.svg',
    ])
    expect(screen.getByTestId('material-plus').textContent).toBe('+4')
  })

  it('shows no number for the side that is not ahead', () => {
    render(
      <PlayerStrip
        name="bob"
        detail="black"
        opponentColor="w"
        material={{ pieces: [], plus: 0 }}
      />,
    )
    expect(screen.queryByTestId('material-plus')).toBeNull()
  })

  it('a clicked move reports its ply and the viewed move is marked', () => {
    const onSelect = vi.fn()
    render(<MoveList sans={['e4', 'e5', 'Nf3']} viewPly={2} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'e5' }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'e4' }))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('without a viewed ply the latest move is marked', () => {
    render(<MoveList sans={['e4', 'e5', 'Nf3']} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Nf3' }).getAttribute('aria-current')).toBe('true')
  })

  it('the nav bar calls each step', () => {
    const steps = { onStart: vi.fn(), onBack: vi.fn(), onForward: vi.fn(), onEnd: vi.fn() }
    render(<MoveNav {...steps} />)
    for (const [name, fn] of [
      ['Start', steps.onStart],
      ['Back', steps.onBack],
      ['Forward', steps.onForward],
      ['End', steps.onEnd],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(fn).toHaveBeenCalledTimes(1)
    }
  })
})

describe('ClaimPanel', () => {
  it('claims a win or a draw, or keeps waiting', () => {
    const onClaim = vi.fn()
    const onWait = vi.fn()
    render(<ClaimPanel disabled={false} onClaim={onClaim} onWait={onWait} />)
    fireEvent.click(screen.getByRole('button', { name: 'Claim win' }))
    fireEvent.click(screen.getByRole('button', { name: 'Call it a draw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep waiting' }))
    expect(onClaim.mock.calls).toEqual([['win'], ['draw']])
    expect(onWait).toHaveBeenCalledOnce()
  })
})

describe('GameControls', () => {
  const view = (ply: number, drawOfferedBy: number | null = null) =>
    ({ ply, drawOfferedBy }) as GameView

  it('offers abort before both sides have moved', () => {
    const onCommand = vi.fn()
    render(
      <GameControls
        view={view(1)}
        meId={1}
        opponentId={2}
        disabled={false}
        onCommand={onCommand}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abort' }))
    expect(onCommand).toHaveBeenCalledWith({ kind: 'abort' })
  })

  it("answers the opponent's draw offer", () => {
    const onCommand = vi.fn()
    render(
      <GameControls
        view={view(4, 2)}
        meId={1}
        opponentId={2}
        disabled={false}
        onCommand={onCommand}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Accept draw' }))
    expect(onCommand).toHaveBeenCalledWith({ kind: 'draw-accept' })
  })

  it('shows my own offer as pending, and resigns', () => {
    const onCommand = vi.fn()
    render(
      <GameControls
        view={view(4, 1)}
        meId={1}
        opponentId={2}
        disabled={false}
        onCommand={onCommand}
      />,
    )
    expect(screen.getByRole('button', { name: 'Draw offered' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    expect(onCommand).toHaveBeenCalledWith({ kind: 'resign' })
  })
})

describe('GameControls against the computer', () => {
  const view = (ply: number) => ({ ply, drawOfferedBy: null }) as GameView

  it('offers resign but no draw', () => {
    const onCommand = vi.fn()
    render(
      <GameControls
        view={view(4)}
        meId={1}
        opponentId={-2}
        disabled={false}
        onCommand={onCommand}
        drawAllowed={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Offer draw' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    expect(onCommand).toHaveBeenCalledWith({ kind: 'resign' })
  })
})

describe('YourTurnList', () => {
  it('lists each game with the time left, or just "your move" without a deadline', () => {
    const base = {
      color: 'white' as const,
      opponentId: 2,
      status: 'playing' as const,
      result: null,
      reason: null,
      createdAt: '2026-09-27T09:00:00Z',
      yourTurn: true,
    }
    render(
      <YourTurnList
        nowMs={Date.parse('2026-09-27T10:00:00Z')}
        games={[
          {
            ...base,
            gameId: 'g1',
            opponent: 'bob',
            timeControl: '7d',
            deadlineAt: '2026-10-03T10:00:00Z',
          },
          { ...base, gameId: 'g2', opponent: 'ann', timeControl: '5+3', deadlineAt: null },
        ]}
      />,
    )
    const rows = screen.getByTestId('your-turn').querySelectorAll('li')
    expect(rows[0]?.textContent).toBe('vs bob7d6 days left')
    expect(rows[1]?.textContent).toBe('vs ann5+3your move')
  })
})
