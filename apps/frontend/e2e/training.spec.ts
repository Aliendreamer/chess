import { expect, test } from '@playwright/test'
import { Chess } from 'chess.js'
import { USER, move, signedIn } from './support'
import type { Page } from '@playwright/test'

/** Picks a chip once the page has hydrated: retry until it reports itself selected. */
async function choose(page: Page, group: string, name: string) {
  const chip = page.getByRole('group', { name: group }).getByRole('button', { name, exact: true })
  await expect(async () => {
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

/**
 * Starts a session and waits for its first position or the empty pool's message (the pool depends on what the stack
 * has reviewed and mined so far). True when a position is on the board.
 */
async function startSession(page: Page): Promise<boolean> {
  await page.getByRole('button', { name: 'Start' }).click()
  const prompt = page.getByTestId('training-prompt')
  const empty = page.getByTestId('training-empty')
  await expect(prompt.or(empty)).toBeVisible({ timeout: 15_000 })
  return prompt.isVisible()
}

/** Plays the first legal move of the position on the board and waits for the server's verdict. */
async function answer(page: Page) {
  const fen = await page.getByTestId('training-board').getAttribute('data-fen')
  const [first] = new Chess(fen ?? undefined).moves({ verbose: true })
  await move(page, first!.from, first!.to)
  if (first!.promotion) await page.getByRole('button', { name: 'queen' }).click()
  await expect(page.getByTestId('training-verdict-text')).toHaveText(
    /^(The move|Engine approves|Not this time)/,
    { timeout: 15_000 },
  )
}

/**
 * training, "My games" in a set of 10: a position is answered, judged by the server and Enter moves on; with an empty
 * pool the page says why. The member's own profile shows the Training panel.
 */
test('a set from my games starts, or says the pool is empty', async ({ browser }) => {
  test.setTimeout(90_000)
  const page = await signedIn(browser, USER)
  await page.goto('/training')
  await choose(page, 'Mode', 'My games')
  await choose(page, 'Length', '10 positions')
  await expect(page.getByTestId('training-pool')).toContainText('from your games')

  if (await startSession(page)) {
    await answer(page)
    await expect(
      page.getByRole('img', { name: /^(1 right, 0 wrong|0 right, 1 wrong), 9 to go$/ }),
    ).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('training-verdict')).toBeHidden({ timeout: 15_000 })
  } else {
    await expect(page.getByTestId('training-empty')).toContainText('No mistakes to train yet.')
  }

  await page.getByRole('complementary').getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByTestId('player-sessions')).toContainText('My games:')
})

/** training, "Master games" filtered to endgames, endless: one answer, then Finish shows the summary. */
test('an endless master-games session with a filter starts, or says nothing matches', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const page = await signedIn(browser, USER)
  await page.goto('/training?mode=library')
  await choose(page, 'Mode', 'Master games')
  await choose(page, 'Phase', 'Endgame')
  await choose(page, 'Length', 'Endless')

  if (await startSession(page)) {
    await expect(page.getByTestId('training-prompt')).toHaveText(
      /^(White|Black) to move: find the best move$/,
    )
    await answer(page)
    await expect(page.getByTestId('training-score')).toHaveText(/^[01] \/ 1$/)
    await expect(page.getByTestId('training-source')).toContainText('move')
    await page.getByRole('button', { name: 'Finish' }).click()
    await expect(page.getByTestId('training-final-score')).toHaveText(/^[01] \/ 1$/)
    await page.getByRole('button', { name: 'Change settings' }).click()
    await expect(page.getByTestId('training-start')).toBeVisible()
  } else {
    await expect(page.getByTestId('training-empty')).toHaveText(
      'No master position matches these filters.',
    )
  }
})

test('/practice goes to training', async ({ browser }) => {
  const page = await signedIn(browser, USER)
  await page.goto('/practice')
  await expect(page).toHaveURL(/\/training$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Training')
})
