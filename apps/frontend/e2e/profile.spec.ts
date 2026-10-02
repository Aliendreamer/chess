import { expect, test } from '@playwright/test'
import { PLAYER, move, signedIn } from './support'

/**
 * player-profiles: after a game, a player opens their opponent's profile from the game page and finds the record and
 * the game; their own profile is in the navigation. The opponent here is the computer, which has a profile too.
 */
test('a profile opens from the game page with the record and the game', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await signedIn(browser, PLAYER)
  const form = page.getByTestId('engine-form')
  await expect(async () => {
    await form.getByRole('button', { name: 'Level Expert' }).click()
    await expect(form.getByRole('button', { name: 'Level Expert' })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 1_000 },
    )
  }).toPass({ timeout: 15_000 })
  await form.getByRole('button', { name: 'White', exact: true }).click()
  await form.getByRole('button', { name: 'Play the computer' }).click()
  await expect(page).toHaveURL(/\/games\//)
  const gameId = new URL(page.url()).pathname.split('/').at(-1)!
  await move(page, 'e2', 'e4')
  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByTestId('game-result')).toHaveText('0–1')

  await page.getByTestId('strip-black').getByRole('link', { name: 'Stockfish (Expert)' }).click()
  await expect(page).toHaveURL(/\/players\/-3$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Stockfish (Expert)')
  await expect(page.getByTestId('player-record')).toContainText('Untimed')
  // The read side catches up with the ending through Kafka: reload until the game is listed.
  await expect(async () => {
    await page.reload()
    await expect(page.locator(`a[href="/games/${gameId}"]`)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  await page.getByRole('link', { name: 'Profile' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PLAYER)
})
