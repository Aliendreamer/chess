import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { loadDeadLetters, replayDeadLetters } from './admin'

type Call = { url: string; method: string }

function fakeFetch(status: number, body: unknown, calls: Array<Call> = []): typeof fetch {
  return (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

describe('loadDeadLetters', () => {
  it('pages and filters by projection', async () => {
    const calls: Array<Call> = []
    await loadDeadLetters(fakeFetch(200, { items: [], nextCursor: null, limit: 50 }, calls), {
      limit: 50,
      cursor: 'c',
      groupId: 'chess.rm-games',
    })
    expect(calls[0]?.url).toBe(
      '/api/admin/projections/dead-letters?limit=50&cursor=c&groupId=chess.rm-games',
    )
  })

  it('sends a lost session to login', async () => {
    await expect(loadDeadLetters(fakeFetch(401, {}), { limit: 50 })).rejects.toSatisfy(isRedirect)
  })
})

describe('replayDeadLetters', () => {
  const body = {
    groupId: 'chess.rm-games',
    aggregateId: 'g1',
    status: 'replayed',
    applied: 2,
    error: null,
  }

  it('posts the replay and reports what was applied', async () => {
    const calls: Array<Call> = []
    expect(await replayDeadLetters(fakeFetch(200, body, calls), 'chess.rm-games', 'g1')).toEqual({
      ok: true,
      applied: 2,
    })
    expect(calls[0]).toEqual({
      url: '/api/admin/projections/chess.rm-games/dead-letters/g1/replay',
      method: 'POST',
    })
  })

  it('reports the new error when the record fails again (409)', async () => {
    expect(
      await replayDeadLetters(
        fakeFetch(409, { ...body, status: 'failed', applied: 0, error: 'still broken' }),
        'chess.rm-games',
        'g1',
      ),
    ).toEqual({ ok: false, error: 'still broken' })
  })

  it('reports a refusal (403) as an error', async () => {
    expect(await replayDeadLetters(fakeFetch(403, {}), 'chess.rm-games', 'g1')).toEqual({
      ok: false,
      error: 'Replay refused (403).',
    })
  })
})
