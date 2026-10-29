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

  it('queues a premove while the engine thinks and plays it once the engine has answered', async () => {
    const s = await app()
    const answers = ['e7e5', 'b8c6']
    let answer: (uci: string) => void = () => undefined
    s.player.bestMove = () => new Promise((resolve) => (answer = resolve))
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const { container } = await renderApp(`/games/${game.id}`, s)
    await screen.findByText('Your move.')
    fireEvent.click(square(container, 'e2'))
    fireEvent.click(square(container, 'e4'))
    await screen.findByText(/is thinking/)
    fireEvent.click(square(container, 'g1'))
    fireEvent.click(square(container, 'f3'))
    answer(answers.shift()!)
    const moves = await screen.findByTestId('move-list')
    await waitFor(() => expect(moves.textContent).toContain('Nf3'))
    answer(answers.shift()!)
    await waitFor(() => expect(moves.textContent).toContain('Nc6'))
  })

  it('takes back the last move and the engine’s answer', async () => {
    const s = await app(['e7e5'])
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const { container } = await renderApp(`/games/${game.id}`, s)
    await screen.findByText('Your move.')
    expect(screen.getByRole('button', { name: 'Take back' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(square(container, 'e2'))
    fireEvent.click(square(container, 'e4'))
    const moves = await screen.findByTestId('move-list')
    await waitFor(() => expect(moves.textContent).toContain('e5'))
    fireEvent.click(screen.getByRole('button', { name: 'Take back' }))
    await screen.findByText('No moves yet.')
    await screen.findByText('Your move.')
    expect(screen.getByRole('button', { name: 'Take back' }).hasAttribute('disabled')).toBe(true)
  })

  it('plays on from a move picked in the list, the moves after it gone', async () => {
    const s = await app(['e7e5', 'b8c6'])
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const { container } = await renderApp(`/games/${game.id}`, s)
    await screen.findByText('Your move.')
    fireEvent.click(square(container, 'e2'))
    fireEvent.click(square(container, 'e4'))
    await waitFor(() => expect(screen.getByTestId('move-list').textContent).toContain('e5'))
    fireEvent.click(square(container, 'g1'))
    fireEvent.click(square(container, 'f3'))
    await waitFor(() => expect(screen.getByTestId('move-list').textContent).toContain('Nc6'))
    fireEvent.click(within(screen.getByTestId('move-list')).getByText('e5'))
    fireEvent.click(screen.getByRole('button', { name: 'Play from here' }))
    await waitFor(() => expect(screen.getByTestId('move-list').textContent).not.toContain('Nf3'))
    expect(screen.getByTestId('move-list').textContent).toContain('e5')
    await screen.findByText('Your move.')
  })

  it('plays on from an earlier position when a move is made there', async () => {
    const s = await app(['e7e5', 'b8c6', 'g8f6'])
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const { container } = await renderApp(`/games/${game.id}`, s)
    await screen.findByText('Your move.')
    fireEvent.click(square(container, 'e2'))
    fireEvent.click(square(container, 'e4'))
    await waitFor(() => expect(screen.getByTestId('move-list').textContent).toContain('e5'))
    fireEvent.click(square(container, 'g1'))
    fireEvent.click(square(container, 'f3'))
    await waitFor(() => expect(screen.getByTestId('move-list').textContent).toContain('Nc6'))
    // Back to after 1...e5 and a different second move.
    fireEvent.click(within(screen.getByTestId('move-list')).getByText('e5'))
    await screen.findByText('Your move from here: the later moves will be gone.')
    fireEvent.click(square(container, 'f1'))
    fireEvent.click(square(container, 'c4'))
    await waitFor(() => expect(screen.getByTestId('move-list').textContent).toContain('Bc4'))
    expect(screen.getByTestId('move-list').textContent).not.toContain('Nf3')
    await waitFor(() => expect(screen.getByTestId('move-list').textContent).toContain('Nf6'))
  })

  it('tells when the engine declines a draw, and ends the game when it resigns', async () => {
    const s = await app()
    let cp = 0
    s.evaluator.evaluate = () =>
      Promise.resolve({ thinkMs: 1500, depth: 20, lines: [{ cp, mate: null, pv: [] }] })
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await renderApp(`/games/${game.id}`, s)
    await screen.findByText('Your move.')
    fireEvent.click(screen.getByRole('button', { name: 'Offer draw' }))
    expect((await screen.findByTestId('offer-declined')).textContent).toBe(
      'Stockfish (Casual) declines the draw.',
    )
    cp = 900
    fireEvent.click(screen.getByRole('button', { name: 'Ask to resign' }))
    await screen.findByTestId('game-end')
  })

  it('drops a premove that is no longer legal', async () => {
    const s = await app()
    let answer: (uci: string) => void = () => undefined
    s.player.bestMove = () => new Promise((resolve) => (answer = resolve))
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const { container } = await renderApp(`/games/${game.id}`, s)
    await screen.findByText('Your move.')
    fireEvent.click(square(container, 'e2'))
    fireEvent.click(square(container, 'e4'))
    await screen.findByText(/is thinking/)
    // e4–e5 is blocked once the engine answers 1...e5.
    fireEvent.click(square(container, 'e4'))
    fireEvent.click(square(container, 'e5'))
    answer('e7e5')
    await screen.findByText('Your move.')
    expect((await screen.findByTestId('move-list')).textContent).not.toMatch(/2\./)
  })

  it('switches full screen with F11 or the rail’s button, and sizes the window on demand', async () => {
    const s = await app()
    let toggled = 0
    s.toggleFullscreen = () => {
      toggled++
      return Promise.resolve()
    }
    await renderApp('/', s)
    await screen.findByRole('button', { name: 'Play the computer' })
    fireEvent.keyDown(window, { key: 'F11' })
    expect(toggled).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(toggled).toBe(2)
    const resized: Array<string> = []
    s.resizeWindow = (change) => {
      resized.push(change)
      return Promise.resolve()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Smaller window' }))
    fireEvent.click(screen.getByRole('button', { name: 'Larger window' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fit screen' }))
    expect(resized).toEqual(['shrink', 'grow', 'fit'])
    // A window with a system title bar: no minimize or close of the app's own.
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('shows its own minimize and close when the window has no title bar (Linux)', async () => {
    const s = await app()
    const calls: Array<string> = []
    s.hasTitleBar = () => Promise.resolve(false)
    s.minimizeWindow = () => {
      calls.push('minimize')
      return Promise.resolve()
    }
    s.closeWindow = () => {
      calls.push('close')
      return Promise.resolve()
    }
    await renderApp('/', s)
    fireEvent.click(await screen.findByRole('button', { name: 'Minimize' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(calls).toEqual(['minimize', 'close'])
  })

  it('shows the evaluation bar and the best moves only when ticked, warning what they cost', async () => {
    const s = await app()
    await storeEvaluation(s.db, positionKey(STANDARD_START), {
      thinkMs: 10_000,
      depth: 20,
      lines: [
        { cp: 35, mate: null, pv: ['e2e4', 'e7e5', 'g1f3'] },
        { cp: 30, mate: null, pv: ['d2d4', 'd7d5'] },
      ],
    })
    const game = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await renderApp(`/games/${game.id}`, s)
    const bar = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Evaluation bar' })
    const line = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Best moves' })
    expect([bar.checked, line.checked]).toEqual([false, false])
    expect(screen.queryByTestId('eval-bar')).toBeNull()
    expect(screen.queryByTestId('engine-lines')).toBeNull()
    expect(screen.queryByTestId('evaluation-warning')).toBeNull()

    fireEvent.click(bar)
    expect((await screen.findByRole('img', { name: 'Evaluation +0.35' })).dataset['testid']).toBe(
      'eval-bar',
    )
    expect(screen.getByTestId('evaluation-warning').textContent).toContain('second Stockfish')
    expect(screen.queryByTestId('engine-lines')).toBeNull()

    fireEvent.click(line)
    await waitFor(() =>
      expect(screen.getAllByTestId('engine-line').map((l) => l.textContent)).toEqual([
        '+0.35e4 e5 Nf3',
        '+0.30d4 d5',
      ]),
    )
    fireEvent.click(bar)
    await waitFor(() => expect(screen.queryByTestId('eval-bar')).toBeNull())
    expect(screen.getByTestId('engine-lines')).toBeTruthy()
  })

  it('remembers the evaluation switches for the next game', async () => {
    const s = await app()
    const first = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await renderApp(`/games/${first.id}`, s)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Best moves' }))
    await screen.findByTestId('engine-lines')
    cleanup()
    const second = await createGame(s.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await renderApp(`/games/${second.id}`, s)
    const line = await screen.findByRole<HTMLInputElement>('checkbox', { name: 'Best moves' })
    const bar = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Evaluation bar' })
    expect([bar.checked, line.checked]).toEqual([false, true])
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
