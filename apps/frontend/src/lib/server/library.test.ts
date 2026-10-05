import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import {
  importLibrary,
  loadBroadcastRuns,
  loadLibrary,
  loadLibraryGame,
  loadOpening,
  loadPosition,
  startBroadcastImport,
} from './library'

type Call = { url: string; method: string }

function fakeFetch(status: number, body: unknown, calls: Array<Call> = []): typeof fetch {
  return (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

const KEY = 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq -'

describe('library reads', () => {
  it('searches with the query it is given', async () => {
    const calls: Array<Call> = []
    await loadLibrary(
      fakeFetch(200, { items: [], nextCursor: null, limit: 20 }, calls),
      'limit=20&eco=C30',
    )
    expect(calls[0]?.url).toBe('/api/library/games?limit=20&eco=C30')
  })

  it('a missing game or an unnamed position is null; a lost session goes to login', async () => {
    expect(await loadLibraryGame(fakeFetch(404, {}), 'g1')).toBeNull()
    expect(await loadOpening(fakeFetch(404, {}), KEY)).toBeNull()
    await expect(loadLibraryGame(fakeFetch(401, {}), 'g1')).rejects.toSatisfy(isRedirect)
  })

  it('escapes the position key in the query', async () => {
    const calls: Array<Call> = []
    await loadPosition(
      fakeFetch(200, { games: 0, whiteWins: 0, draws: 0, blackWins: 0, items: [] }, calls),
      KEY,
    )
    await loadOpening(fakeFetch(200, { eco: 'C30', name: "King's Gambit" }, calls), KEY)
    expect(calls.map((c) => c.url)).toEqual([
      `/api/library/positions?key=${encodeURIComponent(KEY)}`,
      `/api/library/openings?key=${encodeURIComponent(KEY)}`,
    ])
  })

  it('asks for one source when it is not all', async () => {
    const calls: Array<Call> = []
    const empty = { games: 0, whiteWins: 0, draws: 0, blackWins: 0, items: [], moves: [] }
    await loadPosition(fakeFetch(200, empty, calls), KEY, 'broadcasts')
    await loadPosition(fakeFetch(200, empty, calls), KEY, 'all')
    expect(calls.map((c) => c.url)).toEqual([
      `/api/library/positions?key=${encodeURIComponent(KEY)}&source=broadcasts`,
      `/api/library/positions?key=${encodeURIComponent(KEY)}`,
    ])
  })
})

describe('broadcast imports', () => {
  it('lists the runs and starts a month; a busy importer is an outcome', async () => {
    const calls: Array<Call> = []
    expect(await loadBroadcastRuns(fakeFetch(200, [], calls))).toEqual([])
    expect(await startBroadcastImport(fakeFetch(202, { runId: 'r1' }, calls), '2026-08')).toEqual({
      ok: true,
      view: { runId: 'r1' },
    })
    const busy = await startBroadcastImport(
      fakeFetch(409, { errors: { generalErrors: ['A month is being imported.'] } }),
      '2026-07',
    )
    expect(busy.ok).toBe(false)
    expect(calls).toEqual([
      { url: '/api/admin/library/broadcasts', method: 'GET' },
      { url: '/api/admin/library/broadcasts', method: 'POST' },
    ])
  })
})

describe('importLibrary', () => {
  it('posts a batch; a refusal is an outcome', async () => {
    const calls: Array<Call> = []
    const batch = {
      source: 'S',
      licence: 'L',
      sourceRef: null,
      worldChampionship: false,
      games: [],
    }
    const answer = { imported: 0, duplicates: 0, refused: 0, items: [] }
    expect(await importLibrary(fakeFetch(200, answer, calls), batch)).toEqual({
      ok: true,
      view: answer,
    })
    expect(calls[0]).toEqual({ url: '/api/admin/library/import', method: 'POST' })
    expect((await importLibrary(fakeFetch(403, {}), batch)).ok).toBe(false)
  })
})
