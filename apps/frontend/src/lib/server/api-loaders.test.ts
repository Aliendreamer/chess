import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { ADMIN_ROLE, hasRole, loadMe, loadPingLive, sendPing } from './api-loaders'
import type { Me } from './api-loaders'
import type { PingState } from '../pings'

function fetchWith(status: number, body: string, contentType = 'application/json'): typeof fetch {
  return () =>
    Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } }))
}

const me: Me = { id: 1, subject: 'sub-1', email: 'a@b.c', roles: ['User'], username: 'ann' }
const pingState: PingState = {
  pingId: 'p1',
  count: 2,
  lastText: 'hi',
  lastAt: '2026-09-22T10:00:00+00:00',
  lastSeq: 2,
}

describe('loadMe', () => {
  it('returns the identity on 200', async () => {
    await expect(loadMe(fetchWith(200, JSON.stringify(me)))).resolves.toEqual(me)
  })
  it('returns null on 401 so the guard can redirect', async () => {
    await expect(loadMe(fetchWith(401, ''))).resolves.toBeNull()
  })
  it('throws on other failures', async () => {
    await expect(loadMe(fetchWith(500, 'boom'))).rejects.toThrow(/500/)
  })
})

describe('hasRole', () => {
  it('names the backend realm role exactly', () => {
    expect(ADMIN_ROLE).toBe('Admin')
  })

  it('checks roles and tolerates null', () => {
    expect(hasRole({ ...me, roles: [ADMIN_ROLE] }, ADMIN_ROLE)).toBe(true)
    expect(hasRole(me, ADMIN_ROLE)).toBe(false)
    expect(hasRole(null, ADMIN_ROLE)).toBe(false)
    expect(hasRole(undefined, 'User')).toBe(false)
  })
})

describe('loadPingLive', () => {
  it('returns the actor state on 200', async () => {
    await expect(loadPingLive(fetchWith(200, JSON.stringify(pingState)), 'p1')).resolves.toEqual(
      pingState,
    )
  })
  it('encodes the id into the path', async () => {
    const calls: Array<string> = []
    const record: typeof fetch = (input) => {
      calls.push(String(input))
      return Promise.resolve(new Response(JSON.stringify(pingState), { status: 200 }))
    }
    await loadPingLive(record, 'a b')
    expect(calls[0]).toBe('/api/pings/a%20b/live')
  })
  it('redirects to login on 401', async () => {
    const err = await loadPingLive(fetchWith(401, ''), 'p1').catch((e: unknown) => e)
    expect(isRedirect(err)).toBe(true)
  })
  it('throws on other failures', async () => {
    await expect(loadPingLive(fetchWith(504, ''), 'p1')).rejects.toThrow(/504/)
  })
})

describe('sendPing', () => {
  it('posts the text as json and returns the new state', async () => {
    let init: RequestInit | undefined
    const record: typeof fetch = (_input, i) => {
      init = i
      return Promise.resolve(new Response(JSON.stringify(pingState), { status: 200 }))
    }
    await expect(sendPing(record, 'p1', 'hi')).resolves.toEqual(pingState)
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ text: 'hi' }))
  })
  it('redirects to login on 401', async () => {
    const err = await sendPing(fetchWith(401, ''), 'p1', 'hi').catch((e: unknown) => e)
    expect(isRedirect(err)).toBe(true)
  })
  it('throws on a rejected ping', async () => {
    await expect(sendPing(fetchWith(400, ''), 'p1', '')).rejects.toThrow(/400/)
  })
})
