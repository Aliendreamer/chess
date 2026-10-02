import { expect, test } from '@playwright/test'
import { PLAYER, USER, move, signedIn } from './support'

/**
 * analysis-board: a position from a link is analysed without creating anything, a broken FEN is refused, a finished
 * game opens on the board from its Analyse button, and Save as study keeps the analysis.
 */
const AFTER_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'

test('a position from a link is analysed and a broken FEN is refused', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await signedIn(browser, USER)
  await page.goto(`/analysis?fen=${encodeURIComponent(AFTER_NF3)}`)
  await expect(page).toHaveTitle('Analysis · Chess')

  await move(page, 'b8', 'c6')
  const tree = page.getByTestId('move-tree')
  await expect(tree).toContainText('Nc6')

  const panel = page.getByTestId('analysis-panel')
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
  await panel.getByRole('button', { name: 'Evaluate' }).click()
  await expect(panel.getByTestId('analysis-lines').getByRole('button').first()).toHaveText(
    /[+-]?\d+\.\d\d|#-?\d+/,
    { timeout: 60_000 },
  )

  await page.getByRole('textbox', { name: 'FEN or PGN' }).fill('not a position')
  await page.getByRole('button', { name: 'Load' }).click()
  await expect(page.getByTestId('paste-error')).toBeVisible()
  await expect(tree).toContainText('Nc6') // the analysis stays
})

test('a finished game opens on the board and is saved as a study', async ({ browser }) => {
  test.setTimeout(120_000)
  const page = await signedIn(browser, PLAYER)
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
  await move(page, 'e2', 'e4')
  await page.getByRole('button', { name: 'Resign' }).click()
  await expect(page.getByTestId('game-result')).toHaveText('0–1')

  await page.getByTestId('result-panel').getByRole('button', { name: 'Analyse' }).click()
  await expect(page).toHaveURL(/\/analysis\?game=/)
  await expect(page.getByTestId('move-tree')).toContainText('e4')
  await expect(page.getByTestId('analysis-source')).toContainText('Stockfish (Casual)')

  await page.getByRole('button', { name: 'Save as study' }).click()
  await expect(page).toHaveURL(/\/studies\/[0-9a-f-]+$/)
  await expect(page.getByTestId('move-tree')).toContainText('e4')
})
