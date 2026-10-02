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

/**
 * Waits until the board can take this side's move: the live board has replaced the server placeholder (the origin
 * square shows its piece) and, on a game page, the page says it is this side's turn (`data-my-turn`).
 */
export async function boardReady(page: Page, from: string) {
  await expect(page.locator(`[data-square="${from}"] img`)).toBeVisible({ timeout: 15_000 })
  const game = page.locator('[data-my-turn]')
  if ((await game.count()) > 0) {
    await expect(game).toHaveAttribute('data-my-turn', 'true', { timeout: 15_000 })
  }
}

/** A click-click move on the board once it is this side's turn. */
export async function move(page: Page, from: string, to: string) {
  await boardReady(page, from)
  await page.locator(`[data-square="${from}"]`).click()
  await page.locator(`[data-square="${to}"]`).click()
}

/**
 * Pointer moves per drag. react-chessboard's dnd-kit sensor spends the move that crosses its activation distance on
 * starting the drag, so a single-move `dragTo` starts it and drops it back on the origin square.
 */
export const DRAG_STEPS = 10

/** A drag-and-drop move on the board once it is this side's turn. */
export async function drag(page: Page, from: string, to: string) {
  await boardReady(page, from)
  await page
    .locator(`[data-square="${from}"] img`)
    .dragTo(page.locator(`[data-square="${to}"]`), { steps: DRAG_STEPS })
}
