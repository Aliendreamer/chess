import { expect, test } from '@playwright/test'
import { PLAYER, USER, move, signedIn } from './support'

/**
 * live-home: `player` plays the computer; `testuser`, not in that game, finds it on Club TV and on the Watch page and
 * opens it as a spectator — the board without the players' controls.
 */
test('a game in play shows on Club TV and Watch, and opens for a spectator', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const playing = await signedIn(browser, PLAYER)
  const form = playing.getByTestId('engine-form')
  await expect(async () => {
    await form.getByRole('button', { name: 'Level Casual' }).click()
    await expect(form.getByRole('button', { name: 'Level Casual' })).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 1_000 },
    )
  }).toPass({ timeout: 15_000 })
  await form.getByRole('button', { name: 'White', exact: true }).click()
  await form.getByRole('button', { name: 'Play the computer' }).click()
  await expect(playing).toHaveURL(/\/games\//)
  const gameId = new URL(playing.url()).pathname.split('/').at(-1)!
  await move(playing, 'e2', 'e4')

  // The move reaches the read side through Kafka; the lobby is shared for 2 s. Reload until the board is there.
  const watcher = await signedIn(browser, USER)
  const tvBoard = watcher.getByTestId('tv').locator(`a[href="/games/${gameId}"]`)
  await expect(async () => {
    await watcher.goto('/')
    await expect(tvBoard).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 45_000 })
  await expect(tvBoard.getByRole('img')).toHaveAccessibleName(/^player vs Stockfish \(Casual\)/)
  await expect(watcher.getByTestId('club-pulse')).toContainText('in play')

  await watcher.goto('/watch')
  await watcher.getByTestId('tv').locator(`a[href="/games/${gameId}"]`).click()
  await expect(watcher).toHaveURL(new RegExp(`/games/${gameId}$`))
  await expect(watcher.getByTestId('strip-white')).toContainText('player')
  await expect(watcher.getByRole('button', { name: 'Resign' })).toHaveCount(0)

  await playing.getByRole('button', { name: 'Resign' }).click()
  await expect(playing.getByTestId('game-result')).toHaveText('0–1')
})
