import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PingFeed, relayUrl } from './PingFeed'
import type { PingState } from '#/lib/pings'

const initial: PingState = { pingId: 'p1', count: 1, lastText: 'hi', lastAt: null, lastSeq: 1 }

/** Minimal stand-in for the browser socket: the component only uses the four handlers and close(). */
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

const frameMessage = (state: PingState) =>
  JSON.stringify({
    kind: 'frame',
    frame: { topic: `ping:${state.pingId}`, seq: state.lastSeq, payload: state },
  })

const at = (seq: number): PingState => ({
  pingId: 'p1',
  count: seq,
  lastText: `t${seq}`,
  lastAt: null,
  lastSeq: seq,
})

function renderFeed() {
  vi.stubGlobal('WebSocket', FakeSocket)
  render(<PingFeed id="p1" initial={initial} />)
  const socket = FakeSocket.last!
  return socket
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  FakeSocket.last = undefined
})

describe('relayUrl', () => {
  it('stays on the app origin and upgrades the scheme with the page', () => {
    expect(relayUrl('app.chess.localhost', 'http:', 'p1')).toBe(
      'ws://app.chess.localhost/api/ws/live/ping/p1',
    )
    expect(relayUrl('chess.example', 'https:', 'p1')).toBe(
      'wss://chess.example/api/ws/live/ping/p1',
    )
  })
})

describe('PingFeed', () => {
  it('renders the server-rendered state before any frame arrives', () => {
    renderFeed()
    expect(screen.getByTestId('ping-count').textContent).toBe('count 1')
    expect(screen.queryByText(/loading/i)).toBeNull()
  })

  it('replaces the count from live frames and lists them', () => {
    const socket = renderFeed()
    act(() => socket.onopen?.())
    expect(screen.getByTestId('ping-status').textContent).toMatch(/live/i)

    const next: PingState = { pingId: 'p1', count: 2, lastText: 'again', lastAt: null, lastSeq: 2 }
    act(() => socket.onmessage?.({ data: frameMessage(next) }))

    expect(screen.getByTestId('ping-count').textContent).toBe('count 2')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByTestId('ping-feed').textContent).toContain('again')
  })

  it('applies frames in seq order: a late snapshot and a duplicate push are dropped', () => {
    const socket = renderFeed()

    act(() => socket.onmessage?.({ data: frameMessage(at(3)) })) // push overtakes the snapshot
    act(() => socket.onmessage?.({ data: frameMessage(at(2)) })) // the snapshot, now stale
    act(() => socket.onmessage?.({ data: frameMessage(at(3)) })) // duplicate after a reconnect
    act(() => socket.onmessage?.({ data: frameMessage(at(4)) }))

    expect(screen.getByTestId('ping-count').textContent).toBe('count 4')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '#3count 3t3',
      '#4count 4t4',
    ])
  })

  it('does not list a snapshot that only repeats the server-rendered state', () => {
    const socket = renderFeed() // initial is seq 1
    act(() => socket.onmessage?.({ data: frameMessage(initial) }))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByTestId('ping-count').textContent).toBe('count 1')
  })

  it('ignores a frame for another kind', () => {
    const socket = renderFeed()
    const other = JSON.stringify({
      kind: 'frame',
      frame: { topic: 'game:g1', seq: 9, payload: {} },
    })
    act(() => socket.onmessage?.({ data: other }))
    expect(screen.getByTestId('ping-count').textContent).toBe('count 1')
  })

  it('ignores junk frames instead of breaking the feed', () => {
    const socket = renderFeed()
    act(() => socket.onmessage?.({ data: 'not json' }))
    expect(screen.getByTestId('ping-count').textContent).toBe('count 1')
  })

  it('surfaces a relay error frame', () => {
    const socket = renderFeed()
    act(() => socket.onmessage?.({ data: JSON.stringify({ kind: 'error', message: 'hub down' }) }))
    expect(screen.getByRole('status').textContent).toContain('hub down')
  })

  it('closes the socket on unmount', () => {
    const socket = renderFeed()
    cleanup()
    expect(socket.close).toHaveBeenCalled()
  })
})
