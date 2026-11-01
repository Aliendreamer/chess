import { join } from 'node:path'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { renderRouter } from 'expo-router/testing-library'
import { newsRound } from '@chess/local'
import { startApp, testApp } from '@/testing/app'

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

describe('news (mobile-app 5.10)', () => {
  test('shows the kept headlines, and a headline opens in the browser, not the app', async () => {
    const opened: Array<string> = []
    const { services } = await startApp({
      platform: {
        openLink: (url) => {
          opened.push(url)
          return Promise.resolve()
        },
      },
    })
    const now = new Date()
    await newsRound(services.db, (url) =>
      Promise.resolve(
        url.includes('fide')
          ? {
              status: 200,
              text: `<rss><channel><item><title>Olympiad starts</title><link>https://www.fide.com/olympiad</link><pubDate>${now.toUTCString()}</pubDate></item></channel></rss>`,
            }
          : { status: 503, text: '' },
      ),
    )
    const router = await open('/news')
    await fireEvent.press(await screen.findByRole('link', { name: /^Olympiad starts/ }))
    expect(opened).toEqual(['https://www.fide.com/olympiad'])
    expect(router.getPathname()).toBe('/news')
    await fireEvent.press(screen.getByRole('button', { name: 'ChessBase' }))
    await waitFor(() => expect(screen.queryByText('Olympiad starts')).toBeNull())
  })

  test('says there is nothing yet before the first fetch', async () => {
    await startApp()
    await open('/news')
    expect(await screen.findByTestId('news-empty')).toHaveTextContent(/once the phone is online/)
  })
})
