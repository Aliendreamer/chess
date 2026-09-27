import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { applyFrame, liveStatusText, liveUrl, parseSocketMessage, useLiveTopic } from './live'
import type { LiveFrame } from './live'
import { frame } from '#/testing'

const f = (seq: number) => frame('ping:p1', seq)

describe('parseSocketMessage', () => {
  it('accepts a frame and an error', () => {
    expect(parseSocketMessage(JSON.stringify({ kind: 'frame', frame: f(3) }))).toEqual({
      kind: 'frame',
      frame: f(3),
    })
    expect(parseSocketMessage(JSON.stringify({ kind: 'error', message: 'down' }))).toEqual({
      kind: 'error',
      message: 'down',
    })
  })

  it.each([
    'not json',
    'null',
    '{"kind":"frame"}',
    '{"kind":"frame","frame":{"topic":"ping:p1","seq":"7","payload":{}}}',
    '{"kind":"frame","frame":{"seq":7,"payload":{}}}',
    '{"kind":"frame","frame":{"topic":"ping:p1","seq":7}}',
    '{"kind":"other"}',
  ])('drops junk: %s', (data) => {
    expect(parseSocketMessage(data)).toBeNull()
  })
})

describe('applyFrame', () => {
  it('takes the first frame', () => {
    expect(applyFrame(undefined, f(7))).toEqual(f(7))
  })

  it('moves forward only', () => {
    const f7 = f(7)
    const f8 = f(8)
    expect(applyFrame(f7, f8)).toBe(f8)
    expect(applyFrame(f8, f7)).toBe(f8)
  })

  it('keeps the current frame on a duplicate seq', () => {
    const current = f(8)
    expect(applyFrame(current, f(8))).toBe(current)
  })
})

// The socket behaviour (seq order, junk, errors, close) is covered through PingFeed; these pin what it doesn't.

class FakeSocket {
  static last: FakeSocket | undefined
  static opened = 0
  onopen: (() => void) | null = null
  onclose: ((e: { code: number }) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  close = vi.fn()
  constructor(readonly url: string) {
    FakeSocket.last = this
    FakeSocket.opened += 1
  }
}

type Payload = { n: number }
const isPayload = (v: unknown): v is Payload => typeof v === 'object' && v !== null && 'n' in v
const at = (seq: number): LiveFrame<Payload> => ({ topic: 'game:abc', seq, payload: { n: seq } })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  FakeSocket.opened = 0
})

describe('liveUrl', () => {
  it('builds the same-origin relay path for any kind', () => {
    expect(liveUrl('app.chess.localhost', 'http:', 'queue', '5+3')).toBe(
      'ws://app.chess.localhost/api/ws/live/queue/5+3',
    )
    expect(liveUrl('chess.example', 'https:', 'game', 'abc')).toBe(
      'wss://chess.example/api/ws/live/game/abc',
    )
  })
})

describe('useLiveTopic', () => {
  it('starts from the initial frame, then takes newer frames and reports each once', () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const onFrame = vi.fn()
    const { result } = renderHook(() =>
      useLiveTopic({ kind: 'game', id: 'abc', initial: at(2), isPayload, onFrame }),
    )
    expect(result.current.frame?.seq).toBe(2)

    act(() =>
      FakeSocket.last!.onmessage?.({ data: JSON.stringify({ kind: 'frame', frame: at(3) }) }),
    )
    act(() =>
      FakeSocket.last!.onmessage?.({ data: JSON.stringify({ kind: 'frame', frame: at(3) }) }),
    )

    expect(result.current.frame?.payload).toEqual({ n: 3 })
    expect(onFrame).toHaveBeenCalledOnce()
  })

  it('takes initial as the baseline when subscribing; a later initial does not move it', () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const onFrame = vi.fn()
    const { result, rerender } = renderHook(
      ({ initial }) => useLiveTopic({ kind: 'game', id: 'abc', initial, isPayload, onFrame }),
      { initialProps: { initial: at(2) } },
    )

    // The page re-ran its loader (seq 3) before the socket pushed that same change: the push still counts.
    rerender({ initial: at(3) })
    act(() =>
      FakeSocket.last!.onmessage?.({ data: JSON.stringify({ kind: 'frame', frame: at(3) }) }),
    )

    expect(result.current.frame?.seq).toBe(3)
    expect(onFrame).toHaveBeenCalledOnce()
  })

  it('reconnects after 1, 2, 4, 8 and then 15 seconds, reporting that it is reconnecting', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    const { result } = renderHook(() =>
      useLiveTopic({ kind: 'game', id: 'abc', initial: at(2), isPayload }),
    )
    const opensAfter = (ms: number) => {
      const before = FakeSocket.opened
      act(() => FakeSocket.last!.onclose?.({ code: 1006 }))
      act(() => vi.advanceTimersByTime(ms - 1))
      const early = FakeSocket.opened
      act(() => vi.advanceTimersByTime(1))
      return [early - before, FakeSocket.opened - before]
    }

    expect(opensAfter(1000)).toEqual([0, 1])
    expect(result.current.status).toBe('reconnecting')
    expect([
      opensAfter(2000),
      opensAfter(4000),
      opensAfter(8000),
      opensAfter(15000),
      opensAfter(15000),
    ]).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ])
  })

  it('a successful reconnect is live again and starts the backoff over', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    const { result } = renderHook(() =>
      useLiveTopic({ kind: 'game', id: 'abc', initial: at(2), isPayload }),
    )
    act(() => FakeSocket.last!.onclose?.({ code: 1006 }))
    act(() => vi.advanceTimersByTime(1000))
    act(() => FakeSocket.last!.onopen?.())
    expect(result.current.status).toBe('live')

    const before = FakeSocket.opened
    act(() => FakeSocket.last!.onclose?.({ code: 1006 }))
    act(() => vi.advanceTimersByTime(1000))
    expect(FakeSocket.opened - before).toBe(1)
  })

  it.each([
    [4401, 'Your session has ended. Reload to sign in again.'],
    [4400, 'This live feed does not exist.'],
  ])('does not retry a %i close', (code, message) => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    const { result } = renderHook(() =>
      useLiveTopic({ kind: 'game', id: 'abc', initial: at(2), isPayload }),
    )
    const before = FakeSocket.opened

    act(() => FakeSocket.last!.onclose?.({ code }))
    act(() => vi.advanceTimersByTime(60_000))

    expect(FakeSocket.opened).toBe(before)
    expect(result.current.error).toBe(message)
    expect(result.current.status).toBe('closed')
  })

  it('does not reconnect after unmount', () => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeSocket)
    const { unmount } = renderHook(() =>
      useLiveTopic({ kind: 'game', id: 'abc', initial: at(2), isPayload }),
    )
    const socket = FakeSocket.last!
    const before = FakeSocket.opened

    unmount()
    act(() => socket.onclose?.({ code: 1006 }))
    act(() => vi.advanceTimersByTime(60_000))

    expect(FakeSocket.opened).toBe(before)
  })
})

describe('liveStatusText', () => {
  it('names every connection state', () => {
    expect(
      ['connecting', 'live', 'reconnecting', 'closed'].map((s) => liveStatusText(s as never)),
    ).toEqual(['connecting…', 'live', 'reconnecting…', 'disconnected'])
  })
})
