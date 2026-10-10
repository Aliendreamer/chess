import { mkdirSync, rmSync, statSync } from 'node:fs'
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

/** Where the cross-worker pairing lock lives (gitignored with the sessions). */
const PAIRING_LOCK = 'e2e/.auth/pairing.lock'
/** A lock older than this was left by a crashed run. */
const STALE_LOCK_MS = 90_000

/**
 * Holds the pairing lock while `work` runs. Every two-browser spec pairs the same two users through one queue, and a
 * user waits in one queue at a time: two specs seeking at once (Playwright runs 2 workers) would steal each other's
 * opponent. Pairings are short, so they simply take turns.
 */
async function withPairingLock<T>(work: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      mkdirSync(PAIRING_LOCK)
      break
    } catch {
      try {
        if (Date.now() - statSync(PAIRING_LOCK).mtimeMs > STALE_LOCK_MS)
          rmSync(PAIRING_LOCK, { recursive: true, force: true })
      } catch {
        // released between the two calls
      }
      if (Date.now() > deadline) throw new Error('timed out waiting for the pairing lock')
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  try {
    return await work()
  } finally {
    rmSync(PAIRING_LOCK, { recursive: true, force: true })
  }
}

/** Joins a quick-pairing queue from home; the tile only works once hydrated, so retry until the seek shows. */
async function seek(page: Page, timeControl: string) {
  const tile = page.getByRole('button', {
    name: new RegExp(`^Play ${timeControl.replace('+', '\\+')} `),
  })
  await expect(async () => {
    await tile.click({ timeout: 1_000 })
    await expect(page.getByTestId('seek').or(page.locator('[data-my-turn]'))).toBeVisible({
      timeout: 1_000,
    })
  }).toPass({ timeout: 20_000 })
}

/**
 * testuser and player both take the 3+2 quick pairing: the queue pairs them (colours drawn at random) and both pages
 * move to the same game, the first seeker by the queue's live frame. White is whoever's turn it is on arrival.
 */
export async function pairedGame(browser: Browser): Promise<{ white: Page; black: Page }> {
  const first = await signedIn(browser, USER)
  const second = await signedIn(browser, PLAYER)

  await withPairingLock(async () => {
    await seek(first, '3+2')
    await seek(second, '3+2')
    await expect(first).toHaveURL(/\/games\//, { timeout: 20_000 })
    await expect(second).toHaveURL(first.url(), { timeout: 20_000 })
  })

  for (const page of [first, second]) {
    await expect(page.locator('[data-my-turn]')).toHaveAttribute('data-my-turn', /^(true|false)$/, {
      timeout: 15_000,
    })
  }
  const firstIsWhite =
    (await first.locator('[data-my-turn]').getAttribute('data-my-turn')) === 'true'
  return firstIsWhite ? { white: first, black: second } : { white: second, black: first }
}
