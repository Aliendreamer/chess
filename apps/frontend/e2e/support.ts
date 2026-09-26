import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

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
