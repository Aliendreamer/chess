import { join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { STANDARD_START, fromInput, positionKey } from '@chess/core'
import {
  DRAFTS,
  createGame,
  draftWriter,
  getPreferences,
  importLibrary,
  loadBoardDraft,
  personMove,
  resign,
  storeEvaluation,
} from '@chess/local'
import { startApp, tapSquare, testApp } from '@/testing/app'

jest.mock('@/lib/app', () => ({
  startMobileServices: () =>
    jest.requireActual<typeof import('@/testing/app')>('@/testing/app').startTestServices(),
}))

const APP = join(__dirname, '../../app')
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

afterEach(() => testApp().services.dispose())

async function open(url: string) {
  const router = renderRouter(APP, { initialUrl: url })
  await router
  return { getPathname: () => router.getPathname() }
}

const tree = () => within(screen.getByTestId('move-tree'))

async function paste(text: string) {
  await fireEvent.changeText(await screen.findByLabelText('FEN or PGN'), text)
  await fireEvent.press(screen.getByRole('button', { name: 'Load' }))
}

describe('the analysis board (mobile-app 5.6)', () => {
  test('shows a stored evaluation of the position at once, and names the opening', async () => {
    const { services } = await startApp()
    await storeEvaluation(services.db, positionKey(AFTER_E4), {
      thinkMs: 10_000,
      depth: 30,
      lines: [{ cp: 31, mate: null, pv: ['e7e5'] }],
    })
    await open(`/analyse?fen=${encodeURIComponent(STANDARD_START)}`)
    await paste('1. e4')
    expect(await screen.findByText("B00 King's Pawn")).toBeTruthy()
    expect(await screen.findByLabelText('Evaluation +0.31')).toBeTruthy()
    await waitFor(() =>
      expect(screen.getAllByTestId('engine-line')[0]).toHaveTextContent(/\+0\.31/),
    )
  })

  test('puts a move played on the board into the tree, and an engine line too', async () => {
    const { services } = await startApp()
    await storeEvaluation(services.db, positionKey(AFTER_E4), {
      thinkMs: 10_000,
      depth: 30,
      lines: [{ cp: 31, mate: null, pv: ['e7e5', 'g1f3'] }],
    })
    await open('/analyse')
    await screen.findByLabelText('Chess board')
    await tapSquare('e2')
    await tapSquare('e4')
    expect(tree().getByText('e4')).toBeTruthy()
    await fireEvent.press(await screen.findByRole('button', { name: /^Play the line e5 Nf3/ }))
    expect(tree().getByText('Nf3')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Previous move' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Previous move' }))
    expect(tree().getByRole('button', { name: 'e4' }).props.accessibilityState).toMatchObject({
      selected: true,
    })
  })

  test('the evaluation bar and the best moves are on, and turning one off is remembered', async () => {
    const { services } = await startApp()
    await storeEvaluation(services.db, positionKey(STANDARD_START), {
      thinkMs: 10_000,
      depth: 30,
      lines: [{ cp: 20, mate: null, pv: ['e2e4'] }],
    })
    await open('/analyse')
    const bar = await screen.findByRole('switch', { name: 'Evaluation bar' })
    const lines = screen.getByRole('switch', { name: 'Best moves' })
    expect([bar.props.value, lines.props.value]).toEqual([true, true])
    expect(await screen.findByLabelText('Evaluation +0.20')).toBeTruthy()
    await fireEvent(lines, 'valueChange', false)
    await waitFor(() => expect(screen.queryByTestId('engine-lines')).toBeNull())
    await waitFor(async () => expect((await getPreferences(services.db)).analysisLines).toBe(false))
    expect(screen.getByTestId('eval-bar')).toBeTruthy()
  })

  test('opens a finished game at its end, named by its players', async () => {
    const { services } = await startApp()
    const game = await createGame(services.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await personMove(services.db, game.id, 'e2e4')
    await resign(services.db, game.id)
    await open(`/analyse?game=${game.id}`)
    expect(await screen.findByText('You vs Stockfish (Casual)')).toBeTruthy()
    expect(tree().getByText('e4')).toBeTruthy()
  })

  test('refuses a game still in play', async () => {
    const { services } = await startApp()
    const game = await createGame(services.db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await open(`/analyse?game=${game.id}`)
    expect(await screen.findByText(/once it has ended/)).toBeTruthy()
  })

  test('opens where the player left it after the app closed, and keeps the board as it changes', async () => {
    const { services } = await startApp()
    const writer = draftWriter(services.db, DRAFTS.analysis, 0)
    writer.write({
      startFen: STANDARD_START,
      tree: fromInput(STANDARD_START, [{ uci: 'd2d4', children: [{ uci: 'd7d5', children: [] }] }]),
      path: [0, 0],
    })
    await writer.flush()
    await open('/analyse')
    await waitFor(() => expect(tree().getByText('d5')).toBeTruthy())
    await paste('1. e4')
    await waitFor(
      async () => expect((await loadBoardDraft(services.db))?.tree[0]?.san).toBe('e4'),
      {
        timeout: 2000,
      },
    )
  })

  test('says what is wrong with a paste, and offers the games of a PGN with several', async () => {
    await startApp()
    await open('/analyse')
    await paste('not chess')
    expect(await screen.findByText('That is neither a legal FEN nor a PGN game.')).toBeTruthy()
    await paste('[White "A"]\n[Black "B"]\n\n1. e4 *\n\n[White "C"]\n[Black "D"]\n\n1. d4 *')
    await fireEvent.press(await screen.findByRole('button', { name: 'C – D' }))
    expect(tree().getByText('d4')).toBeTruthy()
  })

  test('shows the library’s games at the position, and plays a move from them', async () => {
    const { services } = await startApp()
    await importLibrary(
      services.db,
      '[White "Carlsen"]\n[Black "Caruana"]\n[Result "1/2-1/2"]\n[Date "2018.11.09"]\n\n1. e4 e5 1/2-1/2',
      null,
    )
    await open('/analyse')
    await fireEvent.press(await screen.findByRole('button', { name: /^In the library · 1 game/ }))
    const library = await screen.findByTestId('library-panel')
    expect(within(library).getByText(/1 game/)).toBeTruthy()
    await fireEvent.press(within(library).getByRole('button', { name: 'Play e4' }))
    expect(tree().getByText('e4')).toBeTruthy()
  })

  test('saves the board as a study and opens it', async () => {
    const { services } = await startApp()
    const router = await open('/analyse')
    await screen.findByLabelText('Chess board')
    await tapSquare('e2')
    await tapSquare('e4')
    await fireEvent.press(screen.getByRole('button', { name: 'Save as study' }))
    await waitFor(() => expect(router.getPathname()).toMatch(/^\/learn\/studies\/[\w-]+$/))
    expect(await services.db.select('SELECT title FROM studies')).toEqual([{ title: 'Analysis' }])
  })
})
