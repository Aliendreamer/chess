import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import {
  createStudies,
  enabledSources,
  getPreferences,
  getSetting,
  listStudies,
} from '@chess/local'
import { expoSql } from '@/platform/sql'
import { nodeDatabase } from '@/testing/node-sql'
import { startApp, testApp } from '@/testing/app'
import { COLORS } from '@/theme/tokens'

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

describe('settings (mobile-app 5.10)', () => {
  test('More leads to the settings; Parchment applies at once and is kept', async () => {
    const { services } = await startApp()
    const router = await open('/more')
    await fireEvent.press(await screen.findByRole('button', { name: /^Settings/ }))
    await waitFor(() => expect(router.getPathname()).toBe('/more/settings'))
    const group = await screen.findByLabelText('Site theme')
    const light = within(group).getByRole('button', { name: 'Light (Parchment)' })
    await fireEvent.press(light)
    await waitFor(() => expect(light.props.accessibilityState).toMatchObject({ selected: true }))
    expect((await getPreferences(services.db)).siteTheme).toBe('light')
    expect(screen.getByTestId('settings-preview')).toHaveStyle({
      backgroundColor: COLORS.light.surfaceCard,
    })
  })

  test('changes the board, the coordinates and the animation', async () => {
    const { services } = await startApp()
    await open('/more/settings')
    await fireEvent.press(await screen.findByRole('button', { name: 'Club walnut' }))
    await fireEvent(screen.getByRole('switch', { name: 'Coordinates' }), 'valueChange', false)
    const fast = screen.getByRole('button', { name: 'Fast' })
    await fireEvent.press(fast)
    await waitFor(() => expect(fast.props.accessibilityState).toMatchObject({ selected: true }))
    expect(await getPreferences(services.db)).toMatchObject({
      boardTheme: 'walnut',
      coordinates: false,
      animation: 'fast',
    })
  })

  test('the miner is off on the phone until switched on, and news sources switch', async () => {
    const { services } = await startApp()
    await open('/more/settings')
    const miner = await screen.findByRole('switch', { name: 'Find critical moments' })
    expect(miner.props.value).toBe(false)
    await fireEvent(miner, 'valueChange', true)
    await waitFor(() => expect(miner.props.value).toBe(true))
    expect(await getSetting(services.db, 'training.miner', false)).toBe(true)
    expect(await services.minerOn()).toBe(true)
    const tournaments = screen.getByRole('button', { name: 'Tournaments' })
    await fireEvent.press(tournaments)
    await waitFor(() =>
      expect(tournaments.props.accessibilityState).toMatchObject({ selected: false }),
    )
    expect(await enabledSources(services.db)).not.toContain('events')
  })
})

describe('backup and restore (mobile-app 5.10)', () => {
  test('backs up to the share sheet and restores a picked file after a confirmation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mobile-backup-'))
    const shared: Array<string> = []
    const { services } = await startApp({
      platform: {
        files: {
          cacheDir: dir,
          dataDir: dir,
          pick: () => Promise.resolve(shared[0] ?? null),
          share: (path) => {
            shared.push(path)
            return Promise.resolve()
          },
          open: (path) => {
            const native = nodeDatabase(path)
            return Promise.resolve(Object.assign(expoSql(native), { close: () => native.close() }))
          },
          readText: (path) => Promise.resolve(readFileSync(path, 'utf8')),
          writeText: (path, text) => Promise.resolve(writeFileSync(path, text)),
          now: () => new Date('2026-11-01T10:00:00.000Z'),
        },
      },
    })
    await createStudies(services.db, [{ title: 'Before', tree: [] }])
    await open('/more/backup')
    await fireEvent.press(await screen.findByRole('button', { name: 'Back up' }))
    expect(await screen.findByText(/^Backed up/)).toBeTruthy()
    expect(shared[0]).toBe(join(dir, 'chess-2026-11-01.chessbackup'))
    await createStudies(services.db, [{ title: 'After', tree: [] }])
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }))
    expect((await listStudies(services.db)).map((s) => s.title).sort()).toEqual(['After', 'Before'])
    await fireEvent.press(screen.getByRole('button', { name: 'Restore' }))
    await fireEvent.press(await screen.findByRole('button', { name: 'Replace my data' }))
    expect(await screen.findByText(/^Restored\./)).toBeTruthy()
    expect((await listStudies(services.db)).map((s) => s.title)).toEqual(['Before'])
  })
})

describe('About (mobile-app D10)', () => {
  test('names the version, the app’s GPL licence with its source, and every licence it ships with', async () => {
    const opened: Array<string> = []
    await startApp({
      platform: {
        openLink: (url) => {
          opened.push(url)
          return Promise.resolve()
        },
      },
    })
    await open('/more/about')
    const app = await screen.findByTestId('about-app')
    expect(app).toHaveTextContent(/GNU General Public License v3/)
    const credits = screen.getByTestId('about-credits')
    for (const credit of [
      /Stockfish 19/,
      /Cburnett/,
      /chess-openings/,
      /Lucide/,
      /IBM Plex/,
      /Newsreader/,
    ])
      expect(credits).toHaveTextContent(credit)
    await fireEvent.press(within(app).getByRole('link', { name: /^The source/ }))
    expect(opened[0]).toMatch(
      /^https:\/\/github\.com\/Aliendreamer\/chess\/tree\/mobile@\d+\.\d+\.\d+$/,
    )
  })
})
