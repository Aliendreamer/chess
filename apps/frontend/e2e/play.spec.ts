import { expect, test } from '@playwright/test'
import { DRAG_STEPS, PLAYER, USER, drag, inviteGame, move, sessionFile, signedIn } from './support'
import type { Browser, Page } from '@playwright/test'

/**
 * Part 1 end to end, as two people would do it: testuser creates an invite as White, player opens the link and
 * accepts, and the game is played by clicking squares — to a checkmate, a resignation and an agreed draw. Both
 * boards show the ending with a PGN to download.
 */

/** Both boards show the same ending. */
async function bothEnded(pages: Array<Page>, result: string, reason: string) {
  for (const page of pages) {
    await expect(page.getByTestId('game-result')).toHaveText(result)
    await expect(page.getByTestId('result-panel')).toContainText(reason)
    await expect(page.getByTestId('game-pgn')).toBeVisible()
  }
}

test('two players meet through an invite and play the fool’s mate', async ({ browser }) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)

  await move(white, 'f2', 'f3')
  await move(black, 'e7', 'e5')
  await move(white, 'g2', 'g4')
  await move(black, 'd8', 'h4')

  await bothEnded([white, black], '0–1', 'Checkmate')
  await expect(white.getByTestId('move-list')).toHaveText('1.f3e52.g4Qh4#')
})

test('a player resigns after the opening moves', async ({ browser }) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)

  await move(white, 'e2', 'e4')
  await move(black, 'e7', 'e5')
  await expect(white.getByRole('button', { name: 'Resign' })).toBeEnabled({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Resign' }).click()

  await bothEnded([white, black], '0–1', 'Resignation')
})

test('a draw is offered and accepted', async ({ browser }) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)

  await move(white, 'e2', 'e4')
  await move(black, 'e7', 'e5')
  await expect(white.getByRole('button', { name: 'Offer draw' })).toBeEnabled({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Offer draw' }).click()
  await expect(white.getByRole('button', { name: 'Draw offered' })).toBeDisabled()
  // Black learns of the offer from the game's live frame.
  await black.getByRole('button', { name: 'Accept draw' }).click({ timeout: 15_000 })

  await bothEnded([white, black], '½', 'Draw agreed')
})

test('pieces can be dragged, a premove plays itself, and the game can be looked back on', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)

  await drag(white, 'e2', 'e4')
  await drag(black, 'e7', 'e5')
  await expect(white.getByTestId('move-list')).toHaveText('1.e4e5', { timeout: 15_000 })

  // White to move: Black queues Nc6 by dragging while it is not their turn.
  await expect(black.locator('[data-my-turn]')).toHaveAttribute('data-my-turn', 'false')
  await black
    .locator('[data-square="b8"] img')
    .dragTo(black.locator('[data-square="c6"]'), { steps: DRAG_STEPS })
  await move(white, 'g1', 'f3')
  // Black never clicks again: the premove is sent when White's move arrives.
  await expect(white.getByTestId('move-list')).toHaveText('1.e4e52.Nf3Nc6', { timeout: 15_000 })

  // game-page-navigation: ← shows the position before Nc6 (the knight back on b8), `f` turns the board around,
  // and "Back to the game" returns to the live position.
  await white.keyboard.press('ArrowLeft')
  await expect(white.locator('[data-square="b8"] img')).toBeVisible()
  await expect(white.getByRole('button', { name: 'Nf3' })).toHaveAttribute('aria-current', 'true')
  await white.keyboard.press('f')
  await expect(white.locator('[data-my-turn] [data-square]').first()).toHaveAttribute(
    'data-square',
    'h1',
  )
  await white.getByRole('button', { name: 'Back to the game' }).click()
  await expect(white.locator('[data-square="c6"] img')).toBeVisible()

  await expect(white.getByRole('button', { name: 'Resign' })).toBeEnabled({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Resign' }).click()
  await bothEnded([white, black], '0–1', 'Resignation')
})

test('after a game, both players agree to a rematch with the colours swapped (game-feedback)', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const { white, black } = await inviteGame(browser)
  const first = white.url()

  // White is to move, so the tab says so; then the game is aborted while both pages are open.
  await expect(white).toHaveTitle(/^● Your move · vs /, { timeout: 15_000 })
  await expect(white.getByRole('button', { name: 'Abort' })).toBeEnabled({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Abort' }).click()

  // The game-over card appears over both boards; White offers the rematch and Black accepts it.
  await expect(white.getByTestId('game-over')).toBeVisible({ timeout: 15_000 })
  await expect(black.getByTestId('game-over')).toBeVisible({ timeout: 15_000 })
  await white.getByTestId('game-over').getByRole('button', { name: 'Rematch' }).click()
  await expect(white.getByTestId('rematch')).toContainText('Rematch offered')
  await black.getByRole('button', { name: 'Accept rematch' }).click({ timeout: 15_000 })

  // Both land on the same new game, and the former Black now moves first.
  await expect(black).not.toHaveURL(first, { timeout: 15_000 })
  await expect(white).toHaveURL(black.url(), { timeout: 15_000 })
  await expect(black.locator('[data-my-turn]')).toHaveAttribute('data-my-turn', 'true', {
    timeout: 15_000,
  })
  await expect(white.locator('[data-my-turn]')).toHaveAttribute('data-my-turn', 'false')
  await expect(black.getByRole('button', { name: 'Abort' })).toBeEnabled({ timeout: 15_000 })
  await black.getByRole('button', { name: 'Abort' }).click()
})
