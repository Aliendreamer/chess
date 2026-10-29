import { expect, test } from '@playwright/test'
import { Chess } from 'chess.js'
import { USER, move, signedIn } from './support'
import type { Page } from '@playwright/test'

/** The SANs of the moves played so far, from the drill's move line ("1.e4 e5 2.Nf3"). */
async function played(page: Page): Promise<Array<string>> {
  const text = (await page.getByTestId('drill-moves').textContent()) ?? ''
  return text
    .split(' ')
    .filter(Boolean)
    .map((t) => t.replace(/^\d+\./, ''))
}

async function playSan(page: Page, sans: ReadonlyArray<string>, san: string) {
  const board = new Chess()
  for (const s of sans) board.move(s)
  const m = board.move(san)
  await move(page, m.from, m.to)
}

/**
 * One run through the line on the board. Without `known` it does not know the line: it tries a legal move, and when
 * the drill says it is wrong, plays the move the drill shows instead. Returns the whole line's SANs.
 */
async function runLine(page: Page, known?: ReadonlyArray<string>): Promise<Array<string>> {
  const status = page.getByTestId('drill-status')
  const outcome = page.getByTestId('run-outcome')
  // Never waits on a missing element: between the line's end and the recorded outcome neither is shown.
  const state = async () =>
    (await outcome.count()) > 0
      ? 'done'
      : (await status.count()) > 0
        ? ((await status.textContent()) ?? '')
        : ''
  for (;;) {
    await expect.poll(state, { timeout: 15_000 }).toMatch(/^(done|Your move\.)$/)
    if ((await outcome.count()) > 0) return played(page)

    const sans = await played(page)
    const guess = known?.[sans.length] ?? legalFirst(sans)
    await playSan(page, sans, guess)
    await expect
      .poll(
        async () =>
          (await played(page)).length > sans.length ||
          /is not the line/.test((await status.textContent()) ?? ''),
      )
      .toBe(true)
    const wrong = /Play \d+\.(?:\.\.)?(.+)\.$/.exec((await status.textContent()) ?? '')
    if (wrong && (await played(page)).length === sans.length) {
      await playSan(page, sans, wrong[1]!)
      await expect.poll(async () => (await played(page)).length).toBeGreaterThan(sans.length)
    }
  }
}

function legalFirst(sans: ReadonlyArray<string>): string {
  const board = new Chess()
  for (const s of sans) board.move(s)
  return board.moves()[0]!
}

/**
 * opening-trainer: a member searches an opening, drills a line as Black (the board plays White), learns it from the
 * moves the drill shows after each wrong one, sees the missed line come back first, plays it cleanly, and finds the
 * family on their own profile. Progress persists between runs, so nothing assumes which line comes first.
 */
test('a line is drilled, missed, offered again and played cleanly', async ({ browser }) => {
  test.setTimeout(180_000)
  const page = await signedIn(browser, USER)
  await page.goto('/trainer?color=black&q=najdorf')
  const families = page.getByTestId('trainer-families')
  await expect(families.getByRole('link', { name: /Najdorf/ }).first()).toBeVisible()
  await families
    .getByRole('link', { name: /Najdorf/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/trainer\/.+color=black/)

  const name = (await page.getByTestId('drill-line').textContent()) ?? ''
  const line = await runLine(page)
  await expect(page.getByTestId('run-outcome')).toContainText('This line comes back first.')

  await page.getByRole('button', { name: 'Next line' }).click()
  await expect(page.getByTestId('run-outcome')).toBeHidden()
  await expect(page.getByTestId('drill-line')).toHaveText(name)
  await runLine(page, line)
  await expect(page.getByTestId('run-outcome')).toContainText(/^Clean\./)
  await expect(page.getByRole('table', { name: 'Lines' })).toContainText(/learning|learned/)

  await page.getByRole('complementary').getByRole('link', { name: 'Profile' }).click()
  await expect(page.getByTestId('player-training')).toContainText(/Sicilian Defense · as Black/)
})

/**
 * study-repertoire-trainer: a member imports a study with one variation (1.e4 e5 2.Nf3, 2.f4), trains it as White from
 * the study page. A new line opens shown, so its first run comes back at once; played again from memory, with the other
 * line's move once (named, not counted), it is clean.
 */
test("a study's lines are drilled, the other line named without a mistake", async ({ browser }) => {
  test.setTimeout(150_000)
  const page = await signedIn(browser, USER)
  const title = `E2E repertoire ${Date.now()}`

  await page.goto('/studies')
  await expect(async () => {
    await page
      .getByRole('textbox', { name: 'PGN' })
      .fill(`[Event "${title}"]\n\n1. e4 e5 2. Nf3 (2. f4) *`)
    await expect(page.getByRole('button', { name: 'Import' })).toBeEnabled({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByTestId('import-report')).toContainText('Imported 1 study.')
  await page.getByRole('link', { name: title }).click()
  await page.getByTestId('study-train').click()
  await expect(page).toHaveURL(/\/trainer\/study\/[0-9a-f-]+\?color=white/)
  await expect(page.getByRole('img', { name: '0 of 2 learned' })).toBeVisible()

  const status = page.getByTestId('drill-status')
  const outcome = page.getByTestId('run-outcome')
  // The main line first, new: shown while it is played, so it comes back first.
  await expect(page.getByTestId('drill-coming')).toContainText('1.e4 e5 2.Nf3')
  await expect(status).toHaveText('Your move.', { timeout: 15_000 })
  await move(page, 'e2', 'e4')
  await expect(status).toHaveText('Your move.', { timeout: 15_000 })
  await move(page, 'g1', 'f3')
  await expect(outcome).toContainText('This line comes back first.')

  // Again, from memory: 1.e4, the board's 1...e5, then 2.f4 is the other line's move here.
  await page.getByRole('button', { name: 'Next line' }).click()
  await expect(outcome).toBeHidden()
  await expect(page.getByTestId('drill-coming')).toBeHidden()
  await expect(status).toHaveText('Your move.', { timeout: 15_000 })
  await move(page, 'e2', 'e4')
  await expect(status).toHaveText('Your move.', { timeout: 15_000 })
  await move(page, 'f2', 'f4')
  await expect(status).toHaveText('2.f4 is your other line here. This one goes 2.Nf3.')
  await move(page, 'g1', 'f3')
  await expect(outcome).toContainText('Clean.')

  // The variation next: new, so shown and back first.
  await page.getByRole('button', { name: 'Next line' }).click()
  await expect(status).toHaveText('Your move.', { timeout: 15_000 })
  await move(page, 'e2', 'e4')
  await expect(status).toHaveText('Your move.', { timeout: 15_000 })
  await move(page, 'f2', 'f4')
  await expect(outcome).toContainText('This line comes back first.')

  const lines = page.getByRole('table', { name: 'Lines' })
  await expect(lines.getByRole('row', { name: /Main line/ })).toContainText('learning')
  await expect(lines.getByRole('row', { name: /2\.f4/ })).toContainText('learning')
})
