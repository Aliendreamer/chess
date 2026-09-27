import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { loadPingLive, sendPing } from './pings'
import type { PingState } from '../pings'

function fetchWith(status: number, body: string, contentType = 'application/json'): typeof fetch {
  return () =>
    Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } }))
}

const pingState: PingState = {
  pingId: 'p1',
  count: 2,
  lastText: 'hi',
  lastAt: '2026-09-22T10:00:00+00:00',
  lastSeq: 2,
}

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
