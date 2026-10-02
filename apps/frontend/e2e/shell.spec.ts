import { expect, test } from '@playwright/test'
import { USER, signedIn } from './support'

/** ui-polish: pages name themselves in the tab, and an unknown address is a not-found panel inside the shell. */
test('pages are titled and an unknown address stays inside the shell', async ({ browser }) => {
  const page = await signedIn(browser, USER)
  await expect(page).toHaveTitle('Home · Chess')
  await page.goto('/games')
  await expect(page).toHaveTitle('History · Chess')

  await page.goto('/nowhere')
  await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('complementary').getByRole('link', { name: 'History' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveTitle('Home · Chess')
})
