import { expect, test } from '@playwright/test'
import { PLAYER, USER, move, signedIn } from './support'

/**
 * Studies (studies): import a pasted PGN, add a variation by playing on the board, save, share, and the other user
 * opens the link read-only.
 */
test('a study: import, a variation played on the board, saved, shared and read by another user', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const owner = await signedIn(browser, USER)
  const title = `E2E study ${Date.now()}`

  await owner.goto('/studies')
  // The form only takes input once the page has hydrated: retry until the Import button reacts to the text.
  await expect(async () => {
    await owner
      .getByRole('textbox', { name: 'PGN' })
      .fill(`[Event "${title}"]\n\n1. e4 e5 2. Nf3 *`)
    await expect(owner.getByRole('button', { name: 'Import' })).toBeEnabled({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await owner.getByRole('button', { name: 'Import' }).click()
  await expect(owner.getByTestId('import-report')).toContainText('Imported 1 study.')

  await owner.getByRole('link', { name: title }).click()
  await expect(owner).toHaveURL(/\/studies\/[0-9a-f-]+$/)
  const tree = owner.getByTestId('move-tree')
  await expect(tree).toHaveText('1.e4e52.Nf3')

  // After 1.e4, Black plays 1…c5 on the board: a new line beside 1…e5.
  await expect(async () => {
    await tree.getByRole('button', { name: 'e4' }).click()
    await expect(tree.getByRole('button', { name: 'e4' })).toHaveAttribute('aria-current', 'step', {
      timeout: 1_000,
    })
  }).toPass({ timeout: 15_000 })
  await move(owner, 'c7', 'c5')
  await expect(tree).toHaveText('1.e4e5(1...c5)2.Nf3')

  await owner.getByRole('button', { name: 'Save' }).click()
  await expect(owner.getByRole('button', { name: 'Saved' })).toBeVisible()
  await owner.getByRole('button', { name: 'Share' }).click()
  await expect(owner.getByTestId('study-link')).toContainText('http')
  const link = (await owner.getByTestId('study-link').textContent()) ?? ''

  const reader = await signedIn(browser, PLAYER)
  await reader.goto(link)
  await expect(reader.getByRole('heading', { name: title })).toBeVisible()
  await expect(reader.getByText('read-only', { exact: false })).toBeVisible()
  await expect(reader.getByTestId('move-tree')).toHaveText('1.e4e5(1...c5)2.Nf3')
  await expect(reader.getByRole('button', { name: 'Save' })).toHaveCount(0)
})
