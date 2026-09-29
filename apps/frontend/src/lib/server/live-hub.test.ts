import { describe, expect, it, vi } from 'vitest'
import { ServiceTokenError, createHubMultiplexer, createServiceToken } from './live-hub'
import type { HubPort } from './live-hub'
import type { LiveFrame } from '../live'
import { frame, fakeSocket as socket } from '#/testing'

/** A scriptable stand-in for the SignalR connection. */
function fakeHub(opts: { failStart?: boolean } = {}) {
  let onFrame: (f: LiveFrame) => void = () => {}
  let onReconnected: () => void = () => {}
  let onClose: () => void = () => {}
  const seqByTopic = new Map<string, number>()
  const port: HubPort = {
    start: vi.fn(() => (opts.failStart ? Promise.reject(new Error('refused')) : Promise.resolve())),
    invoke: vi.fn((method: string, topic: string) =>
      Promise.resolve(
        method === 'Subscribe' ? frame(topic, seqByTopic.get(topic) ?? 1) : undefined,
      ),
    ) as HubPort['invoke'],
    onFrame: (h) => (onFrame = h),
    onReconnected: (h) => (onReconnected = h),
    onClose: (h) => (onClose = h),
    stop: vi.fn(() => Promise.resolve()),
  }
  return {
    port,
    setSeq: (topic: string, seq: number) => seqByTopic.set(topic, seq),
    push: (f: LiveFrame) => onFrame(f),
    reconnect: () => onReconnected(),
    close: () => onClose(),
  }
}

const invokes = (port: HubPort) => (port.invoke as ReturnType<typeof vi.fn>).mock.calls

