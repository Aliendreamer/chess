import { expect, test } from '@playwright/test'
import { USER, signedIn } from './support'

/**
 * Engine analysis on the study board (engine-analysis D5): analyse a study's line, see each move's score in the move
 * tree and the position's best lines, and play the first line into the study.
 */
test('a study line is analysed, scored move by move, and an engine line is played into it', async ({
  browser,
}) => {
  test.setTimeout(150_000)
  const owner = await signedIn(browser, USER)
  const title = `E2E analysis ${Date.now()}`

  await owner.goto('/studies')
  await expect(async () => {
    await owner
      .getByRole('textbox', { name: 'PGN' })
      .fill(`[Event "${title}"]\n\n1. e4 e5 2. Nf3 *`)
    await expect(owner.getByRole('button', { name: 'Import' })).toBeEnabled({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await owner.getByRole('button', { name: 'Import' }).click()
  await owner.getByRole('link', { name: title }).click()
  await expect(owner).toHaveURL(/\/studies\/[0-9a-f-]+$/)
  const tree = owner.getByTestId('move-tree')
  await expect(tree).toHaveText('1.e4e52.Nf3')

  // From the start: the start position and the three after it, at the quick think time.
  const panel = owner.getByTestId('analysis-panel')
  await expect(async () => {
    await panel.getByRole('button', { name: 'Quick' }).click()
    await expect(panel.getByRole('button', { name: 'Quick' })).toHaveAttribute(
      'aria-pressed',
      'true',
      {
        timeout: 1_000,
      },
    )
  }).toPass({ timeout: 15_000 })
  await panel.getByRole('button', { name: 'Analyse line' }).click()

  const score = /[+-]?\d+\.\d\d|#-?\d+/
  await expect(
    tree.getByRole('button', { name: 'Nf3' }).locator('xpath=following-sibling::span[1]'),
  ).toHaveText(score, { timeout: 90_000 })
  await expect(panel.getByTestId('analysis-progress')).toHaveCount(0)
  const lines = panel.getByTestId('analysis-lines').getByRole('button')
  await expect(lines).toHaveCount(3)
  await expect(lines.first()).toHaveText(score)

  // Playing the best line follows the moves the study already has and adds the rest.
  await lines.first().click()
  await expect(tree).not.toHaveText('1.e4e52.Nf3')
  await expect(owner.getByRole('button', { name: 'Save' })).toBeEnabled()
  await owner.getByRole('button', { name: 'Save' }).click()
  await expect(owner.getByRole('button', { name: 'Saved' })).toBeVisible()
})
