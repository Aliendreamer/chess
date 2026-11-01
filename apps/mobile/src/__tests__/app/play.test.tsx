import { join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { createGame, engineMove, personMove, resign } from '@chess/local'
import { startApp, tapSquare, testApp } from '@/testing/app'
import type { TestApp } from '@/testing/app'

// The real routes and layouts, on services over Node's SQLite with a scripted engine.
jest.mock('@/lib/app', () => ({
  startMobileServices: () =>
    jest.requireActual<typeof import('@/testing/app')>('@/testing/app').startTestServices(),
}))

const APP = join(__dirname, '../../app')

afterEach(() => testApp().services.dispose())

/** Renders the app at `url`; the pathname helpers sit on renderRouter's promise, so that is what comes back. */
async function open(url: string) {
  const router = renderRouter(APP, { initialUrl: url })
  await router
  return { getPathname: () => router.getPathname() }
}

const moves = () => within(screen.getByTestId('move-list'))

/** The app started with a new game, White against Casual; `ready` changes it before the screen opens. */
async function gameFirst(
  answers: Array<string> = [],
  ready: (app: TestApp) => void = () => undefined,
) {
  const app = await startApp({ answers })
  ready(app)
  return (await createGame(app.services.db, { level: '1320', color: 'white', thinkSeconds: 5 })).id
}

/** The engine answers when the test says so. */
function heldEngine() {
  const queue: Array<(uci: string) => void> = []
  return {
    bestMove: () => new Promise<string | null>((resolve) => queue.push(resolve)),
    answer: (uci: string) => queue.shift()?.(uci),
  }
}

describe('playing the computer (mobile-app 5.5)', () => {
  test('starts a game from Play with the chosen level and think time', async () => {
    await startApp({ answers: ['e2e4'] })
    const router = await open('/play')
    await fireEvent.press(await screen.findByRole('button', { name: 'Level Expert' }))
    await fireEvent.press(screen.getByRole('button', { name: '20 s' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Black' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Play the computer' }))
    await waitFor(() => expect(router.getPathname()).toMatch(/^\/play\/games\/[\w-]+$/))
    const [row] = await testApp().services.db.select<{
      engine_level: string
      think_seconds: number
      person_color: string
    }>('SELECT engine_level, think_seconds, person_color FROM games')
    expect(row).toEqual({ engine_level: '2000', think_seconds: 20, person_color: 'black' })
  })

  test('remembers the last choices for the next game', async () => {
    await open('/play')
    await fireEvent.press(await screen.findByRole('button', { name: 'Level Master' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Play the computer' }))
    await screen.findByText('Your move.')
    expect(
      await testApp().services.db.select('SELECT value FROM settings WHERE key = ?', [
        'play.choice',
      ]),
    ).toEqual([{ value: JSON.stringify({ level: '2400', color: 'white', think: 5 }) }])
  })

  test('plays a tapped move and shows the engine’s answer', async () => {
    const id = await gameFirst(['e7e5'])
    const router = await open(`/play/games/${id}`)
    expect(router.getPathname()).toBe(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await tapSquare('e2')
    await tapSquare('e4')
    await waitFor(() => expect(moves().getByText('e5')).toBeTruthy())
    expect(moves().getByText('e4')).toBeTruthy()
    // A game takes the whole screen: no tab bar.
    expect(screen.queryByLabelText(/^Play, tab/)).toBeNull()
  })

  test('queues a premove while the engine thinks and plays it once the engine has answered', async () => {
    const engine = heldEngine()
    const id = await gameFirst([], ({ services }) => {
      services.player = { bestMove: engine.bestMove }
    })
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await tapSquare('e2')
    await tapSquare('e4')
    await screen.findByText(/is thinking/)
    await tapSquare('g1')
    await tapSquare('f3')
    expect(screen.getByTestId('premove-f3')).toBeTruthy()
    engine.answer('e7e5')
    await waitFor(() => expect(moves().getByText('Nf3')).toBeTruthy())
    engine.answer('b8c6')
    await waitFor(() => expect(moves().getByText('Nc6')).toBeTruthy())
  })

  test('drops a premove that is no longer legal', async () => {
    const engine = heldEngine()
    const id = await gameFirst([], ({ services }) => {
      services.player = { bestMove: engine.bestMove }
    })
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await tapSquare('e2')
    await tapSquare('e4')
    await screen.findByText(/is thinking/)
    // e4–e5 is blocked once the engine answers 1...e5.
    await tapSquare('e4')
    await tapSquare('e5')
    engine.answer('e7e5')
    await screen.findByText('Your move.')
    expect(moves().queryByText('2.')).toBeNull()
  })

  test('says when the engine has no answer, and does not ask again and again', async () => {
    let asked = 0
    const { services } = await startApp()
    services.player = {
      bestMove: () => {
        asked++
        return Promise.resolve(null)
      },
    }
    const { id } = await createGame(services.db, { level: '1320', color: 'black', thinkSeconds: 5 })
    await open(`/play/games/${id}`)
    expect(await screen.findByText('The engine did not answer.')).toBeTruthy()
    expect(asked).toBe(1)
  })

  test('takes back the last move and the engine’s answer', async () => {
    const id = await gameFirst(['e7e5'])
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    expect(screen.getByRole('button', { name: 'Take back' })).toBeDisabled()
    await tapSquare('e2')
    await tapSquare('e4')
    await waitFor(() => expect(moves().getByText('e5')).toBeTruthy())
    await fireEvent.press(screen.getByRole('button', { name: 'Take back' }))
    await screen.findByText('No moves yet.')
    await screen.findByText('Your move.')
    expect(screen.getByRole('button', { name: 'Take back' })).toBeDisabled()
  })

  test('plays on from a move picked in the list, the moves after it gone', async () => {
    const id = await gameFirst(['e7e5', 'b8c6'])
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await tapSquare('e2')
    await tapSquare('e4')
    await waitFor(() => expect(moves().getByText('e5')).toBeTruthy())
    await tapSquare('g1')
    await tapSquare('f3')
    await waitFor(() => expect(moves().getByText('Nc6')).toBeTruthy())
    await fireEvent.press(moves().getByText('e5'))
    await fireEvent.press(screen.getByRole('button', { name: 'Play from here' }))
    await waitFor(() => expect(moves().queryByText('Nf3')).toBeNull())
    expect(moves().getByText('e5')).toBeTruthy()
    await screen.findByText('Your move.')
  })

  test('plays on from an earlier position when a move is made there', async () => {
    const id = await gameFirst(['e7e5', 'b8c6', 'g8f6'])
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await tapSquare('e2')
    await tapSquare('e4')
    await waitFor(() => expect(moves().getByText('e5')).toBeTruthy())
    await tapSquare('g1')
    await tapSquare('f3')
    await waitFor(() => expect(moves().getByText('Nc6')).toBeTruthy())
    await fireEvent.press(moves().getByText('e5'))
    await screen.findByText('Your move from here: the later moves will be gone.')
    await tapSquare('f1')
    await tapSquare('c4')
    await waitFor(() => expect(moves().getByText('Bc4')).toBeTruthy())
    expect(moves().queryByText('Nf3')).toBeNull()
    await waitFor(() => expect(moves().getByText('Nf6')).toBeTruthy())
  })

  test('steps through the game with the move buttons', async () => {
    const id = await gameFirst(['e7e5'])
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await tapSquare('e2')
    await tapSquare('e4')
    await waitFor(() => expect(moves().getByText('e5')).toBeTruthy())
    await fireEvent.press(screen.getByRole('button', { name: 'First move' }))
    expect(screen.getByLabelText('e2, white pawn')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Next move' }))
    expect(screen.getByLabelText('e4, white pawn')).toBeTruthy()
    expect(screen.getByLabelText('e7, black pawn')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Last move' }))
    expect(screen.getByLabelText('e5, black pawn')).toBeTruthy()
  })

  test('tells when the engine declines a draw, and ends the game when it resigns', async () => {
    let cp = 0
    const id = await gameFirst([], ({ services }) => {
      services.evaluator.evaluate = () =>
        Promise.resolve({ thinkMs: 1500, depth: 20, lines: [{ cp, mate: null, pv: [] }] })
    })
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await fireEvent.press(screen.getByRole('button', { name: 'Offer draw' }))
    expect(await screen.findByText('Stockfish (Casual) declines the draw.')).toBeTruthy()
    cp = 900
    await fireEvent.press(screen.getByRole('button', { name: 'More' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Ask to resign' }))
    expect(await screen.findByTestId('game-end')).toBeTruthy()
    expect(screen.getByText(/You won/)).toBeTruthy()
  })

  test('resign asks first, then ends the game', async () => {
    const id = await gameFirst()
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    await fireEvent.press(screen.getByRole('button', { name: 'Resign' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Keep playing' }))
    expect(screen.queryByTestId('game-end')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Resign' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Resign the game' }))
    expect(await screen.findByTestId('game-end')).toBeTruthy()
    expect(screen.getByText(/You lost/)).toBeTruthy()
  })

  test('flips the board', async () => {
    const id = await gameFirst()
    await open(`/play/games/${id}`)
    await screen.findByText('Your move.')
    const first = () =>
      String(screen.getAllByLabelText(/^[a-h][1-8](,|$)/)[0]!.props.accessibilityLabel)
    expect(first()).toMatch(/^a8/)
    await fireEvent.press(screen.getByRole('button', { name: 'Flip board' }))
    expect(first()).toMatch(/^h1/)
  })

  test('shares a finished game’s PGN and offers a new one', async () => {
    const { services } = await startApp()
    const { id } = await createGame(services.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await resign(services.db, id)
    const router = await open(`/play/games/${id}`)
    const end = await screen.findByTestId('game-end')
    expect(within(end).getByText(/You lost · 0–1/)).toBeTruthy()
    await fireEvent.press(within(end).getByRole('button', { name: 'Save PGN' }))
    await waitFor(() => expect(testApp().shared[0]?.text).toContain('[Result "0-1"]'))
    expect(testApp().shared[0]?.name).toMatch(/^chess-\d{4}-\d\d-\d\d-[\w-]{8}\.pgn$/)
    await fireEvent.press(within(end).getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(router.getPathname()).toBe('/play'))
  })

  test('starts the review of a finished game by itself', async () => {
    const { services } = await startApp({ answers: ['e7e5', 'd8h4'] })
    const { id } = await createGame(services.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await personMove(services.db, id, 'f2f3')
    await engineMove(services.db, services.player, id)
    await personMove(services.db, id, 'g2g4')
    await engineMove(services.db, services.player, id)
    await open(`/play/games/${id}`)
    expect(await screen.findByTestId('game-end')).toBeTruthy()
    await waitFor(async () =>
      expect(await testApp().services.db.select('SELECT game_id FROM reviews')).toHaveLength(1),
    )
  })

  test('lists the games played, the recent ones on Play and all of them under All games', async () => {
    const { services } = await startApp({ answers: ['e2e4'] })
    await createGame(services.db, { level: 'max', color: 'black', thinkSeconds: 10 })
    const router = await open('/play')
    expect((await screen.findAllByTestId('game-row'))[0]).toHaveTextContent(
      /Stockfish \(Maximum\) – You/,
    )
    await fireEvent.press(screen.getByRole('button', { name: 'All games' }))
    await waitFor(() => expect(router.getPathname()).toBe('/play/games'))
    await fireEvent.press((await screen.findAllByTestId('game-row'))[0]!)
    await waitFor(() => expect(router.getPathname()).toMatch(/^\/play\/games\/[\w-]+$/))
  })
})

describe('Play after a crash (mobile-app D13)', () => {
  test('says so until the player closes the notice', async () => {
    await startApp({
      platform: {
        crashFiles: () => ({
          crash: { signal: 'SIGSEGV', at: '2026-11-01T10:00:00.000Z', request: null },
          marker: null,
        }),
      },
    })
    await open('/play')
    expect(await screen.findByText(/Stockfish crashed and the app had to close/)).toBeTruthy()
    await fireEvent.press(screen.getByText('Close'))
    expect(screen.queryByText(/Stockfish crashed/)).toBeNull()
  })
})
