import { expect, test } from '@playwright/test'
import { PLAYER, USER, sessionFile } from './support'
import type { Browser, Page } from '@playwright/test'

/**
 * Part 1 end to end, as two people would do it: testuser creates an invite as White, player opens the link and
 * accepts, and the game is played by clicking squares — to a checkmate, a resignation and an agreed draw. Both
 * boards show the ending with a PGN to download.
 */

/** A separate browser for each player, signed in from the session `auth.setup.ts` saved. */
async function signedIn(browser: Browser, user: string): Promise<Page> {
  const page = await (await browser.newContext({ storageState: sessionFile(user) })).newPage()
  await page.goto('/')
  return page
}

/** A click on the board once the page is interactive and it is this side's turn. */
async function move(page: Page, from: string, to: string) {
  const origin = page.locator(`[data-square="${from}"]`)
  await expect(origin).toBeEnabled({ timeout: 15_000 })
  await origin.click()
  await page.locator(`[data-square="${to}"]`).click()
}

/**
 * testuser invites as White on 3+2 and player accepts from the link: both pages end up on the same game. The creator
 * is moved there by the invite's live frame, not by reloading.
 */
async function inviteGame(browser: Browser): Promise<{ white: Page; black: Page }> {
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
  await white.getByRole('button', { name: 'White', exact: true }).click()
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

/** Both boards show the same ending. */
async function bothEnded(pages: Array<Page>, result: string, reason: string) {
  for (const page of pages) {
    await expect(page.getByTestId('game-result')).toHaveText(result)
    await expect(page.getByText(reason, { exact: true })).toBeVisible()
    await expect(page.getByTestId('game-pgn')).toBeVisible()
  }
}

test('two players meet through an invite and play the fool’s mate', async ({ browser }) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)

  await move(white, 'f2', 'f3')
  await move(black, 'e7', 'e5')
  await move(white, 'g2', 'g4')
  await move(black, 'd8', 'h4')

  await bothEnded([white, black], '0–1', 'checkmate')
  await expect(white.getByTestId('move-list')).toHaveText('1.f3e52.g4Qh4#')
})

test('a player resigns after the opening moves', async ({ browser }) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)

  await move(white, 'e2', 'e4')
  await move(black, 'e7', 'e5')
  await expect(white.getByRole('button', { name: 'Resign' })).toBeEnabled({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Resign' }).click()

  await bothEnded([white, black], '0–1', 'resignation')
})

test('a draw is offered and accepted', async ({ browser }) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)

  await move(white, 'e2', 'e4')
  await move(black, 'e7', 'e5')
  await expect(white.getByRole('button', { name: 'Offer draw' })).toBeEnabled({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Offer draw' }).click()
  await expect(white.getByRole('button', { name: 'Draw offered' })).toBeDisabled()
  // Black learns of the offer from the game's live frame.
  await black.getByRole('button', { name: 'Accept draw' }).click({ timeout: 15_000 })

  await bothEnded([white, black], '½', 'draw agreed')
})
