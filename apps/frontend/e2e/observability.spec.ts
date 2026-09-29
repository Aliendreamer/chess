import { expect, test } from '@playwright/test'
import { USER, move, signedIn } from './support'

/**
 * Observability (the observability change): a move made in the browser is one trace — the browser's call to the server
 * function, the BFF handling it and calling the API, and the backend's game actor. Tempo is asked through Grafana's
 * datasource proxy (the stores publish no ports).
 */
const GRAFANA = process.env.E2E_GRAFANA_URL ?? 'http://grafana.chess.localhost'
const ADMIN = `Basic ${Buffer.from('admin:Admin123!').toString('base64')}`

interface TempoSpan {
  name: string
}
interface TempoTrace {
  trace: {
    resourceSpans: Array<{
      resource: { attributes: Array<{ key: string; value: { stringValue?: string } }> }
      scopeSpans: Array<{ spans: Array<TempoSpan> }>
    }>
  }
}

async function tempo<T>(path: string): Promise<T> {
  const res = await fetch(`${GRAFANA}/api/datasources/proxy/uid/tempo${path}`, {
    headers: { authorization: ADMIN },
  })
  expect(res.ok).toBe(true)
  return (await res.json()) as T
}

/** service → span names of one trace. */
async function spansOf(traceId: string): Promise<Map<string, Set<string>>> {
  const { trace } = await tempo<TempoTrace>(`/api/v2/traces/${traceId}`)
  const byService = new Map<string, Set<string>>()
  for (const rs of trace.resourceSpans) {
    const service =
      rs.resource.attributes.find((a) => a.key === 'service.name')?.value.stringValue ?? '?'
    const names = byService.get(service) ?? new Set<string>()
    for (const ss of rs.scopeSpans) for (const s of ss.spans) names.add(s.name)
    byService.set(service, names)
  }
  return byService
}

test('a move in the browser is one trace through the BFF to the game actor', async ({
  browser,
}) => {
  test.setTimeout(150_000)
  const page = await signedIn(browser, USER)

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
  const gameId = new URL(page.url()).pathname.split('/').at(-1)!.replaceAll('-', '')

  await move(page, 'e2', 'e4')
  await expect(page.getByTestId('move-list')).toHaveText(/^1\.e4\S+$/, { timeout: 45_000 })
  // The page's spans leave every second, and when the page is hidden: close it to send the rest now.
  await page.close()

  const query = encodeURIComponent(
    `{ span.game.id = "${gameId}" } && { resource.service.name = "chess-frontend-web" }`,
  )
  const now = Math.floor(Date.now() / 1000)
  let spans = new Map<string, Set<string>>()
  await expect(async () => {
    const found = await tempo<{ traces?: Array<{ traceID: string }> }>(
      `/api/search?q=${query}&start=${now - 900}&end=${now + 60}&limit=5`,
    )
    const traceId = found.traces?.[0]?.traceID
    expect(traceId).toBeDefined()
    spans = await spansOf(traceId!)
    expect(spans.get('chess-backend')?.has('game MakeMove')).toBe(true)
  }).toPass({ timeout: 90_000, intervals: [2_000] })

  expect(spans.get('chess-frontend-web')?.has('serverFn postGameCommand')).toBe(true)
  expect(spans.get('chess-frontend')?.has('serverFn postGameCommand')).toBe(true)
  expect(spans.get('chess-frontend')?.has('POST /api/games/{id}/moves')).toBe(true)
  expect(spans.get('chess-backend')?.has('POST /api/games/{id}/moves')).toBe(true)
})
