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
      'ws://app.chess.localhost/api/ws/pings/p1',
    )
    expect(relayUrl('chess.example', 'https:', 'p1')).toBe('wss://chess.example/api/ws/pings/p1')
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
    act(() => socket.onmessage?.({ data: JSON.stringify({ kind: 'state', state: next }) }))

    expect(screen.getByTestId('ping-count').textContent).toBe('count 2')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByTestId('ping-feed').textContent).toContain('again')
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
