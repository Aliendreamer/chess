import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { problemMessage } from './upstream'
import {
  downloadPgn,
  loadEngineLevels,
  loadGameLive,
  loadGameMoves,
  loadGameSummary,
  sendGameCommand,
  startEngineGame,
} from './games'

const ID = '0199f1c2a3b47c5d8e9f0a1b2c3d4e5f'

type Call = { url: string; method: string; body: string | null }

function fakeFetch(status: number, body: unknown, calls: Array<Call> = []): typeof fetch {
  return (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: (init?.body as string | undefined) ?? null,
    })
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
}

const problem = (reason: string) => ({
  status: 409,
  title: 'Conflict',
  errors: [{ name: 'generalErrors', reason }],
})

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

describe('game reads', () => {
  it('reads the live view, summary and moves from their paths', async () => {
    const calls: Array<Call> = []
    await loadGameLive(fakeFetch(200, { seq: 1 }, calls), ID)
    await loadGameSummary(fakeFetch(200, { white: 'ann' }, calls), ID)
    await loadGameMoves(fakeFetch(200, [], calls), ID)
    expect(calls.map((c) => c.url)).toEqual([
      `/api/games/${ID}/live`,
      `/api/games/${ID}`,
      `/api/games/${ID}/moves`,
    ])
  })

  it('a game the replica does not have yet reads as no summary and no moves, not an error', async () => {
    expect(await loadGameSummary(fakeFetch(404, ''), ID)).toBeNull()
    expect(await loadGameMoves(fakeFetch(404, ''), ID)).toEqual([])
  })

  it('401 redirects to login; other failures throw', async () => {
    expect(isRedirect(await rejection(loadGameLive(fakeFetch(401, ''), ID)))).toBe(true)
    expect(isRedirect(await rejection(loadGameMoves(fakeFetch(500, ''), ID)))).toBe(false)
  })
})

describe('sendGameCommand', () => {
  it('posts a move with its body and returns the view', async () => {
    const calls: Array<Call> = []
    const outcome = await sendGameCommand(fakeFetch(200, { seq: 4 }, calls), ID, {
      kind: 'move',
      uci: 'e2e4',
    })
    expect(outcome).toEqual({ ok: true, view: { seq: 4 } })
    expect(calls).toEqual([
      { url: `/api/games/${ID}/moves`, method: 'POST', body: '{"uci":"e2e4"}' },
    ])
  })

  it.each([
    ['resign', `/api/games/${ID}/resign`],
    ['draw-offer', `/api/games/${ID}/draw/offer`],
    ['draw-accept', `/api/games/${ID}/draw/accept`],
    ['draw-decline', `/api/games/${ID}/draw/decline`],
    ['abort', `/api/games/${ID}/abort`],
  ] as const)('%s posts to %s without a body', async (kind, url) => {
    const calls: Array<Call> = []
    await sendGameCommand(fakeFetch(200, { seq: 1 }, calls), ID, { kind })
    expect(calls).toEqual([{ url, method: 'POST', body: null }])
  })

  it.each([
    ['win', '{"outcome":"win"}'],
    ['draw', '{"outcome":"draw"}'],
  ] as const)('a %s claim posts its outcome to …/claim', async (outcome, body) => {
    const calls: Array<Call> = []
    await sendGameCommand(fakeFetch(200, { seq: 9 }, calls), ID, { kind: 'claim', outcome })
    expect(calls).toEqual([{ url: `/api/games/${ID}/claim`, method: 'POST', body }])
  })

  it('a refusal is an outcome carrying the server reason, not an exception', async () => {
    expect(
      await sendGameCommand(fakeFetch(409, problem('Not your turn.')), ID, {
        kind: 'move',
        uci: 'e7e5',
      }),
    ).toEqual({
      ok: false,
      status: 409,
      error: 'Not your turn.',
    })
    expect(
      await sendGameCommand(fakeFetch(422, problem('Illegal move.')), ID, {
        kind: 'move',
        uci: 'e2e5',
      }),
    ).toEqual({
      ok: false,
      status: 422,
      error: 'Illegal move.',
    })
  })

  it('401 redirects and a 5xx throws', async () => {
    expect(
      isRedirect(await rejection(sendGameCommand(fakeFetch(401, ''), ID, { kind: 'resign' }))),
    ).toBe(true)
    expect(
      isRedirect(await rejection(sendGameCommand(fakeFetch(503, ''), ID, { kind: 'resign' }))),
    ).toBe(false)
  })
})

