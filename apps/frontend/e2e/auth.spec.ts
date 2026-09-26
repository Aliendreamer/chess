import { expect, test } from '@playwright/test'
import { PLAYER, PLAYER_PASS, USER, loginThroughKeycloak } from './support'

// These start signed out: they are about the login itself. Each real login here uses a different user from the
// one before it, so Keycloak's quick-login check never sees one user twice in a second.
test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('anonymous visit is bounced to the Keycloak login form', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/keycloak\.chess\.localhost/)
    await expect(page.getByRole('textbox', { name: /username|email/i })).toBeVisible()
  })

  test('the browser never talks to the API host', async ({ page }) => {
    const hosts = new Set<string>()
    page.on('request', (r) => hosts.add(new URL(r.url()).host))
    await loginThroughKeycloak(page, PLAYER, PLAYER_PASS)
    for (const h of hosts) expect(h).toMatch(/^(app|keycloak)\.chess\.localhost$/)
  })

  test('revocation: after logout the old session cookie bounces the SSR guard to login', async ({
    page,
    request,
  }) => {
    // Its own session: logging out a cached one would sign every other spec out.
    await loginThroughKeycloak(page)
    const sid = (await page.context().cookies()).find((c) => c.name === 'mp_sid')
    expect(sid).toBeDefined()
    // logout() navigates the page: the API revokes the session, then 302s to Keycloak's end-session
    // page. Landing on the keycloak host is proof the API has already processed the logout.
    await page.getByRole('link', { name: /log out/i }).click()
    await page.waitForURL(/keycloak\.chess\.localhost/)
    const res = await request.get('/', {
      headers: { cookie: `mp_sid=${sid!.value}` },
      maxRedirects: 0,
    })
    expect([302, 307]).toContain(res.status())
    expect(res.headers()['location']).toMatch(/^\/api\/auth\/login/)
  })
})

test('signed in, the sidebar names the user and Home greets them', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('identity-name')).toHaveText(USER)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hello,/)
})

test('SSR-with-data: raw server HTML already carries identity and your games, no Loading', async ({
  page,
  request,
}) => {
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  const res = await request.get('/', { headers: { cookie: cookieHeader }, maxRedirects: 0 })
  expect(res.status()).toBe(200)
  const html = await res.text()
  expect(html).toMatch(/data-testid="identity-name"/)
  expect(html).toMatch(/Quick pairing/)
  expect(html).not.toMatch(/Loading/i)
})
