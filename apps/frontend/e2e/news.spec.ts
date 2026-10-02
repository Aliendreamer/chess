import { expect, test } from '@playwright/test'
import { USER, signedIn } from './support'

/**
 * chess-news against the stack's live feeds: home shows headlines that open on their source's https site (or the
 * empty state when every feed is unreachable from the stack), Events now links only to lichess broadcasts (or is
 * absent), and the News page filters by source.
 */
test('news and tournaments now', async ({ browser }) => {
  const page = await signedIn(browser, USER)
  const headlines = page.getByTestId('news').getByRole('link')
  await expect(headlines.first().or(page.getByText('No news yet.'))).toBeVisible()
  if ((await headlines.count()) > 0) {
    await expect(headlines.first()).toHaveAttribute('href', /^https:\/\//)
    await expect(headlines.first()).toHaveAttribute('target', '_blank')
  }

  const events = page.getByTestId('events-now')
  if ((await events.count()) > 0) {
    for (const href of await events
      .getByRole('link')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')))) {
      expect(href).toMatch(/^https:\/\/lichess\.org\/broadcast\//)
    }
  }

  await page.getByRole('link', { name: 'All news' }).click()
  await expect(page).toHaveTitle('News · Chess')
  const sources = page.getByRole('group', { name: 'Source' })
  await expect(sources.getByRole('button', { name: 'FIDE' })).toBeVisible()
  await expect(async () => {
    await sources.getByRole('button', { name: 'FIDE' }).click()
    await expect(page).toHaveURL(/source=fide/, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
})
