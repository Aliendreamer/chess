import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeServices, renderApp } from '#/testing'
import { newsRound } from '#/lib/data/news'

const services: Array<{ close: () => void }> = []
afterEach(() => {
  cleanup()
  services.splice(0).forEach((s) => s.close())
})

describe('news (desktop-app D7)', () => {
  it('shows the kept headlines, and a headline opens in the browser, not the app', async () => {
    const s = await fakeServices()
    services.push(s)
    const now = new Date()
    await newsRound(s.db, (url) =>
      Promise.resolve(
        url.includes('fide')
          ? {
              status: 200,
              text: `<rss><channel><item><title>Olympiad starts</title><link>https://www.fide.com/olympiad</link><pubDate>${now.toUTCString()}</pubDate></item></channel></rss>`,
            }
          : { status: 503, text: '' },
      ),
    )
    const { router } = await renderApp('/news', s)
    fireEvent.click(await screen.findByRole('link', { name: /Olympiad starts/ }))
    expect(s.opened).toEqual(['https://www.fide.com/olympiad'])
    expect(router.state.location.pathname).toBe('/news')
  })

  it('says there is nothing yet before the first fetch', async () => {
    const s = await fakeServices()
    services.push(s)
    await renderApp('/news', s)
    expect((await screen.findByTestId('news-empty')).textContent).toContain(
      'once the computer is online',
    )
  })
})
