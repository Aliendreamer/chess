import { join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { STANDARD_START } from '@chess/core'
import { DRAFTS, createStudies, getSetting, listStudies } from '@chess/local'
import { reopen, startApp, tapSquare, testApp } from '@/testing/app'

jest.mock('@/lib/app', () => ({
  startMobileServices: () =>
    jest.requireActual<typeof import('@/testing/app')>('@/testing/app').startTestServices(),
}))

const APP = join(__dirname, '../../app')

afterEach(() => testApp().services.dispose())

async function open(url: string) {
  const router = renderRouter(APP, { initialUrl: url })
  await router
  return { getPathname: () => router.getPathname() }
}

const tree = () => within(screen.getByTestId('move-tree'))

async function studyFirst() {
  const { services } = await startApp()
  const { created } = await createStudies(services.db, [
    { title: 'Mine', startFen: STANDARD_START, tree: [] },
  ])
  return { services, id: created[0]!.id }
}

describe('studies (mobile-app 5.7)', () => {
  test('Learn leads to the studies, and a new one opens', async () => {
    await startApp()
    const router = await open('/learn')
    await fireEvent.press(await screen.findByRole('button', { name: 'Studies' }))
    await waitFor(() => expect(router.getPathname()).toBe('/learn/studies'))
    await fireEvent.press(await screen.findByRole('button', { name: 'New study' }))
    await waitFor(() => expect(router.getPathname()).toMatch(/^\/learn\/studies\/[\w-]+$/))
    expect(await screen.findByDisplayValue('Untitled study')).toBeTruthy()
  })

  test('imports pasted PGN and reports a game it could not read', async () => {
    const { services } = await startApp()
    await open('/learn/studies')
    await fireEvent.changeText(
      await screen.findByLabelText('PGN'),
      '[Event "Good"]\n\n1. e4 e5 *\n\n[Event "Bad"]\n\n1. e4 e4 *',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Import' }))
    const report = await screen.findByTestId('import-report')
    expect(within(report).getByText('Imported 1 study.')).toBeTruthy()
    expect(within(report).getByText(/Game 2/)).toBeTruthy()
    expect(await listStudies(services.db)).toHaveLength(1)
    expect(await screen.findByRole('button', { name: /^Good/ })).toBeTruthy()
  })

  test('imports a .pgn file picked on the phone', async () => {
    await startApp({
      platform: {
        files: {
          ...jest
            .requireActual<typeof import('@/testing/platform')>('@/testing/platform')
            .testPlatform().p.files,
          pick: () => Promise.resolve('/cache/games.pgn'),
          readText: () => Promise.resolve('[Event "From a file"]\n\n1. d4 d5 *'),
        },
      },
    })
    await open('/learn/studies')
    await fireEvent.press(await screen.findByRole('button', { name: 'Open a .pgn file' }))
    expect(await screen.findByText('Imported 1 study.')).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^From a file/ })).toBeTruthy()
  })

  test('saves a move played on the board and shares the PGN', async () => {
    const { id } = await studyFirst()
    await open(`/learn/studies/${id}`)
    await screen.findByLabelText('Title')
    await tapSquare('e2')
    await tapSquare('e4')
    await fireEvent.press(await screen.findByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saved' })
    await fireEvent.press(screen.getByRole('button', { name: 'Save PGN' }))
    await waitFor(() => expect(testApp().shared[0]?.text.trim().endsWith('1. e4 *')).toBe(true))
    expect(testApp().shared[0]?.name).toBe('Mine.pgn')
  })

  test('keeps an unsaved edit after the app closed, and drops it once saved', async () => {
    const { services, id } = await studyFirst()
    await open(`/learn/studies/${id}`)
    await screen.findByLabelText('Title')
    await tapSquare('e2')
    await tapSquare('e4')
    await waitFor(
      async () => expect(await getSetting(services.db, DRAFTS.study(id), null)).not.toBeNull(),
      { timeout: 2000 },
    )
    await screen.unmount()
    reopen(testApp())
    await open(`/learn/studies/${id}`)
    await waitFor(() => expect(tree().getByText('e4')).toBeTruthy())
    await fireEvent.press(await screen.findByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saved' })
    expect(await getSetting(services.db, DRAFTS.study(id), null)).toBeNull()
  })

  test('makes a variation the main line, and deletes a move', async () => {
    const { id } = await studyFirst()
    await open(`/learn/studies/${id}`)
    await screen.findByLabelText('Title')
    await tapSquare('e2')
    await tapSquare('e4')
    await fireEvent.press(screen.getByRole('button', { name: 'First move' }))
    await tapSquare('d2')
    await tapSquare('d4')
    expect(screen.getByRole('button', { name: 'Make main line' })).not.toBeDisabled()
    await fireEvent.press(screen.getByRole('button', { name: 'Make main line' }))
    expect(tree().getAllByRole('button')[0]).toHaveTextContent('d4')
    await fireEvent.press(screen.getByRole('button', { name: 'Delete move' }))
    expect(tree().queryByText('d4')).toBeNull()
    expect(tree().getByText('e4')).toBeTruthy()
  })

  test('leads to the trainer for the study', async () => {
    const { id } = await studyFirst()
    const router = await open(`/learn/studies/${id}`)
    await fireEvent.press(await screen.findByRole('link', { name: 'Train this study' }))
    await waitFor(() => expect(router.getPathname()).toBe(`/learn/trainer/study/${id}`))
  })
})
