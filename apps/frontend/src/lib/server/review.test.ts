import { describe, expect, it } from 'vitest'
import { loadReview, startReview } from './review'

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

  it('starts a review; a refusal is an outcome', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
    expect(await startReview(fakeFetch(200, { status: 'running' }, calls), ID)).toEqual({
      ok: true,
      view: { status: 'running' },
    })
    expect(calls.map((c) => [c.url, c.init?.method])).toEqual([[`/api/games/${ID}/review`, 'POST']])
    const refused = await startReview(
      fakeFetch(409, { errors: { generalErrors: ['still played'] } }),
      ID,
    )
    expect(refused.ok).toBe(false)
  })
})
