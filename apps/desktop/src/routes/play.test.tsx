import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { STANDARD_START, positionKey } from '@chess/core'
import { fakeServices, renderApp } from '#/testing'
import { createGame, resign } from '#/lib/data/play'
import { storeEvaluation } from '#/lib/data/analysis'

// jsdom has no layout: react-chessboard cannot measure a square to animate a move, so the board is told to skip it.
beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList
})

/** A board square by name; the board names every square with `data-square`. */
function square(container: HTMLElement, name: string): Element {
  const found = container.querySelector(`[data-square="${name}"]`)
  if (!found) throw new Error(`No square ${name} on the board`)
  return found
}

const services: Array<{ close: () => void }> = []
afterEach(() => {
  cleanup()
  services.splice(0).forEach((s) => s.close())
})
async function app(moves: Array<string> = []) {
  const s = await fakeServices(moves)
  services.push(s)
  return s
}

describe('playing the computer (desktop-app)', () => {
  it('starts a game from home with the chosen level and think time', async () => {
    const s = await app()
    const { router } = await renderApp('/', s)
    fireEvent.click(await screen.findByRole('button', { name: 'Level Expert' }))
    fireEvent.click(screen.getByRole('button', { name: '20 s' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play the computer' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/games\//))
    const [row] = await s.db.select<{ engine_level: string; think_seconds: number }>(
      'SELECT engine_level, think_seconds FROM games',
    )
    expect(row).toEqual({ engine_level: '2000', think_seconds: 20 })
  })

  it('plays a clicked move and shows the engine’s answer', async () => {
    const s = await app(['e7e5'])
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const { container } = await renderApp(`/games/${game.id}`, s)
    await screen.findByText('Your move.')
    fireEvent.click(square(container, 'e2'))
    fireEvent.click(square(container, 'e4'))
    const moves = await screen.findByTestId('move-list')
    await waitFor(() => expect(moves.textContent).toContain('e5'))
    expect(moves.textContent).toContain('e4')
  })

  it('shows the evaluation bar and the best line only when switched on, warning what they cost', async () => {
    const s = await app()
    await storeEvaluation(s.db, positionKey(STANDARD_START), {
      thinkMs: 10_000,
      depth: 20,
      lines: [{ cp: 35, mate: null, pv: ['e2e4', 'e7e5', 'g1f3'] }],
    })
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await renderApp(`/games/${game.id}`, s)
    const bar = await screen.findByRole('button', { name: 'Evaluation bar' })
    const line = screen.getByRole('button', { name: 'Best line' })
    expect(screen.queryByTestId('eval-bar')).toBeNull()
    expect(screen.queryByTestId('engine-line')).toBeNull()
    expect(screen.queryByTestId('evaluation-warning')).toBeNull()

    fireEvent.click(bar)
    expect(
      (await screen.findByRole('img', { name: 'Evaluation +0.35' })).dataset['testid'],
    ).toBe('eval-bar')
    expect(screen.getByTestId('evaluation-warning').textContent).toContain('second Stockfish')
    expect(screen.queryByTestId('engine-line')).toBeNull()

    fireEvent.click(line)
    await waitFor(() =>
      expect(screen.getByTestId('engine-line').textContent).toBe('+0.35e4 e5 Nf3'),
    )
    fireEvent.click(bar)
    await waitFor(() => expect(screen.queryByTestId('eval-bar')).toBeNull())
    expect(screen.getByTestId('engine-line')).toBeTruthy()
  })

  it('remembers the evaluation switches for the next game', async () => {
    const s = await app()
    const first = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await renderApp(`/games/${first.id}`, s)
    fireEvent.click(await screen.findByRole('button', { name: 'Best line' }))
    await screen.findByTestId('engine-line')
    cleanup()
    const second = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await renderApp(`/games/${second.id}`, s)
    expect(
      (await screen.findByRole('button', { name: 'Best line' })).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Evaluation bar' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('offers a finished game’s PGN and a new game', async () => {
    const s = await app()
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await resign(s.db, game.id)
    await renderApp(`/games/${game.id}`, s)
    const end = await screen.findByTestId('game-end')
    expect(end.textContent).toContain('You lost')
    fireEvent.click(within(end).getByRole('button', { name: 'Save PGN' }))
    await waitFor(() => expect(s.saved[0]?.text).toContain('[Result "0-1"]'))
  })

  it('lists the games played', async () => {
    const s = await app()
    await createGame(s.db, { level: 'max', color: 'black', thinkSeconds: 10 })
    await renderApp('/games', s)
    expect((await screen.findAllByTestId('game-row'))[0]?.textContent).toContain(
      'Stockfish (Maximum) – You',
    )
  })
})

describe('the review on a finished game (game-review)', () => {
  it('starts by itself and shows the review panel', async () => {
    const s = await app(['e7e5', 'd8h4'])
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const { personMove, engineMove } = await import('#/lib/data/play')
    await personMove(s.db, game.id, 'f2f3')
    await engineMove(s.db, s.player, game.id)
    await personMove(s.db, game.id, 'g2g4')
    await engineMove(s.db, s.player, game.id)
    await renderApp(`/games/${game.id}`, s)
    expect(await screen.findByTestId('review-panel')).toBeTruthy()
    await waitFor(async () =>
      expect(await s.db.select('SELECT game_id FROM reviews')).toHaveLength(1),
    )
  })
})
