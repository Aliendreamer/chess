import { expect, test } from '@playwright/test'
import { PLAYER, USER, move, signedIn } from './support'

/**
 * A correspondence game (correspondence-games): an invite at "7 days", a move, and the other player sees it is their
 * move with the week they have, on the game page and in "Your turn" on home. No clocks.
 */
test('a correspondence game: a week per move, and it waits in "Your turn"', async ({ browser }) => {
  test.setTimeout(120_000)
  const white = await signedIn(browser, USER)
  const black = await signedIn(browser, PLAYER)

  // Choices only stick once the page has hydrated: retry until the chip reports itself selected.
  await expect(async () => {
    await white.getByRole('button', { name: '7 days', exact: true }).click()
    await expect(white.getByRole('button', { name: '7 days', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 1_000 },
    )
  }).toPass({ timeout: 15_000 })
  await white.getByTestId('invite-form').getByRole('button', { name: 'White', exact: true }).click()
  await white.getByRole('button', { name: 'Create invite link' }).click()
  await expect(white.getByTestId('invite-link')).toContainText('http')
  const link = (await white.getByTestId('invite-link').textContent()) ?? ''

  await black.goto(link)
  await expect(async () => {
    await black.getByRole('button', { name: 'Accept and play' }).click({ timeout: 1_000 })
    await expect(black).toHaveURL(/\/games\//, { timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(white).toHaveURL(black.url())
  const gameUrl = black.url()

  await expect(white.getByText('Correspondence · 7 days per move ·')).toBeVisible()
  await expect(white.getByTestId('deadline')).toHaveText('Your move · 7 days left')
  await expect(white.getByTestId('strip-white')).not.toContainText(':') // no clock

  await move(white, 'e2', 'e4')
  await expect(black.getByTestId('deadline')).toHaveText('Your move · 7 days left')
  await expect(white.getByTestId('deadline')).toHaveText(/^Waiting for .+ · 7 days left$/)

  // "Your turn" reads the replica, which catches up with the move a moment after the live frame: reload until it has.
  await expect(async () => {
    await black.goto('/')
    await expect(
      black.getByTestId('your-turn').getByRole('link', { name: 'vs testuser' }).first(),
    ).toBeVisible({
      timeout: 1_000,
    })
  }).toPass({ timeout: 20_000 })

  // Clean up: before both first moves the game can only be aborted.
  await black.goto(gameUrl)
  // The button is in the server HTML before hydration; retry until the click takes.
  await expect(async () => {
    await black.getByRole('button', { name: 'Abort' }).click({ timeout: 1_000 })
    await expect(black.getByTestId('game-result')).toHaveText('—', { timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
})
