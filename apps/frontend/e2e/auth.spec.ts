import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const USER = process.env.E2E_USER ?? 'testuser'
const PASS = process.env.E2E_PASS ?? 'Test123!'

async function loginThroughKeycloak(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/keycloak\.chess\.localhost/)
  await page.getByLabel(/username|email/i).fill(USER)
  await page.getByLabel(/password/i).fill(PASS)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/app\.chess\.localhost/)
}

test('anonymous visit is bounced to the Keycloak login form', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/keycloak\.chess\.localhost/)
  await expect(page.getByLabel(/username|email/i)).toBeVisible()
})

test('after login the identity chip and dashboard render', async ({ page }) => {
  await loginThroughKeycloak(page)
  await expect(page.getByTestId('identity-email')).toContainText(/@/)
  await expect(page.getByTestId('identity-roles')).toContainText(/User/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hello,/)
})

test('SSR-with-data: raw server HTML already carries identity and live tiles, no Loading', async ({
  page,
  request,
}) => {
  await loginThroughKeycloak(page)
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await request.get('/', { headers: { cookie: cookieHeader }, maxRedirects: 0 })
  expect(res.status()).toBe(200)
  const html = await res.text()
  expect(html).toMatch(/data-testid="me-subject"/)
  expect(html).toMatch(/data-testid="health-status"/)
  expect(html).not.toMatch(/Loading/i)
})

test('the browser never talks to the API host', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (r) => hosts.add(new URL(r.url()).host))
  await loginThroughKeycloak(page)
  for (const h of hosts) expect(h).toMatch(/^(app|keycloak)\.chess\.localhost$/)
})

test('revocation: after logout the old session cookie bounces the SSR guard to login', async ({
  page,
  request,
}) => {
  await loginThroughKeycloak(page)
  const sid = (await page.context().cookies()).find((c) => c.name === 'mp_sid')
  expect(sid).toBeDefined()
  await page.getByRole('button', { name: /log out/i }).click()
  await expect(page).toHaveURL(/keycloak\.chess\.localhost|app\.chess\.localhost/)
  const res = await request.get('/', {
    headers: { cookie: `mp_sid=${sid!.value}` },
    maxRedirects: 0,
  })
  expect([302, 307]).toContain(res.status())
  expect(res.headers()['location']).toMatch(/^\/api\/auth\/login/)
})
