import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Board,
  BoardPlaceholder,
  ClaimPanel,
  GameControls,
  GameOverCard,
  GameResultPanel,
  MiniBoard,
  MoveList,
  MoveNav,
  PlayerStrip,
  PromotionPicker,
  RecentGames,
  RematchOffer,
  TvGrid,
  YourTurnList,
} from './games'
import type { ReactNode } from 'react'
import type { GameView } from '#/lib/games'

// The router's <Link> needs a router; the lists only need an anchor to their game.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: ReactNode
    to: string
    params: { id: string }
    'aria-label'?: string
  }) => (
    <a href={to.replace('$id', params.id)} aria-label={rest['aria-label']}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

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

describe('game-feedback', () => {
  it('the game-over card shows the result, the reason and its actions, and closes', () => {
    const onClose = vi.fn()
    render(
      <GameOverCard result="0-1" reason="checkmate" onClose={onClose}>
        <button type="button">Analyse</button>
      </GameOverCard>,
    )
    expect(screen.getByTestId('game-over').textContent).toContain('0–1')
    expect(screen.getByTestId('game-over').textContent).toContain('Checkmate')
    expect(screen.getByRole('button', { name: 'Analyse' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('nobody asked: a Rematch button', () => {
    const onRematch = vi.fn()
    render(
      <RematchOffer state={{ kind: 'none' }} opponent="bob" busy={false} onRematch={onRematch} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rematch' }))
    expect(onRematch).toHaveBeenCalled()
  })

  it('I asked: waiting for them', () => {
    render(
      <RematchOffer state={{ kind: 'offered' }} opponent="bob" busy={false} onRematch={() => {}} />,
    )
    expect(screen.getByTestId('rematch').textContent).toBe('Rematch offered · waiting for bob')
  })

  it('they asked: accept or decline', () => {
    const onRematch = vi.fn()
    render(
      <RematchOffer state={{ kind: 'asked' }} opponent="bob" busy={false} onRematch={onRematch} />,
    )
    expect(screen.getByTestId('rematch').textContent).toContain('bob wants a rematch')
    fireEvent.click(screen.getByRole('button', { name: 'Accept rematch' }))
    expect(onRematch).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(screen.queryByRole('button', { name: 'Accept rematch' })).toBeNull()
  })
})

describe('icons (site-themes)', () => {
  it('sit beside the action names, hidden from assistive tech', () => {
    const { container } = render(
      <GameControls
        view={{ ply: 4, drawOfferedBy: null } as GameView}
        meId={1}
        opponentId={2}
        disabled={false}
        onCommand={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Resign' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Offer draw' })).toBeDefined()
    const icons = [...container.querySelectorAll('svg')]
    expect(icons.length).toBe(2)
    expect(icons.every((svg) => svg.getAttribute('aria-hidden') === 'true')).toBe(true)
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
    // game-feedback: the answer stands out (a pulse, unless reduced motion).
    expect(screen.getByTestId('draw-offer').className).toContain('motion-safe:animate-[offer')
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

  it('marks each game with its type colour (site-themes)', () => {
    const { container } = render(
      <YourTurnList
        nowMs={0}
        games={[
          {
            color: 'white',
            opponentId: 2,
            status: 'playing',
            result: null,
            reason: null,
            createdAt: '2026-09-27T09:00:00Z',
            yourTurn: true,
            gameId: 'g1',
            opponent: 'bob',
            timeControl: '7d',
            deadlineAt: null,
          },
        ]}
      />,
    )
    const mark = container.querySelector('[data-category]')
    expect(mark?.getAttribute('data-category')).toBe('correspondence')
    expect(mark?.className).toContain('bg-tc-correspondence')
  })
})

describe('MiniBoard', () => {
  const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

  it('is drawn on the server: every square and piece is in the HTML', () => {
    const html = renderToString(<MiniBoard fen={START} label="testuser vs player" />)
    expect(html.match(/data-square=/g)).toHaveLength(64)
    expect(html.match(/<img/g)).toHaveLength(32)
  })

  it('tints the last move and names the board', () => {
    render(<MiniBoard fen={AFTER_E4} lastUci="e2e4" label="testuser vs player" />)
    const board = screen.getByRole('img', { name: 'testuser vs player' })
    expect(board.querySelectorAll('[data-last]')).toHaveLength(2)
    expect(board.querySelector('[data-square="e4"] img')).not.toBeNull()
    expect(board.querySelector('[data-square="e2"] img')).toBeNull()
    expect(board.querySelector('[data-square="a8"]')).toBe(board.firstElementChild)
  })
})

describe('TvGrid', () => {
  const tv = (gameId: string, white: string, black: string) => ({
    gameId,
    whiteId: 1,
    white,
    blackId: 2,
    black,
    timeControl: '3+2',
    fen: START,
    lastUci: null,
    ply: 0,
    updatedAt: '2026-10-02T10:00:00Z',
  })

  it('opens each game from its board and names both players', () => {
    render(
      <TvGrid games={[tv('g1', 'testuser', 'player'), tv('g2', 'anna', 'Stockfish (Club)')]} />,
    )
    const links = screen.getAllByRole('link')
    const games = links.map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/games/'))
    expect(games).toEqual(['/games/g1', '/games/g2'])
    expect(screen.getByRole('img', { name: 'testuser vs player, 3+2' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Stockfish (Club)' }).getAttribute('href')).toBe(
      '/players/2',
    )
  })

  it('says so when no game is on', () => {
    render(<TvGrid games={[]} empty="No games on right now." />)
    expect(screen.getByText('No games on right now.')).toBeTruthy()
  })
})

describe('RecentGames', () => {
  it('names the opponent as a link to their profile and opens the game from its ending', () => {
    render(
      <RecentGames
        games={[
          {
            gameId: 'g1',
            color: 'white',
            opponentId: 5,
            opponent: 'player',
            timeControl: '3+2',
            status: 'ended',
            result: '0-1',
            reason: 'checkmate',
            createdAt: '2026-10-02T10:00:00Z',
          },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'player' }).getAttribute('href')).toBe('/players/5')
    expect(screen.getByRole('link', { name: 'Open the game vs player' }).getAttribute('href')).toBe(
      '/games/g1',
    )
  })
})

describe('RecentGames when empty', () => {
  it('says so, in the words the page gives', () => {
    const { rerender } = render(<RecentGames games={[]} />)
    expect(screen.getByText('No games yet.')).toBeTruthy()
    rerender(
      <RecentGames games={[]} empty="No games yet: pick a time control under Quick pairing." />,
    )
    expect(screen.getByText('No games yet: pick a time control under Quick pairing.')).toBeTruthy()
  })
})

describe('GameResultPanel (ui-polish)', () => {
  it('writes the reason as the game-over card does', () => {
    render(<GameResultPanel result="0-1" reason="checkmate" pgnHref="/pgn/g1" />)
    expect(screen.getByTestId('result-panel').textContent).toContain('Checkmate')
  })
})

describe('BoardPlaceholder (ui-polish)', () => {
  it('is a named group like the live board', () => {
    render(<BoardPlaceholder orientation="white" />)
    expect(screen.getByRole('group', { name: 'Chess board' })).toBeTruthy()
  })
})
