import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  joinQueue,
  leaveQueue,
  loadInvite,
  loadMyGames,
} from './play-loaders'

const INVITE = '7c9e6679742540de944be07fc1f90ae7'

type Call = { url: string; method: string; body: string | null }

function fakeFetch(status: number, body: unknown, calls: Array<Call> = []): typeof fetch {
  return (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: (init?.body as string | undefined) ?? null,
    })
    return Promise.resolve(
      new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

describe('queue', () => {
  it('a join is a plain POST; a heartbeat says so', async () => {
    const calls: Array<Call> = []
    await joinQueue(fakeFetch(200, { status: 'waiting' }, calls), '5+3', false)
    await joinQueue(fakeFetch(200, { status: 'waiting' }, calls), '5+3', true)
    expect(calls).toEqual([
      { url: '/api/matchmaking/5+3', method: 'POST', body: null },
      { url: '/api/matchmaking/5+3?heartbeat=true', method: 'POST', body: null },
    ])
  })

  it('a refused time control is an outcome', async () => {
    const refused = { errors: [{ reason: 'Not a preset.' }] }
    expect(await joinQueue(fakeFetch(400, refused), '4+2', false)).toEqual({
      ok: false,
      status: 400,
      error: 'Not a preset.',
    })
  })

  it('leaving is a DELETE; 401 still redirects', async () => {
    const calls: Array<Call> = []
    await leaveQueue(fakeFetch(204, null, calls), '5+3')
    expect(calls).toEqual([{ url: '/api/matchmaking/5+3', method: 'DELETE', body: null }])
    expect(isRedirect(await rejection(leaveQueue(fakeFetch(401, ''), '5+3')))).toBe(true)
  })
})

describe('invites', () => {
  it('creates with the time control and colour', async () => {
    const calls: Array<Call> = []
    await createInvite(fakeFetch(201, { inviteId: INVITE }, calls), {
      timeControl: '10+5',
      color: 'black',
    })
    expect(calls).toEqual([
      { url: '/api/invites', method: 'POST', body: '{"timeControl":"10+5","color":"black"}' },
    ])
  })

  it('accept and cancel post to their paths', async () => {
    const calls: Array<Call> = []
    await acceptInvite(fakeFetch(200, {}, calls), INVITE)
    await cancelInvite(fakeFetch(200, {}, calls), INVITE)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST /api/invites/${INVITE}/accept`,
      `POST /api/invites/${INVITE}/cancel`,
    ])
  })

  it('an unknown or malformed invite reads as null', async () => {
    expect(await loadInvite(fakeFetch(404, ''), INVITE)).toBeNull()
    expect(await loadInvite(fakeFetch(400, ''), 'nope')).toBeNull()
  })
})

describe('loadMyGames', () => {
  it('asks for a page of the given size', async () => {
    const calls: Array<Call> = []
    await loadMyGames(fakeFetch(200, { items: [], nextCursor: null, limit: 8 }, calls), {
      limit: 8,
    })
    await loadMyGames(fakeFetch(200, { items: [], nextCursor: null, limit: 20 }, calls), {
      limit: 20,
      cursor: 'abc',
    })
    expect(calls.map((c) => c.url)).toEqual([
      '/api/me/games?limit=8',
      '/api/me/games?limit=20&cursor=abc',
    ])
  })
})
