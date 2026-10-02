import { expect, test } from '@playwright/test'
import { USER, signedIn } from './support'

/**
 * user-preferences: a board theme chosen on /settings is saved to the account and the server-rendered page already
 * uses it after a reload. The theme is put back to Brown at the end, so other specs see the default.
 */
test('a chosen board theme survives a reload', async ({ browser }) => {
  const page = await signedIn(browser, USER)
  await page.goto('/settings')

  // The chip is in the server HTML before hydration; retry until the click takes.
  await expect(async () => {
    await page.getByRole('button', { name: 'Blue' }).click()
    await expect(page.getByTestId('shell')).toHaveAttribute('data-board', 'blue', {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })

  await page.reload()
  await expect(page.getByTestId('shell')).toHaveAttribute('data-board', 'blue')
  // The square colour itself, as the server rendered it.
  await expect(page.locator('[data-testid="settings-preview"] [data-square="a8"]')).toHaveCSS(
    'background-color',
    'rgb(222, 227, 230)',
  )

  // Freshly reloaded, so the same wait for hydration before the click.
  await expect(async () => {
    await page.getByRole('button', { name: 'Brown' }).click()
    await expect(page.getByTestId('shell')).toHaveAttribute('data-board', 'brown', {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })
})

test('the light site theme applies from the first paint (site-themes)', async ({ browser }) => {
  const page = await signedIn(browser, USER)
  await page.goto('/settings')

  await expect(async () => {
    await page.getByRole('button', { name: 'Light (Parchment)' }).click()
    await expect(page.getByTestId('shell')).toHaveAttribute('data-theme', 'light', {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })

  await page.reload()
  await expect(page.getByTestId('shell')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByTestId('shell')).toHaveCSS('background-color', /oklch\(0\.97 /)

  await expect(async () => {
    await page.getByRole('button', { name: 'Dark (Club)' }).click()
    await expect(page.getByTestId('shell')).toHaveAttribute('data-theme', 'dark', {
      timeout: 2_000,
    })
  }).toPass({ timeout: 15_000 })
})
