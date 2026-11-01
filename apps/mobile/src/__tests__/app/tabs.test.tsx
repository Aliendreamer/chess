import { join } from 'node:path'
import { fireEvent, screen } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'

// The real routes and layouts, on services over Node's SQLite instead of the phone's.
jest.mock('@/lib/app', () => ({
  startMobileServices: () =>
    jest
      .requireActual<typeof import('@/lib/services')>('@/lib/services')
      .startServices(
        jest.requireActual<typeof import('@/testing/platform')>('@/testing/platform').testPlatform()
          .p,
      ),
}))

const APP = join(__dirname, '../../app')

test('the app opens on Play, under five tabs', async () => {
  const router = renderRouter(APP, { initialUrl: '/' })
  await router
  expect(await screen.findByRole('header', { name: 'Play' })).toBeTruthy()
  expect(router.getPathname()).toBe('/play')
  for (const tab of ['Play', 'Learn', 'Analyse', 'News', 'More'])
    expect(screen.getByLabelText(new RegExp(`^${tab}, tab`))).toBeTruthy()
})

test('a tab opens its page', async () => {
  const router = renderRouter(APP, { initialUrl: '/' })
  await router
  await screen.findByRole('header', { name: 'Play' })
  await fireEvent.press(screen.getByLabelText(/^Learn, tab/))
  expect(await screen.findByRole('header', { name: 'Learn' })).toBeTruthy()
  expect(router.getPathname()).toBe('/learn')
  await fireEvent.press(screen.getByLabelText(/^More, tab/))
  expect(router.getPathname()).toBe('/more')
})
