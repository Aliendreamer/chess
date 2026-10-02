import { expect, test } from '@playwright/test'
import { PLAYER, USER, signedIn } from './support'

/** admin-screens: testuser (realm role Admin) finds the dead-letter page; player (no role) does not. */
test('only an admin reaches the dead letters', async ({ browser }) => {
  const admin = await signedIn(browser, USER)
  await admin.getByRole('complementary').getByRole('link', { name: 'Admin' }).click()
  await expect(admin).toHaveURL(/\/admin$/)
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Dead letters')
  await expect(admin.getByRole('group', { name: 'Projection' })).toBeVisible()
  // Either rows or the empty state, depending on what earlier runs left parked.
  await expect(
    admin.getByTestId('dead-letters').or(admin.getByText('Nothing is parked.')),
  ).toBeVisible()

  const player = await signedIn(browser, PLAYER)
  await expect(player.getByRole('complementary').getByRole('link', { name: 'Admin' })).toHaveCount(
    0,
  )
  await player.goto('/admin')
  await expect(player.getByText(/not found/i).first()).toBeVisible()
  await expect(player.getByRole('heading', { name: 'Dead letters' })).toHaveCount(0)
})
