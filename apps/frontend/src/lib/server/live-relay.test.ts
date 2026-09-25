import { describe, expect, it, vi } from 'vitest'
import { BAD_TOPIC, UNAUTHENTICATED, openRelay, parseLiveUrl } from './live-relay'
import type { RelayDeps } from './live-relay'
import type { HubMultiplexer, LocalSocket } from './hub-multiplexer'

describe('parseLiveUrl', () => {
  it('accepts a known kind with a valid id, absolute or relative, with a query', () => {
    const want = { kind: 'ping', id: 'abc-1', topic: 'ping:abc-1' }
    expect(parseLiveUrl('http://app.chess.localhost/api/ws/live/ping/abc-1')).toEqual(want)
    expect(parseLiveUrl('/api/ws/live/ping/abc-1')).toEqual(want)
    expect(parseLiveUrl('/api/ws/live/ping/abc-1?x=1')).toEqual(want)
  })

  it.each([
    '/api/ws/live/nope/abc-1', // unknown kind
    '/api/ws/live/ping/Abc', // id rule (backend PingIds.Pattern)
    '/api/ws/live/ping/', // no id
    '/api/ws/live/ping', // no id segment
    '/api/ws/live/ping/a/b', // extra segment
    '/api/ws/pings/abc-1', // the old path is gone
    null,
    '',
  ])('rejects %s', (url) => {
    expect(parseLiveUrl(url)).toBeNull()
  })
})

function socket() {
  const s: LocalSocket & { closed?: [number, string] } = {
    send: vi.fn(),
    close: (code, reason) => (s.closed = [code, reason]),
  }
  return s
}

function harness(session: Array<boolean | Error>) {
  const mux: HubMultiplexer = {
    subscribe: vi.fn(() => Promise.resolve()),
    unsubscribe: vi.fn(() => Promise.resolve()),
    topicCount: () => 0,
  }
  let tick: (() => Promise<void>) | null = null
  const deps: RelayDeps = {
    mux,
    revalidateMs: 1000,
    isSessionValid: vi.fn(() => {
      const next = session.length > 1 ? session.shift()! : session[0]!
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next)
    }),
    setInterval: vi.fn((fn: () => Promise<void>) => {
      tick = fn
      return 7 as unknown as ReturnType<typeof setInterval>
    }),
    clearInterval: vi.fn(),
  }
  return { deps, mux, tick: () => tick!() }
}

const target = { kind: 'ping', id: 'p1', topic: 'ping:p1' }

describe('openRelay', () => {
  it('closes 4401 without subscribing when there is no session cookie', async () => {
    const { deps, mux } = harness([true])
    const s = socket()

    await openRelay(target, null, s, deps).ready

    expect(s.closed).toEqual([UNAUTHENTICATED, 'unauthenticated'])
    expect(deps.isSessionValid).not.toHaveBeenCalled()
    expect(mux.subscribe).not.toHaveBeenCalled()
  })

  it('closes 4401 without subscribing when the session is not valid', async () => {
    const { deps, mux } = harness([false])
    const s = socket()

    await openRelay(target, 'mp_sid=x', s, deps).ready

    expect(s.closed).toEqual([UNAUTHENTICATED, 'unauthenticated'])
    expect(mux.subscribe).not.toHaveBeenCalled()
  })

  it('subscribes a valid session and re-checks it on the interval', async () => {
    const { deps, mux } = harness([true])
    const s = socket()

    await openRelay(target, 'mp_sid=x', s, deps).ready

    expect(mux.subscribe).toHaveBeenCalledWith('ping:p1', s)
    expect(deps.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000)
    expect(s.closed).toBeUndefined()
  })

  it('closes 4401 and unsubscribes when a re-check finds the session gone', async () => {
    const { deps, mux, tick } = harness([true, false])
    const s = socket()
    await openRelay(target, 'mp_sid=x', s, deps).ready

    await tick()

    expect(mux.unsubscribe).toHaveBeenCalledWith('ping:p1', s)
    expect(deps.clearInterval).toHaveBeenCalled()
    expect(s.closed).toEqual([UNAUTHENTICATED, 'session ended'])
  })

  it('keeps the feed when a re-check cannot reach the backend', async () => {
    const { deps, mux, tick } = harness([true, new Error('ECONNREFUSED')])
    const s = socket()
    await openRelay(target, 'mp_sid=x', s, deps).ready

    await tick()

    expect(mux.unsubscribe).not.toHaveBeenCalled()
    expect(s.closed).toBeUndefined()
  })

  it('closing unsubscribes and stops the timer', async () => {
    const { deps, mux } = harness([true])
    const s = socket()
    const relay = openRelay(target, 'mp_sid=x', s, deps)
    await relay.ready

    await relay.close()

    expect(mux.unsubscribe).toHaveBeenCalledWith('ping:p1', s)
    expect(deps.clearInterval).toHaveBeenCalled()
  })

  it('does not subscribe a socket that closed while its session was being checked', async () => {
    let release: (valid: boolean) => void = () => {}
    const { deps, mux } = harness([true])
    deps.isSessionValid = () => new Promise((resolve) => (release = resolve))
    const s = socket()

    const relay = openRelay(target, 'mp_sid=x', s, deps)
    // The host's close handler runs before the session check returns.
    await relay.close()
    release(true)
    await relay.ready

    expect(mux.subscribe).not.toHaveBeenCalled()
  })

  it('exposes the close codes the browser sees', () => {
    expect([BAD_TOPIC, UNAUTHENTICATED]).toEqual([4400, 4401])
  })
})