describe('problemMessage', () => {
  it('prefers the first error reason, then detail, then title', () => {
    expect(problemMessage(problem('Not your turn.'), 409)).toBe('Not your turn.')
    expect(problemMessage({ detail: 'Gone.', title: 'Not Found' }, 404)).toBe('Gone.')
    expect(problemMessage({ title: 'Forbidden' }, 403)).toBe('Forbidden')
    expect(problemMessage('junk', 400)).toBe('Request failed (400).')
  })
})

const PGN_ID = '0199f1c2-a3b4-7c5d-8e9f-0a1b2c3d4e5f'
const env = { API_URL: 'http://backend:8080' } as NodeJS.ProcessEnv
const PGN = '[Event "Casual game"]\n[White "ann"]\n\n1. e4 e5 0-1\n'

function request(cookie?: string): Request {
  return new Request(
    `http://app.chess.localhost/pgn/${PGN_ID}`,
    cookie ? { headers: { cookie } } : {},
  )
}

describe('downloadPgn', () => {
  it('fetches the PGN server-side with the session and hands it over as a file', async () => {
    const seen: Array<{ url: string; cookie: string | null }> = []
    const fetchImpl: typeof fetch = (input, init) => {
      seen.push({ url: String(input), cookie: new Headers(init?.headers).get('cookie') })
      return Promise.resolve(new Response(PGN, { status: 200 }))
    }

    const res = await downloadPgn(request('mp_sid=abc; other=x'), PGN_ID, fetchImpl, env)

    expect(seen).toEqual([
      { url: `http://backend:8080/api/games/${PGN_ID}/pgn`, cookie: 'mp_sid=abc' },
    ])
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/x-chess-pgn; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="chess-0199f1c2a3b47c5d8e9f0a1b2c3d4e5f.pgn"',
    )
    expect(await res.text()).toBe(PGN)
  })

  it('sends an anonymous visitor to login', async () => {
    const res = await downloadPgn(
      request(),
      PGN_ID,
      () => Promise.resolve(new Response('', { status: 401 })),
      env,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      `/api/auth/login?returnTo=${encodeURIComponent(`/games/${PGN_ID}`)}`,
    )
  })

  it('passes a missing or unfinished game on as its status', async () => {
    const res = await downloadPgn(
      request('mp_sid=abc'),
      PGN_ID,
      () => Promise.resolve(new Response('', { status: 404 })),
      env,
    )
    expect(res.status).toBe(404)
  })

  it('refuses something that is not a game id without calling the API', async () => {
    let called = false
    const res = await downloadPgn(
      request('mp_sid=abc'),
      '../admin',
      () => {
        called = true
        return Promise.resolve(new Response(''))
      },
      env,
    )
    expect(called).toBe(false)
    expect(res.status).toBe(400)
  })
})

describe('games against the computer', () => {
  it('starts one with the level and colour in the body', async () => {
    const calls: Array<Call> = []
    const outcome = await startEngineGame(fakeFetch(201, { gameId: ID, seq: 1 }, calls), {
      level: '1600',
      color: 'white',
    })

    expect(outcome.ok).toBe(true)
    expect(calls).toEqual([
      { url: '/api/engine-games', method: 'POST', body: '{"level":"1600","color":"white"}' },
    ])
  })

  it('shows a refusal instead of throwing', async () => {
    const outcome = await startEngineGame(
      fakeFetch(400, problem('Level must be 1320, 1600, 2000, 2400 or max.')),
      {
        level: '1800',
        color: 'white',
      },
    )

    expect(outcome).toEqual({
      ok: false,
      status: 400,
      error: 'Level must be 1320, 1600, 2000, 2400 or max.',
    })
  })

  it('lists the levels', async () => {
    const levels = [{ level: '1320', name: 'Stockfish 1320' }]

    expect(await loadEngineLevels(fakeFetch(200, { levels }))).toEqual(levels)
  })
})
