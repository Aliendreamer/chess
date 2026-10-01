import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * responsive-layout, on a phone (the `mobile` project: 390×844, touch). Every page fits the width, the rail is a top
 * bar with a menu, and a game's board takes the full width with both players visible.
 */

async function fitsTheWidth(page: Page) {
  const { scroll, viewport } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(scroll, `${page.url()} scrolls sideways`).toBeLessThanOrEqual(viewport)
}

for (const path of ['/', '/games', '/studies', '/settings']) {
  test(`${path} has no horizontal scroll`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByTestId('shell')).toBeVisible()
    await fitsTheWidth(page)
  })
}

test('the top bar menu reaches every page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('complementary')).toBeHidden() // the rail
  await page.getByText('Menu').click()
  for (const name of ['Home', 'History', 'Studies', 'Settings']) {
    await expect(page.getByRole('link', { name })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'Log out' })).toBeVisible()
  await page.getByRole('link', { name: 'History' }).click()
  await expect(page).toHaveURL(/\/games$/)
})

test('a game on a phone: full-width board, both players in view, touch-sized controls', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto('/')
  const form = page.getByTestId('engine-form')
  await expect(async () => {
    await form.getByRole('button', { name: 'Level Casual' }).click()
    await expect(form.getByRole('button', { name: 'Level Casual' })).toHaveAttribute(
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

  await fitsTheWidth(page)
  const board = await page.locator('[data-my-turn]').boundingBox()
  expect(board?.width).toBeGreaterThanOrEqual(358)
  await expect(page.getByTestId('strip-white')).toBeInViewport()
  await expect(page.getByTestId('strip-black')).toBeInViewport()

  const abort = page.getByRole('button', { name: 'Abort' })
  expect((await abort.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await abort.click()
})
