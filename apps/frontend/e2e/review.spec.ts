import { expect, test } from '@playwright/test'
import { inviteGame, move } from './support'

/**
 * game-review against the real engine worker: after a fool's mate the game is reviewed (on its own since training, or
 * when White asks first), 2.g4 comes back as a blunder with a better move, and the panel points White to training.
 */
test('a finished game is reviewed and points to training', async ({ browser }) => {
  test.setTimeout(180_000)
  const { white, black } = await inviteGame(browser)
  await move(white, 'f2', 'f3')
  await move(black, 'e7', 'e5')
  await move(white, 'g2', 'g4')
  await move(black, 'd8', 'h4')
  await expect(white.getByTestId('game-result')).toHaveText('0–1')

  const panel = white.getByTestId('review-panel')
  // The auto-review may already be running; asking again is harmless.
  const ask = panel.getByRole('button', { name: 'Review with engine' })
  const graph = panel.getByRole('img', { name: /Evaluation graph/ })
  await expect(graph.or(ask)).toBeVisible({ timeout: 15_000 })
  if (await ask.isVisible()) await ask.click()
  await expect(graph).toBeVisible()
  // Four positions at under a second each on the review queue.
  await expect(white.getByTestId('move-list')).toContainText('g4??', { timeout: 90_000 })
  await expect(panel.getByRole('table', { name: 'Marks per player' })).toBeVisible()

  await white.getByTestId('move-list').getByRole('button', { name: 'g4??' }).click()
  await expect(panel.getByTestId('review-move')).toContainText('2.g4 is a blunder. Better:')

  // The other player sees the same review without asking.
  await black.reload()
  await expect(black.getByTestId('move-list')).toContainText('g4??')

  await expect(panel.getByTestId('review-training')).toBeVisible()
  await panel.getByRole('link', { name: 'Open training' }).click()
  await expect(white).toHaveURL(/\/training$/)
})
