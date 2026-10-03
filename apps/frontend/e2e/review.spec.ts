import { expect, test } from '@playwright/test'
import { inviteGame, move } from './support'

/**
 * game-review against the real engine worker: after a fool's mate, White asks for the review, 2.g4 comes back as a
 * blunder with a better move, White adds their mistakes to practice and answers a practice position.
 */
test('a finished game is reviewed and its blunder practised', async ({ browser }) => {
  test.setTimeout(180_000)
  const { white, black } = await inviteGame(browser)
  await move(white, 'f2', 'f3')
  await move(black, 'e7', 'e5')
  await move(white, 'g2', 'g4')
  await move(black, 'd8', 'h4')
  await expect(white.getByTestId('game-result')).toHaveText('0–1')

  const panel = white.getByTestId('review-panel')
  await panel.getByRole('button', { name: 'Review with engine' }).click()
  await expect(panel.getByRole('img', { name: /Evaluation graph/ })).toBeVisible()
  // Four positions at under a second each on the review queue.
  await expect(white.getByTestId('move-list')).toContainText('g4??', { timeout: 90_000 })
  await expect(panel.getByRole('table', { name: 'Marks per player' })).toBeVisible()

  await white.getByTestId('move-list').getByRole('button', { name: 'g4??' }).click()
  await expect(panel.getByTestId('review-move')).toContainText('2.g4 is a blunder. Better:')

  // The other player sees the same review without asking.
  await black.reload()
  await expect(black.getByTestId('move-list')).toContainText('g4??')

  await panel.getByRole('button', { name: 'Practise my mistakes' }).click()
  await expect(panel.getByTestId('practice-added')).toContainText('added to your practice')

  await white.goto('/practice')
  await expect(white.getByTestId('practice-question')).toContainText('You played')
  await expect(white.locator('[data-square="e1"] img')).toBeVisible()
  await expect(async () => {
    await white.getByRole('button', { name: 'Show answer' }).click({ timeout: 1_000 })
    await expect(white.getByTestId('practice-feedback')).toContainText('The engine plays', {
      timeout: 1_000,
    })
  }).toPass({ timeout: 15_000 })
  await expect(white.getByRole('button', { name: 'Next position' })).toBeVisible()
})
