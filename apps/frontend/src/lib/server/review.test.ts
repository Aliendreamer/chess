import { describe, expect, it } from 'vitest'
import {
  loadMyPractice,
  loadPracticeNext,
  loadReview,
  practiseGame,
  recordPractice,
  startReview,
} from './review'

function fakeFetch(
  status: number,
  body: unknown,
  calls: Array<{ url: string; init?: RequestInit | undefined }> = [],
): typeof fetch {
  return (input, init) => {
    calls.push({ url: String(input), init })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

const ID = '0192f0c1-1111-7aaa-8bbb-123456789abc'

describe('review reads and commands', () => {
  it('reads a review; an unknown game is null', async () => {
    const calls: Array<{ url: string }> = []
    await loadReview(fakeFetch(200, { status: 'none' }, calls), ID)
    expect(calls[0]?.url).toBe(`/api/games/${ID}/review`)
    expect(await loadReview(fakeFetch(404, {}), ID)).toBeNull()
  })

  it('starts a review and adds the mistakes; a refusal is an outcome', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
    expect(await startReview(fakeFetch(200, { status: 'running' }, calls), ID)).toEqual({
      ok: true,
      view: { status: 'running' },
    })
    expect(await practiseGame(fakeFetch(200, { added: 2 }, calls), ID)).toEqual({
      ok: true,
      view: { added: 2 },
    })
    expect(calls.map((c) => [c.url, c.init?.method])).toEqual([
      [`/api/games/${ID}/review`, 'POST'],
      [`/api/games/${ID}/review/practice`, 'POST'],
    ])
    const refused = await startReview(
      fakeFetch(409, { errors: { generalErrors: ['still played'] } }),
      ID,
    )
    expect(refused.ok).toBe(false)
  })

  it('reads and answers practice', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
    await loadPracticeNext(fakeFetch(200, { item: null, nextDueAt: null }, calls))
    await recordPractice(fakeFetch(200, { box: 1 }, calls), { gameId: ID, ply: 3, correct: true })
    await loadMyPractice(fakeFetch(200, { positions: 0, learned: 0, due: 0 }, calls))
    expect(calls.map((c) => c.url)).toEqual([
      '/api/practice/next',
      '/api/practice/results',
      '/api/me/practice',
    ])
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ gameId: ID, ply: 3, correct: true })
  })
})
