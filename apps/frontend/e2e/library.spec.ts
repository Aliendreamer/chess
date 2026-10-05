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

  // The explorer (library-explorer): from the start, 1.e4 is among the moves; clicking it plays it.
  await page.goto('/analysis')
  const explorer = page.getByTestId('explorer')
  await expect(explorer.getByRole('button', { name: 'Play e4' })).toBeVisible()
  await expect(async () => {
    await explorer.getByRole('button', { name: 'Play e4' }).click()
    await expect(page.getByTestId('move-tree')).toContainText('e4', { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await expect(explorer.getByRole('button', { name: 'Play e5' })).toBeVisible()
})

/**
 * broadcast-explorer: a game credited to the lichess broadcasts (seeded through the PGN import, since the stack cannot
 * fetch a month from lichess in a test) is counted under Broadcasts with the CC BY-SA credit, and not under World
 * Championships; the choice stays in the address.
 */
test('the explorer counts one source at a time and credits the lichess broadcasts', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const run = Date.now().toString(36)
  const white = `Broadcaster${run}`
  const pgn = `[Event "Synthetic Open ${run}"]\n[Date "2026.08.01"]\n[White "${white}"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. a3 h6 2. h3 a6 3. Nf3 1-0`

  const page = await signedIn(browser, USER)
  await page.goto('/admin')
  const form = page.getByTestId('library-import')
  await expect(async () => {
    await form.getByRole('textbox', { name: 'Source' }).fill('lichess broadcasts')
    await expect(form.getByRole('textbox', { name: 'Source' })).toHaveValue('lichess broadcasts', {
      timeout: 1_000,
    })
  }).toPass({ timeout: 15_000 })
  await form.getByRole('textbox', { name: 'Licence' }).fill('CC BY-SA 4.0')
  await form.getByRole('textbox', { name: 'PGN' }).fill(pgn)
  await form.getByRole('button', { name: 'Import to library' }).click()
  await expect(form.getByText(/Imported 1 · duplicates 0 · refused 0/)).toBeVisible()

  const fen = 'rnbqkbnr/1pppppp1/p6p/8/8/P6P/1PPPPPP1/RNBQKBNR w KQkq - 0 3'
  await page.goto(`/analysis?fen=${encodeURIComponent(fen)}&src=broadcasts`)
  const panel = page.getByTestId('library-panel')
  await expect(panel.getByRole('link', { name: new RegExp(white) })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Broadcasts' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(panel.getByRole('link', { name: 'Lichess broadcasts, CC BY-SA 4.0' })).toBeVisible()

  await expect(async () => {
    await panel.getByRole('button', { name: 'World Championships' }).click()
    await expect(page).toHaveURL(/src=wc/, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await expect(panel.getByRole('link', { name: new RegExp(white) })).toHaveCount(0)
})
