import { expect, test } from '@playwright/test'
import { PLAYER, USER, move, sessionFile, signedIn } from './support'
import type { Browser, Page } from '@playwright/test'

/**
 * Presence and abandonment with the real timings: Black closes the game after both first moves, the BFF reports
 * them gone, and a minute later White is offered the claim and takes the win.
 */

test('a player who leaves loses by abandonment when the other claims it', async ({ browser }) => {
  test.setTimeout(180_000)
  const white = await signedIn(browser, USER)
  const black = await signedIn(browser, PLAYER)

  await expect(async () => {
    await white
      .getByTestId('invite-form')
      .getByRole('button', { name: 'White', exact: true })
      .click()
    await expect(
      white.getByTestId('invite-form').getByRole('button', { name: 'White', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true', {
      timeout: 1_000,
    })
  }).toPass({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Create invite link' }).click()
  await expect(white.getByTestId('invite-link')).toContainText('http')
  await black.goto((await white.getByTestId('invite-link').textContent()) ?? '')
  await expect(async () => {
    await black.getByRole('button', { name: 'Accept and play' }).click({ timeout: 1_000 })
    await expect(black).toHaveURL(/\/games\//, { timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(white).toHaveURL(black.url())
  await expect(white.getByTestId('game-relay')).toHaveText('live', { timeout: 15_000 })
  await expect(black.getByTestId('game-relay')).toHaveText('live', { timeout: 15_000 })

  await move(white, 'e2', 'e4')
  await move(black, 'e7', 'e5')
  await expect(white.getByTestId('move-list')).toHaveText('1.e4e5')

  // Black leaves: their only tab closes, so the BFF reports them absent at once.
  await black.context().close()

  const claim = white.getByTestId('claim-panel')
  await expect(claim).toBeVisible({ timeout: 90_000 })
  await claim.getByRole('button', { name: 'Claim win' }).click()

  await expect(white.getByTestId('game-result')).toHaveText('1–0')
  await expect(white.getByText('abandonment')).toBeVisible()
})
