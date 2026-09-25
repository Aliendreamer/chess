import { describe, expect, it, vi } from 'vitest'
import { HUB_UNAVAILABLE, createHubMultiplexer } from './hub-multiplexer'
import type { HubPort, LocalSocket } from './hub-multiplexer'
import type { LiveFrame } from '../live'

const frame = (topic: string, seq: number): LiveFrame => ({ topic, seq, payload: { seq } })

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

function socket() {
  const sent: Array<unknown> = []
  const s: LocalSocket & { sent: Array<unknown>; closed?: [number, string] } = {
    sent,
    send: (data) => sent.push(JSON.parse(data)),
    close: (code, reason) => (s.closed = [code, reason]),
  }
  return s
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
    expect(a.closed).toEqual([HUB_UNAVAILABLE, 'hub closed'])
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
    expect(a.closed).toEqual([HUB_UNAVAILABLE, 'hub unavailable'])
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
