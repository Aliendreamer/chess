import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import {
  loadGameLive,
  loadGameMoves,
  loadGameSummary,
  problemMessage,
  sendGameCommand,
} from './game-loaders'

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

  it('a summary the replica does not have yet is null, not an error', async () => {
    expect(await loadGameSummary(fakeFetch(404, ''), ID)).toBeNull()
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
