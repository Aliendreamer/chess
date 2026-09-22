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
  const wsPromise = page.waitForEvent('websocket', { timeout: 10_000 })
  await page.goto(`/pings/${pingId()}`)
  const ws = await wsPromise

  expect(ws.url()).toMatch(/^wss?:\/\/app\.chess\.localhost\/api\/ws\/pings\//)
  for (const h of hosts) expect(h).toMatch(/^(app|keycloak)\.chess\.localhost$/)
})
