import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const USER = process.env.E2E_USER ?? 'testuser'
const PASS = process.env.E2E_PASS ?? 'Test123!'

async function loginThroughKeycloak(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/keycloak\.chess\.localhost/)
  await page.getByRole('textbox', { name: /username|email/i }).fill(USER)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(PASS)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/app\.chess\.localhost/)
}

/** Backend contract: `PingIds.Pattern` is `^[a-z0-9-]{1,64}$`. */
const pingId = () => `e2e-${Date.now()}`

test('a ping reaches the live feed through the SSR relay', async ({ page }) => {
  await loginThroughKeycloak(page)
  await page.goto(`/pings/${pingId()}`)

  // SSR came from the actor: a fresh entity is count 0, rendered, not fetched.
  await expect(page.getByTestId('ping-count')).toHaveText('count 0')
  await expect(page.getByTestId('ping-status')).toHaveText(/live/i, { timeout: 10_000 })

  await page.getByTestId('ping-submit').click()
  await expect(page.getByTestId('ping-feed')).toContainText('count 1', { timeout: 5_000 })
})

test('SSR renders the ping state before any JS runs', async ({ page, request }) => {
  await loginThroughKeycloak(page)
  const id = pingId()
  await page.goto(`/pings/${id}`)
  // Wait for the relay so the click's push lands in the feed (the late-subscriber case is its own test).
  await expect(page.getByTestId('ping-status')).toHaveText(/live/i, { timeout: 10_000 })
  await page.getByTestId('ping-submit').click()
  await expect(page.getByTestId('ping-feed')).toContainText('count 1', { timeout: 5_000 })

  const cookies = await page.context().cookies()
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await request.get(`/pings/${id}`, { headers: { cookie }, maxRedirects: 0 })
  expect(res.status()).toBe(200)
  const html = await res.text()
  expect(html).toContain('count 1')
  expect(html).not.toMatch(/Loading/i)
})

test('the relay keeps the API host out of the browser', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  page.on('websocket', (ws) => hosts.add(new URL(ws.url()).host))

  await loginThroughKeycloak(page)
  // Under `vite dev` the first socket the page opens is Vite's own HMR channel, so match ours.
  const wsPromise = page.waitForEvent('websocket', {
    predicate: (socket) => socket.url().includes('/api/ws/live/'),
    timeout: 15_000,
  })
  await page.goto(`/pings/${pingId()}`)
  const ws = await wsPromise

  expect(ws.url()).toMatch(/^wss?:\/\/app\.chess\.localhost\/api\/ws\/live\/ping\//)
  for (const h of hosts) expect(h).toMatch(/^(app|keycloak)\.chess\.localhost$/)
})

test('a late subscriber gets the current state from the socket snapshot', async ({ context }) => {
  const first = await context.newPage()
  await loginThroughKeycloak(first)
  const id = pingId()
  await first.goto(`/pings/${id}`)
  await expect(first.getByTestId('ping-status')).toHaveText(/live/i, { timeout: 10_000 })
  await first.getByTestId('ping-submit').click()
  await expect(first.getByTestId('ping-feed')).toContainText('count 1', { timeout: 5_000 })

  // A second page opened afterwards: no ping is sent while it is open, so any frame it gets is the snapshot.
  const late = await context.newPage()
  const frames: Array<string> = []
  late.on('websocket', (ws) => {
    if (ws.url().includes('/api/ws/live/ping/')) {
      ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload : ''))
    }
  })
  await late.goto(`/pings/${id}`)
  await expect(late.getByTestId('ping-status')).toHaveText(/live/i, { timeout: 10_000 })

  await expect
    .poll(
      () =>
        frames
          .map((f) => JSON.parse(f) as { frame?: { topic: string; seq: number } })
          .find((m) => m.frame)?.frame,
      {
        timeout: 5_000,
      },
    )
    .toEqual(expect.objectContaining({ topic: `ping:${id}`, seq: 1 }))
})

test('two tabs on one ping both receive a push', async ({ context }) => {
  const a = await context.newPage()
  await loginThroughKeycloak(a)
  const id = pingId()
  const b = await context.newPage()
  await a.goto(`/pings/${id}`)
  await b.goto(`/pings/${id}`)
  await expect(a.getByTestId('ping-status')).toHaveText(/live/i, { timeout: 10_000 })
  await expect(b.getByTestId('ping-status')).toHaveText(/live/i, { timeout: 10_000 })

  await a.getByTestId('ping-submit').click()

  await expect(a.getByTestId('ping-feed')).toContainText('count 1', { timeout: 5_000 })
  await expect(b.getByTestId('ping-feed')).toContainText('count 1', { timeout: 5_000 })
})

test('an unknown live kind is refused with 4400', async ({ page }) => {
  await loginThroughKeycloak(page)
  const code = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const ws = new WebSocket(`ws://${location.host}/api/ws/live/nope/x`)
        ws.onclose = (e) => resolve(e.code)
      }),
  )
  expect(code).toBe(4400)
})
