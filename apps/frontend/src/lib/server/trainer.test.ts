import { describe, expect, it } from 'vitest'
import { loadFamilies, loadFamily, loadMyTraining, loadNextLine, recordRun } from './trainer'

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

describe('trainer reads', () => {
  it('lists families for a colour, searched when asked', async () => {
    const calls: Array<{ url: string }> = []
    await loadFamilies(fakeFetch(200, [], calls), 'black')
    await loadFamilies(fakeFetch(200, [], calls), 'white', 'najdorf')
    expect(calls.map((c) => c.url)).toEqual([
      '/api/trainer/families?color=black',
      '/api/trainer/families?color=white&q=najdorf',
    ])
  })

  it('reads a family and its next line; an unknown family is null', async () => {
    const calls: Array<{ url: string }> = []
    expect(await loadFamily(fakeFetch(200, [], calls), 'Ruy Lopez', 'white')).toEqual([])
    expect(
      await loadNextLine(
        fakeFetch(200, { line: null, nextDueAt: null }, calls),
        'Ruy Lopez',
        'white',
      ),
    ).toEqual({
      line: null,
      nextDueAt: null,
    })
    expect(calls.map((c) => c.url)).toEqual([
      '/api/trainer/family?name=Ruy+Lopez&color=white',
      '/api/trainer/next?name=Ruy+Lopez&color=white',
    ])
    expect(await loadFamily(fakeFetch(404, {}), 'Nope', 'white')).toBeNull()
    expect(await loadNextLine(fakeFetch(404, {}), 'Nope', 'white')).toBeNull()
  })

  it('records a run and reads the member’s training', async () => {
    const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
    const answer = { lineKey: 'k', box: 1, dueAt: '2026-10-04T00:00:00Z', learned: false }
    expect(
      await recordRun(fakeFetch(200, answer, calls), { lineKey: 'k', color: 'white', mistakes: 0 }),
    ).toEqual({
      ok: true,
      view: answer,
    })
    expect(calls[0]?.url).toBe('/api/trainer/results')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      lineKey: 'k',
      color: 'white',
      mistakes: 0,
    })
    await loadMyTraining(fakeFetch(200, [], calls))
    expect(calls[1]?.url).toBe('/api/me/trainer')
  })
})
