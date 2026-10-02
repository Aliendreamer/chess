import { expect, test } from '@playwright/test'
import { USER, signedIn } from './support'

/**
 * game-library: an admin imports a small PGN (one good game, one with an illegal move), finds the good game by part
 * of a player's name, opens it on the analysis board with its source, and the In the library panel lists it at a
 * middle position. A per-run name keeps reruns from being duplicates.
 */
test('an imported game is searched, opened and found at a position', async ({ browser }) => {
  test.setTimeout(120_000)
  const run = Date.now().toString(36)
  const white = `Anderssen${run}`
  const pgn = [
    `[Event "Immortal ${run}"]\n[Date "1851.06.21"]\n[White "${white}"]\n[Black "Kieseritzky"]\n[Result "1-0"]\n\n1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 1-0`,
    `[White "Broken${run}"]\n[Black "Game"]\n[Result "*"]\n\n1. e4 e5 2. Ke3 *`,
  ].join('\n\n')

  const page = await signedIn(browser, USER)
  await page.goto('/admin')
  const form = page.getByTestId('library-import')
  await expect(async () => {
    await form.getByRole('textbox', { name: 'Source' }).fill('E2E')
    await expect(form.getByRole('textbox', { name: 'Source' })).toHaveValue('E2E', {
      timeout: 1_000,
    })
  }).toPass({ timeout: 15_000 })
  await form.getByRole('textbox', { name: 'Licence' }).fill('test data')
  await form.getByRole('textbox', { name: 'PGN' }).fill(pgn)
  await form.getByRole('button', { name: 'Import to library' }).click()
  await expect(form.getByText(/Imported 1 · duplicates 0 · refused 1/)).toBeVisible()

  await page.goto(`/library?player=${encodeURIComponent(white.toLowerCase())}`)
  const results = page.getByTestId('library-games')
  await expect(results.getByRole('link')).toHaveCount(1)
  await results.getByRole('link', { name: new RegExp(white) }).click()
  await expect(page).toHaveURL(/\/analysis\?library=/)
  await expect(page.getByTestId('library-attribution')).toContainText('Source: E2E — test data')
  await expect(page.getByTestId('move-tree')).toContainText('Qh4+')

  // Back to after 2.f4 (the King's Gambit): the panel lists this game, the opening is named.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('opening-name')).toContainText("King's Gambit")
  await expect(
    page.getByTestId('library-panel').getByRole('link', { name: new RegExp(white) }),
  ).toBeVisible()
})
