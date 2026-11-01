import { join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { Evaluator, importLibrary, mineRound } from '@chess/local'
import type { EngineAnalysis, EngineScheduler } from '@chess/local'
import { startApp, tapSquare, testApp } from '@/testing/app'

jest.mock('@/lib/app', () => ({
  startMobileServices: () =>
    jest.requireActual<typeof import('@/testing/app')>('@/testing/app').startTestServices(),
}))

const APP = join(__dirname, '../../app')
const KASPAROV =
  '[White "Kasparov, Garry"]\n[Black "Karpov, Anatoly"]\n[Date "1985.10.15"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 1-0'

afterEach(() => testApp().services.dispose())

async function open(url: string) {
  const router = renderRouter(APP, { initialUrl: url })
  await router
  return { getPathname: () => router.getPathname() }
}

/** One critical master position, mined with an engine whose second line is far worse. */
async function onePosition() {
  const app = await startApp()
  const { db } = app.services
  await importLibrary(db, KASPAROV, null)
  const queue = {
    analyse: (fen: string): Promise<EngineAnalysis> => {
      const worse = fen.split(' ')[1] === 'w' ? -300 : 300
      return Promise.resolve({
        depth: 18,
        lines: [
          { cp: 0, mate: null, pv: ['a2a3'] },
          { cp: worse, mate: null, pv: ['h2h3'] },
        ],
      })
    },
  } as unknown as EngineScheduler
  await mineRound(db, new Evaluator(db, queue), {
    minPly: 2,
    minGap: 0.25,
    perGame: 1,
    perRound: 1,
  })
  const [position] = await db.select<{ master_uci: string }>(
    'SELECT master_uci FROM training_positions',
  )
  return position!.master_uci
}

describe('training (mobile-app 5.8)', () => {
  test('Learn leads to training, and an empty pool of your games says why', async () => {
    await startApp()
    const router = await open('/learn')
    await fireEvent.press(await screen.findByRole('button', { name: /^Training/ }))
    await waitFor(() => expect(router.getPathname()).toBe('/learn/training'))
    await fireEvent.press(await screen.findByRole('button', { name: 'Start' }))
    expect(await screen.findByTestId('training-empty')).toHaveTextContent(
      /No mistakes to train yet\./,
    )
  })

  test('answers a master position, shows the verdict and where it comes from, then the summary', async () => {
    const master = await onePosition()
    await open('/learn/training')
    await fireEvent.press(await screen.findByRole('button', { name: 'Master games' }))
    expect(screen.getByTestId('training-pool')).toHaveTextContent(/^1 master position/)
    await fireEvent.press(screen.getByRole('button', { name: 'Endless' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByTestId('training-prompt')).toBeTruthy()
    await tapSquare(master.slice(0, 2))
    await tapSquare(master.slice(2, 4))
    const verdict = await screen.findByTestId('training-verdict')
    expect(within(verdict).getByTestId('training-verdict-text')).toBeTruthy()
    expect(within(verdict).getByTestId('training-source')).toHaveTextContent(/Kasparov/)
    await fireEvent.press(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByTestId('training-final-score')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Again' })).toBeTruthy()
  })

  test('master games filter by opening, player, years and phase', async () => {
    await onePosition()
    await open('/learn/training?mode=library')
    await fireEvent.changeText(await screen.findByLabelText('Player'), 'Carlsen')
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByTestId('training-empty')).toHaveTextContent(
      'No master position matches these filters.',
    )
    await fireEvent.changeText(screen.getByLabelText('Player'), 'Kasparov')
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByTestId('training-prompt')).toBeTruthy()
  })
})
