import { expect } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'

/** Where `auth.setup.ts` keeps a user's signed-in browser state (gitignored). */
export const sessionFile = (user: string) => `e2e/.auth/${user}.json`

export const USER = process.env.E2E_USER ?? 'testuser'
export const PASS = process.env.E2E_PASS ?? 'Test123!'
export const PLAYER = process.env.E2E_PLAYER ?? 'player'
export const PLAYER_PASS = process.env.E2E_PLAYER_PASS ?? 'Player123!'

/** The real login: `/` bounces to Keycloak, the form posts back, and the app renders signed in. */
export async function loginThroughKeycloak(page: Page, user = USER, pass = PASS, path = '/') {
  await page.goto(path)
  await expect(page).toHaveURL(/keycloak\.chess\.localhost/)
  // Keycloak 26's theme: the password field shares its label text with the "Show password" toggle,
  // so target the textboxes by role rather than by label.
  await page.getByRole('textbox', { name: /username|email/i }).fill(user)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(pass)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page).toHaveURL(/app\.chess\.localhost/)
}

/** A separate browser for each player, signed in from the session `auth.setup.ts` saved. */
export async function signedIn(browser: Browser, user: string): Promise<Page> {
  const page = await (await browser.newContext({ storageState: sessionFile(user) })).newPage()
  await page.goto('/')
  return page
}

/** A click on the board once the page is interactive and it is this side's turn. */
export async function move(page: Page, from: string, to: string) {
  const origin = page.locator(`[data-square="${from}"]`)
  await expect(origin).toBeEnabled({ timeout: 15_000 })
  await origin.click()
  await page.locator(`[data-square="${to}"]`).click()
}
