import { join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { STANDARD_START, fromInput, toInput } from '@chess/core'
import { createStudies, ensureOpenings } from '@chess/local'
import { startApp, tapSquare, testApp } from '@/testing/app'

jest.mock('@/lib/app', () => ({
  startMobileServices: () =>
    jest.requireActual<typeof import('@/testing/app')>('@/testing/app').startTestServices(),
}))

const APP = join(__dirname, '../../app')
const LIST =
  'eco\tname\tpgn\nC65\tRuy Lopez: Berlin Defense\t1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6\nA80\tDutch Defense\t1. d4 f5'

afterEach(() => testApp().services.dispose())

async function open(url: string) {
  const router = renderRouter(APP, { initialUrl: url })
  await router
  return {
    getPathname: () => router.getPathname(),
    getSearchParams: () => router.getSearchParams(),
  }
}

async function withOpenings() {
  const app = await startApp()
  await app.services.db.execute('DELETE FROM openings')
  await app.services.db.execute("DELETE FROM settings WHERE key LIKE 'openings%'")
  await ensureOpenings(app.services.db, () => Promise.resolve([LIST]))
  return app
}

const status = () => screen.getByTestId('drill-status')

describe('the opening trainer (mobile-app 5.8)', () => {
  test('Learn leads to the families, grouped, and one opens as White', async () => {
    await withOpenings()
    const router = await open('/learn')
    await fireEvent.press(await screen.findByRole('button', { name: /^Trainer/ }))
    await waitFor(() => expect(router.getPathname()).toBe('/learn/trainer'))
    const families = await screen.findByTestId('trainer-families')
    expect(within(families).getByRole('header', { name: 'Defences' })).toBeTruthy()
    await fireEvent.press(within(families).getByRole('button', { name: /^Dutch Defense/ }))
    await waitFor(() => expect(router.getPathname()).toBe('/learn/trainer/Dutch Defense'))
    expect(router.getSearchParams()).toMatchObject({ color: 'white' })
  })

  test('searches the openings', async () => {
    await withOpenings()
    await open('/learn/trainer')
    await fireEvent.changeText(await screen.findByLabelText('Opening'), 'dutch')
    await fireEvent(screen.getByLabelText('Opening'), 'submitEditing')
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Ruy Lopez/ })).toBeNull())
    expect(screen.getByRole('button', { name: /^Dutch Defense/ })).toBeTruthy()
  })

  test('a new line opens in Learn, plays through, and comes back first', async () => {
    await withOpenings()
    await open('/learn/trainer/Ruy%20Lopez?color=white')
    expect(await screen.findByText('C65 Ruy Lopez: Berlin Defense')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Test' }).props.value).toBe(false)
    expect(screen.getByTestId('drill-coming')).toBeTruthy()
    for (const [from, to] of [
      ['e2', 'e4'],
      ['g1', 'f3'],
      ['f1', 'b5'],
    ] as const) {
      await waitFor(() => expect(status()).toHaveTextContent('Your move.'))
      await tapSquare(from)
      await tapSquare(to)
    }
    expect(await screen.findByText('1 mistake. This line comes back first.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next line' })).toBeTruthy()
  })

  test('says a wrong move is not the line, and a hint points at the right one', async () => {
    await withOpenings()
    await open('/learn/trainer/Ruy%20Lopez?color=white')
    await fireEvent(await screen.findByRole('switch', { name: 'Test' }), 'valueChange', true)
    expect(screen.queryByTestId('drill-coming')).toBeNull()
    await waitFor(() => expect(status()).toHaveTextContent('Your move.'))
    await tapSquare('d2')
    await tapSquare('d4')
    expect(status()).toHaveTextContent('1.d4 is not the line. Play 1.e4.')
    await fireEvent.press(screen.getByRole('button', { name: 'Hint' }))
    expect(screen.getByTestId('arrow-e2-e4')).toBeTruthy()
  })

  test('trains as Black: the board plays White', async () => {
    await withOpenings()
    await open('/learn/trainer/Dutch%20Defense?color=white')
    await fireEvent.press(await screen.findByRole('button', { name: 'As Black' }))
    await waitFor(() => expect(screen.getByLabelText('d4, white pawn')).toBeTruthy())
    await waitFor(() => expect(status()).toHaveTextContent('Your move.'))
  })

  test('drills a study’s own lines from My studies', async () => {
    const { services } = await startApp()
    const tree = fromInput(STANDARD_START, [
      { uci: 'e2e4', children: [{ uci: 'c7c5', children: [] }] },
    ])
    const { created } = await createStudies(services.db, [
      { title: 'My Sicilian', startFen: STANDARD_START, tree: toInput(tree) },
    ])
    const router = await open('/learn/trainer?color=white')
    await fireEvent.press(await screen.findByRole('button', { name: 'My studies' }))
    await fireEvent.press(await screen.findByRole('button', { name: /^My Sicilian/ }))
    await waitFor(() => expect(router.getPathname()).toBe(`/learn/trainer/study/${created[0]!.id}`))
    expect(await screen.findByText('Your line')).toBeTruthy()
    await waitFor(() => expect(status()).toHaveTextContent('Your move.'))
    await tapSquare('e2')
    await tapSquare('e4')
    expect(await screen.findByTestId('run-outcome')).toBeTruthy()
  })
})
