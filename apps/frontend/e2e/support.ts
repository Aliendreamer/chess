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

/**
 * testuser invites as White on 3+2 and player accepts from the link: both pages end up on the same game. The creator
 * is moved there by the invite's live frame, not by reloading.
 */
export async function inviteGame(browser: Browser): Promise<{ white: Page; black: Page }> {
  const white = await signedIn(browser, USER)
  const black = await signedIn(browser, PLAYER)

  // Choices only stick once the page has hydrated: retry until the chip reports itself selected.
  await expect(async () => {
    await white.getByRole('button', { name: '3+2', exact: true }).click()
    await expect(white.getByRole('button', { name: '3+2', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 1_000 },
    )
  }).toPass({ timeout: 15_000 })
  await white.getByTestId('invite-form').getByRole('button', { name: 'White', exact: true }).click()
  await white.getByRole('button', { name: 'Create invite link' }).click()
  await expect(white).toHaveURL(/\/invites\//)
  await expect(white.getByTestId('invite-link')).toContainText('http')
  const link = (await white.getByTestId('invite-link').textContent()) ?? ''

  await black.goto(link)
  await expect(black.getByText('You play black.')).toBeVisible()
  // The button is in the server HTML before hydration; retry until the click takes.
  await expect(async () => {
    await black.getByRole('button', { name: 'Accept and play' }).click({ timeout: 1_000 })
    await expect(black).toHaveURL(/\/games\//, { timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(white).toHaveURL(black.url())
  return { white, black }
}
