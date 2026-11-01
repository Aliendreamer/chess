import { join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { importLibrary } from '@chess/local'
import { startApp, testApp } from '@/testing/app'
import { testPlatform } from '@/testing/platform'

jest.mock('@/lib/app', () => ({
  startMobileServices: () =>
    jest.requireActual<typeof import('@/testing/app')>('@/testing/app').startTestServices(),
}))

const APP = join(__dirname, '../../app')
const FILE =
  '[White "Kasparov, Garry"]\n[Black "Karpov, Anatoly"]\n[Event "WCh 1985"]\n[Date "1985.10.15"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3 1-0\n\n' +
  '[White "Fischer, Robert"]\n[Black "Spassky, Boris"]\n[Date "1972.07.23"]\n[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2'

afterEach(() => testApp().services.dispose())

async function open(url: string) {
  const router = renderRouter(APP, { initialUrl: url })
  await router
  return {
    getPathname: () => router.getPathname(),
    getSearchParams: () => router.getSearchParams(),
  }
}

const games = () => within(screen.getByTestId('library-games'))

describe('the library (mobile-app 5.9)', () => {
  test('Analyse leads to the library, which says it is empty until a file is imported', async () => {
    await startApp({
      platform: {
        files: {
          ...testPlatform().p.files,
          pick: () => Promise.resolve('/cache/games.pgn'),
          readText: () => Promise.resolve(FILE),
        },
      },
    })
    const router = await open('/analyse')
    await fireEvent.press(await screen.findByRole('link', { name: 'Library' }))
    await waitFor(() => expect(router.getPathname()).toBe('/analyse/library'))
    expect(
      await screen.findByText('Your library is empty: import a PGN file of games.'),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Import a PGN file' }))
    expect(await screen.findByTestId('library-report')).toHaveTextContent(/^Imported 2, 0 already/)
    await waitFor(() => expect(games().getByText('Kasparov, Garry – Karpov, Anatoly')).toBeTruthy())
    expect(screen.getByText('2 games')).toBeTruthy()
  })

  test('searches by player and years, and opens a game on the analysis board', async () => {
    const { services } = await startApp()
    await importLibrary(services.db, FILE, null)
    const router = await open('/analyse/library')
    await fireEvent.changeText(await screen.findByLabelText('Player'), 'Fischer')
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(games().queryByText(/Kasparov/)).toBeNull())
    await fireEvent.changeText(screen.getByLabelText('Player'), '')
    await fireEvent.changeText(screen.getByLabelText('From'), '1980')
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(games().queryByText(/Fischer/)).toBeNull())
    await fireEvent.press(
      games().getByRole('button', { name: /^Kasparov, Garry – Karpov, Anatoly/ }),
    )
    await waitFor(() => expect(router.getPathname()).toBe('/analyse'))
    expect(router.getSearchParams()).toMatchObject({ library: expect.any(String) })
    expect(await screen.findByText('Kasparov, Garry vs Karpov, Anatoly')).toBeTruthy()
  })

  test('a library game opened at a move shows the games at that position', async () => {
    const { services } = await startApp()
    await importLibrary(services.db, FILE, null)
    const [game] = await services.db.select<{ id: string }>(
      "SELECT id FROM library_games WHERE white LIKE 'Kasparov%'",
    )
    await open(`/analyse?library=${game!.id}&ply=1`)
    expect(await screen.findByRole('button', { name: /^In the library · 2 games/ })).toBeTruthy()
  })
})
