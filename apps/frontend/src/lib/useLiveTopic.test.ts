import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { liveUrl, useLiveTopic } from './useLiveTopic'
import type { LiveFrame } from './live'

// The socket behaviour (seq order, junk, errors, close) is covered through PingFeed; these pin what it doesn't.

class FakeSocket {
  static last: FakeSocket | undefined
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  close = vi.fn()
  constructor(readonly url: string) {
    FakeSocket.last = this
  }
}

type Payload = { n: number }
const isPayload = (v: unknown): v is Payload => typeof v === 'object' && v !== null && 'n' in v
const at = (seq: number): LiveFrame<Payload> => ({ topic: 'game:abc', seq, payload: { n: seq } })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

  it('a newer server-rendered state moves the view forward, an older one does not', () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const { result, rerender } = renderHook(
      ({ initial }) => useLiveTopic({ kind: 'game', id: 'abc', initial, isPayload }),
      {
        initialProps: { initial: at(2) },
      },
    )

    rerender({ initial: at(5) })
    expect(result.current.frame?.seq).toBe(5)
    rerender({ initial: at(4) })
    expect(result.current.frame?.seq).toBe(5)
  })
})
