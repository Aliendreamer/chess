import { expect, test } from '@playwright/test'
import { PLAYER, PLAYER_PASS, loginThroughKeycloak } from './support'
import type { Browser, Page } from '@playwright/test'

/**
 * Part 1 end to end, as two people would do it: testuser creates an invite as White, player opens the link and
 * accepts, and the fool's mate is played by clicking squares. Both boards end 0–1 with a PGN to download.
 */

async function signedIn(browser: Browser, user?: string, pass?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await loginThroughKeycloak(page, user, pass)
  return page
}

/** A click on the board once the page is interactive and it is this side's turn. */
async function move(page: Page, from: string, to: string) {
  const origin = page.locator(`[data-square="${from}"]`)
  await expect(origin).toBeEnabled({ timeout: 15_000 })
  await origin.click()
  await page.locator(`[data-square="${to}"]`).click()
}

test('two players meet through an invite and play the fool’s mate', async ({ browser }) => {
  test.setTimeout(120_000)
  const white = await signedIn(browser)
  const black = await signedIn(browser, PLAYER, PLAYER_PASS)

  // Choices only stick once the page has hydrated: retry until the chip reports itself selected.
  await expect(async () => {
    await white.getByRole('button', { name: '3+2', exact: true }).click()
    await expect(white.getByRole('button', { name: '3+2', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      {
        timeout: 1_000,
      },
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

  // The creator is moved into the game by the invite's live frame, not by reloading.
  await expect(white).toHaveURL(black.url())

  await move(white, 'f2', 'f3')
  await move(black, 'e7', 'e5')
  await move(white, 'g2', 'g4')
  await move(black, 'd8', 'h4')

  for (const page of [white, black]) {
    await expect(page.getByTestId('game-result')).toHaveText('0–1')
    await expect(page.getByTestId('move-list')).toHaveText('1.f3e52.g4Qh4#')
    await expect(page.getByTestId('game-pgn')).toBeVisible()
  }
})
