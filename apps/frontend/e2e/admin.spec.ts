import { expect, test } from '@playwright/test'
import { PLAYER, USER, signedIn } from './support'

/** admin-screens: testuser (realm role Admin) finds the dead-letter page; player (no role) does not. */
test('only an admin reaches the dead letters', async ({ browser }) => {
  const admin = await signedIn(browser, USER)
  await admin.getByRole('complementary').getByRole('link', { name: 'Admin' }).click()
  await expect(admin).toHaveURL(/\/admin$/)
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Admin')
  await expect(admin.getByRole('heading', { name: 'Dead letters' })).toBeVisible()
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

/** member-admin: testuser (Admin) creates a member, sees the temporary password once, then deactivates them. */
test('an admin creates a member and deactivates them', async ({ browser }) => {
  const admin = await signedIn(browser, USER)
  await admin.goto('/admin')
  const username = `e2e-${Date.now().toString(36)}`
  const form = admin.getByRole('form', { name: 'New member' })
  await form.getByLabel('Username').fill(username)
  await form.getByLabel('Full name').fill('End To End')
  await expect(async () => {
    await form.getByRole('button', { name: 'Create member' }).click({ timeout: 1_000 })
    await expect(admin.getByTestId('temporary-password')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(admin.getByTestId('temporary-password')).toContainText(
    `Give this to ${username}; they choose their own at first sign-in.`,
  )
  await expect(admin.getByTestId('temporary-password-value')).toHaveText(/^\S{16}$/)

  const row = admin.locator(`[data-testid="admin-member"][data-member="${username}"]`)
  await expect(row.getByText('Active')).toBeVisible()
  await row.getByRole('button', { name: `Deactivate ${username}` }).click()
  await expect(row.getByText('Deactivated')).toBeVisible({ timeout: 15_000 })

  // Your own row cannot be deactivated.
  const own = admin.locator(`[data-testid="admin-member"][data-member="${USER}"]`)
  await expect(own.getByRole('button', { name: `Deactivate ${USER}` })).toBeDisabled()
})
