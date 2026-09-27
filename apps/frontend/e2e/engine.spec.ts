import { expect, test } from '@playwright/test'
import { USER, sessionFile } from './support'

/**
 * Playing the computer (engine-play), against the real Stockfish in the engine container: pick a level and a colour
 * on the home page, move, and see the engine think and answer within its 5–10 s. No clocks, no draw offers.
 */
test('a game against the computer: it thinks, answers, and takes no draw offers', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const page = await (await browser.newContext({ storageState: sessionFile(USER) })).newPage()
  await page.goto('/')

  // Choices only stick once the page has hydrated: retry until the tile reports itself selected.
  const form = page.getByTestId('engine-form')
  await expect(async () => {
    await form.getByRole('button', { name: 'Level 1320' }).click()
    await expect(form.getByRole('button', { name: 'Level 1320' })).toHaveAttribute(
      'aria-pressed',
      'true',
      {
        timeout: 1_000,
      },
    )
  }).toPass({ timeout: 15_000 })
  await form.getByRole('button', { name: 'White', exact: true }).click()
  await form.getByRole('button', { name: 'Play the computer' }).click()
  await expect(page).toHaveURL(/\/games\//)

  await expect(page.getByTestId('strip-black')).toContainText('Stockfish 1320')
  await expect(page.getByText('Untimed ·')).toBeVisible()
  await expect(page.getByTestId('strip-white')).not.toContainText(':') // no clock

  const origin = page.locator('[data-square="e2"]')
  await expect(origin).toBeEnabled({ timeout: 15_000 })
  await origin.click()
  await page.locator('[data-square="e4"]').click()

  await expect(page.getByTestId('engine-thinking')).toHaveText('Stockfish 1320 is thinking…')
  // The answer arrives as a live frame; the board is White's again.
  await expect(page.getByTestId('move-list')).toHaveText(/^1\.e4\S+$/, { timeout: 45_000 })
  await expect(page.getByTestId('engine-thinking')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Offer draw' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByTestId('game-result')).toHaveText('0–1')
  await expect(page.getByText('resignation', { exact: true })).toBeVisible()
})
