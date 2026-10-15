import { expect, test } from '@playwright/test'
import { PLAYER, USER, move, signedIn, withPairingLock } from './support'

/**
 * club-members and challenges, as two members would do it: player has a page open, so testuser sees them online on
 * /members, challenges them to 3+2, and player accepts from the banner on whatever page they are on. Both browsers
 * open the same game, which is then resigned so neither stays "playing".
 */
test('a member challenges an online member, who accepts from the banner', async ({ browser }) => {
  test.setTimeout(120_000)
  const challenger = await signedIn(browser, USER)
  const challenged = await signedIn(browser, PLAYER)

  await withPairingLock(async () => {
    await challenger.goto('/members')
    await expect(challenger.getByRole('heading', { level: 1 })).toHaveText('Members')
    const row = challenger.locator(`[data-testid="member-row"][data-member="${PLAYER}"]`)
    await expect(row.getByTestId('member-state')).toHaveText('Online', { timeout: 20_000 })

    // The button only works once hydrated: retry until the form opens.
    await expect(async () => {
      await row.getByRole('button', { name: `Challenge ${PLAYER}` }).click({ timeout: 1_000 })
      await expect(challenger.getByTestId('challenge-form')).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 20_000 })
    await challenger.getByTestId('challenge-form').getByRole('button', { name: '3+2' }).click()
    await challenger.getByRole('button', { name: 'Send' }).click()
    await expect(challenger.getByText(`Waiting for ${PLAYER}…`)).toBeVisible()

    const banner = challenged.getByTestId('challenge-banner')
    await expect(banner).toContainText(`${USER} challenges you to Blitz 3+2`, { timeout: 15_000 })
    await banner.getByRole('button', { name: `Accept ${USER}'s challenge` }).click()

    await expect(challenged).toHaveURL(/\/games\//, { timeout: 20_000 })
    await expect(challenger).toHaveURL(challenged.url(), { timeout: 20_000 })
  })

  for (const page of [challenger, challenged]) {
    await expect(page.locator('[data-my-turn]')).toHaveAttribute('data-my-turn', /^(true|false)$/, {
      timeout: 15_000,
    })
  }
  const challengerIsWhite =
    (await challenger.locator('[data-my-turn]').getAttribute('data-my-turn')) === 'true'
  const [white, black] = challengerIsWhite ? [challenger, challenged] : [challenged, challenger]
  await move(white, 'e2', 'e4')
  await move(black, 'e7', 'e5')
  await expect(white.getByRole('button', { name: 'Resign' })).toBeEnabled({ timeout: 15_000 })
  await white.getByRole('button', { name: 'Resign' }).click()
  for (const page of [white, black]) {
    await expect(page.getByTestId('result-panel')).toContainText('Resignation')
  }
})

test('a finished game on a profile opens on the analysis board', async ({ browser }) => {
  const page = await signedIn(browser, USER)
  await page.goto('/members')
  await page
    .locator(`[data-testid="member-row"][data-member="${PLAYER}"]`)
    .getByRole('link', { name: PLAYER })
    .click()
  await expect(page).toHaveURL(/\/players\/\d+$/)
  const analyse = page.getByRole('link', { name: /^Analyse the game vs / }).first()
  await expect(analyse).toBeVisible({ timeout: 15_000 })
  await analyse.click()
  await expect(page).toHaveURL(/\/analysis\?game=/)
})
