import { describe, expect, it } from 'vitest'
import { createStudies, deleteStudy, downloadStudyPgn, loadStudy, saveStudy } from './studies'

const ID = '7c9e6679742540de944be07fc1f90ae7'

type Call = { url: string; method: string; body: string | null }

function fakeFetch(status: number, body: unknown, calls: Array<Call> = []): typeof fetch {
  return (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: (init?.body as string | undefined) ?? null,
    })
    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(typeof body === 'string' ? body : JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
    )
  }
}

describe('studies over the API', () => {
  it('imports studies as one request', async () => {
    const calls: Array<Call> = []
    const outcome = await createStudies(fakeFetch(201, { created: [], refused: [] }, calls), [
      { title: 'Ruy', tree: [{ uci: 'e2e4', children: [] }] },
    ])

    expect(outcome.ok).toBe(true)
    expect(calls).toEqual([
      {
        url: '/api/studies',
        method: 'POST',
        body: '{"studies":[{"title":"Ruy","tree":[{"uci":"e2e4","children":[]}]}]}',
      },
    ])
  })

  it('reads a study, and one that is not mine is none', async () => {
    expect(await loadStudy(fakeFetch(404, {}), ID)).toBeNull()
    expect(await loadStudy(fakeFetch(200, { id: ID, title: 'Ruy' }), ID)).toMatchObject({
      title: 'Ruy',
    })
  })

  it('saves with PUT over the version, and a conflict is shown', async () => {
    const calls: Array<Call> = []
    const outcome = await saveStudy(
      fakeFetch(
        409,
        {
          status: 409,
          errors: [{ reason: 'The study was saved elsewhere since you opened it; reload it.' }],
        },
        calls,
      ),
      { id: ID, title: 'Ruy', tree: [], version: 3 },
    )

    expect(calls[0]).toEqual({
      url: `/api/studies/${ID}`,
      method: 'PUT',
      body: '{"title":"Ruy","tree":[],"version":3}',
    })
    expect(outcome).toEqual({
      ok: false,
      status: 409,
      error: 'The study was saved elsewhere since you opened it; reload it.',
    })
  })

  it('deletes with a 204 and no body', async () => {
    expect(await deleteStudy(fakeFetch(204, null), ID)).toEqual({ ok: true, view: null })
  })

  it('downloads the pgn as a file, and refuses a bad id', async () => {
    const request = new Request('http://app.chess.localhost/pgn/study/x')
    const env = { API_URL: 'http://api' } as NodeJS.ProcessEnv

    const file = await downloadStudyPgn(
      request,
      ID,
      fakeFetch(200, '[Event "Ruy"]\n\n1. e4 *\n'),
      env,
    )
    expect(file.headers.get('content-disposition')).toBe(`attachment; filename="study-${ID}.pgn"`)
    expect(await file.text()).toContain('1. e4 *')
    expect((await downloadStudyPgn(request, 'nope', fakeFetch(200, ''), env)).status).toBe(400)
  })
})