describe('HubMultiplexer', () => {
  it('shares one connection; each subscriber gets its own snapshot', async () => {
    const hub = fakeHub()
    const connect = vi.fn(() => hub.port)
    const mux = createHubMultiplexer(connect)
    const a = socket()
    const b = socket()

    await mux.subscribe('ping:p1', a)
    hub.setSeq('ping:p1', 2)
    await mux.subscribe('ping:p1', b)

    expect(connect).toHaveBeenCalledTimes(1)
    expect(hub.port.start).toHaveBeenCalledTimes(1)
    expect(invokes(hub.port)).toEqual([
      ['Subscribe', 'ping:p1'],
      ['Subscribe', 'ping:p1'],
    ])
    expect(a.sent).toEqual([{ kind: 'frame', frame: frame('ping:p1', 1) }])
    expect(b.sent).toEqual([{ kind: 'frame', frame: frame('ping:p1', 2) }])
  })

  it('routes a push only to sockets on its topic', async () => {
    const hub = fakeHub()
    const mux = createHubMultiplexer(() => hub.port)
    const onA = socket()
    const onB = socket()
    await mux.subscribe('ping:a', onA)
    await mux.subscribe('ping:b', onB)

    hub.push(frame('ping:a', 5))

    expect(onA.sent.at(-1)).toEqual({ kind: 'frame', frame: frame('ping:a', 5) })
    expect(onB.sent).toHaveLength(1) // its snapshot only
  })

  it("strips a frame's trace before it reaches a browser", async () => {
    const hub = fakeHub()
    const mux = createHubMultiplexer(() => hub.port)
    const a = socket()
    await mux.subscribe('ping:a', a)

    hub.push({
      ...frame('ping:a', 6),
      trace: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    })

    expect(a.sent.at(-1)).toEqual({ kind: 'frame', frame: frame('ping:a', 6) })
  })

  it('leaves the group after the last local subscriber and keeps the connection', async () => {
    const hub = fakeHub()
    const mux = createHubMultiplexer(() => hub.port)
    const a = socket()
    const b = socket()
    await mux.subscribe('ping:p1', a)
    await mux.subscribe('ping:p1', b)

    await mux.unsubscribe('ping:p1', a)
    expect(invokes(hub.port)).not.toContainEqual(['Unsubscribe', 'ping:p1'])

    await mux.unsubscribe('ping:p1', b)
    expect(invokes(hub.port)).toContainEqual(['Unsubscribe', 'ping:p1'])
    expect(hub.port.stop).not.toHaveBeenCalled()
    expect(mux.topicCount()).toBe(0)
  })

  it('re-subscribes every topic on reconnect and snapshots all of its sockets', async () => {
    const hub = fakeHub()
    const mux = createHubMultiplexer(() => hub.port)
    const a1 = socket()
    const a2 = socket()
    const b = socket()
    await mux.subscribe('ping:a', a1)
    await mux.subscribe('ping:a', a2)
    await mux.subscribe('ping:b', b)
    hub.setSeq('ping:a', 9)
    hub.setSeq('ping:b', 4)

    hub.reconnect()
    await vi.waitFor(() => expect(b.sent).toHaveLength(2))

    expect(a1.sent.at(-1)).toEqual({ kind: 'frame', frame: frame('ping:a', 9) })
    expect(a2.sent.at(-1)).toEqual({ kind: 'frame', frame: frame('ping:a', 9) })
    expect(b.sent.at(-1)).toEqual({ kind: 'frame', frame: frame('ping:b', 4) })
  })

  it('on a final close tells every socket, closes them with 1011, and the next subscribe starts afresh', async () => {
    const first = fakeHub()
    const second = fakeHub()
    const connect = vi.fn().mockReturnValueOnce(first.port).mockReturnValueOnce(second.port)
    const mux = createHubMultiplexer(connect)
    const a = socket()
    await mux.subscribe('ping:a', a)

    first.close()

    expect(a.sent.at(-1)).toEqual({ kind: 'error', message: 'live connection lost' })
    expect(a.closed).toEqual([1011, 'hub closed'])
    expect(mux.topicCount()).toBe(0)

    await mux.subscribe('ping:a', socket())
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('a failed start fails only the subscribing socket and is retried next time', async () => {
    const broken = fakeHub({ failStart: true })
    const healthy = fakeHub()
    const connect = vi.fn().mockReturnValueOnce(broken.port).mockReturnValueOnce(healthy.port)
    const mux = createHubMultiplexer(connect)
    const a = socket()

    await mux.subscribe('ping:a', a)

    expect(a.sent).toEqual([{ kind: 'error', message: 'refused' }])
    expect(a.closed).toEqual([1011, 'hub unavailable'])
    expect(mux.topicCount()).toBe(0)

    const b = socket()
    await mux.subscribe('ping:a', b)
    expect(b.sent).toEqual([{ kind: 'frame', frame: frame('ping:a', 1) }])
  })

  it('does not send a snapshot to a socket that left while Subscribe was in flight', async () => {
    const hub = fakeHub()
    const mux = createHubMultiplexer(() => hub.port)
    const a = socket()

    const pending = mux.subscribe('ping:a', a)
    await mux.unsubscribe('ping:a', a)
    await pending

    expect(a.sent).toEqual([])
    // The backend completed the join after the socket left: nobody is watching, so leave the group again.
    expect(invokes(hub.port).at(-1)).toEqual(['Unsubscribe', 'ping:a'])
  })
})

describe('HubMultiplexer presence (presence-and-abandonment D1–D2)', () => {
  const GAME = 'game:0199f1c2a3b47c5d8e9f0a1b2c3d4e5f'

  function withTimer() {
    const hub = fakeHub()
    let refresh: (() => void) | null = null
    const mux = createHubMultiplexer(() => hub.port, {
      instance: 'bff-1',
      refreshMs: 30_000,
      setInterval: (fn) => {
        refresh = fn
        return 1 as unknown as ReturnType<typeof setInterval>
      },
      clearInterval: () => {},
    })
    const presence = () => invokes(hub.port).filter(([m]) => m === 'Present' || m === 'Absent')
    return { hub, mux, presence, refresh: () => refresh!() }
  }

  it('reports a user present on their first socket and absent after their last', async () => {
    const { mux, presence } = withTimer()
    const tab1 = socket()
    const tab2 = socket()

    await mux.subscribe(GAME, tab1, 7)
    await mux.subscribe(GAME, tab2, 7)
    await mux.unsubscribe(GAME, tab1, 7)
    expect(presence()).toEqual([['Present', GAME, 7, 'bff-1']])

    await mux.unsubscribe(GAME, tab2, 7)
    expect(presence()).toEqual([
      ['Present', GAME, 7, 'bff-1'],
      ['Absent', GAME, 7, 'bff-1'],
    ])
  })

  it('reports nothing for other kinds or an unknown user', async () => {
    const { mux, presence } = withTimer()

    await mux.subscribe('ping:p1', socket(), 7)
    await mux.subscribe('queue:5+3', socket(), 7)
    await mux.subscribe(GAME, socket())

    expect(presence()).toEqual([])
  })

  it('re-sends every held presence on the refresh timer and after a reconnect', async () => {
    const { hub, mux, presence, refresh } = withTimer()
    await mux.subscribe(GAME, socket(), 7)
    await mux.subscribe(GAME, socket(), 8)

    refresh()
    hub.reconnect()

    expect(presence()).toEqual([
      ['Present', GAME, 7, 'bff-1'],
      ['Present', GAME, 8, 'bff-1'],
      ['Present', GAME, 7, 'bff-1'],
      ['Present', GAME, 8, 'bff-1'],
      ['Present', GAME, 7, 'bff-1'],
      ['Present', GAME, 8, 'bff-1'],
    ])
  })

  it('forgets presence on a final close (the backend lease expires it)', async () => {
    const { hub, mux, presence, refresh } = withTimer()
    await mux.subscribe(GAME, socket(), 7)

    hub.close()
    refresh()

    expect(presence()).toEqual([['Present', GAME, 7, 'bff-1']])
  })
})

const T0 = 1_000_000

function tokenResponse(token: string, expiresIn = 300): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function setup(responses: Array<Response>) {
  let now = T0
  const fetchImpl = vi.fn(() => Promise.resolve(responses.shift() ?? tokenResponse('extra')))
  const token = createServiceToken({
    fetch: fetchImpl,
    now: () => now,
    tokenUrl: 'http://keycloak.chess.localhost/realms/chess/protocol/openid-connect/token',
    clientId: 'chess_bff',
    clientSecret: 's3cret',
  })
  return { token, fetchImpl, advance: (ms: number) => (now += ms) }
}

describe('createServiceToken', () => {
  it('fetches by client credentials on first use', async () => {
    const { token, fetchImpl } = setup([tokenResponse('t1')])

    expect(await token()).toBe('t1')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/protocol/openid-connect/token')
    const body = new URLSearchParams(init.body as string)
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'chess_bff',
      client_secret: 's3cret',
    })
  })

  it('reuses the token while it has more than 30 s left', async () => {
    const { token, fetchImpl, advance } = setup([tokenResponse('t1', 300)])
    await token()
    advance(269_000) // 31 s left

    expect(await token()).toBe('t1')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refetches once it is within 30 s of expiry', async () => {
    const { token, fetchImpl, advance } = setup([tokenResponse('t1', 300), tokenResponse('t2')])
    await token()
    advance(271_000) // 29 s left

    expect(await token()).toBe('t2')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('shares one fetch between concurrent callers', async () => {
    const { token, fetchImpl } = setup([tokenResponse('t1')])

    const [a, b, c] = await Promise.all([token(), token(), token()])

    expect([a, b, c]).toEqual(['t1', 't1', 't1'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('surfaces a non-2xx as a ServiceTokenError and retries on the next call', async () => {
    const { token, fetchImpl } = setup([
      new Response('{"error":"unauthorized_client"}', { status: 401 }),
      tokenResponse('t2'),
    ])

    await expect(token()).rejects.toBeInstanceOf(ServiceTokenError)
    expect(await token()).toBe('t2')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
