import { useEffect, useRef, useState } from 'react'

/**
 * The live wire contract, shared by the SSR relay and the browser. Kind-agnostic: a frame is `{ topic, seq,
 * payload }` for any live kind (ping now, game later); each page narrows `payload` for its own kind.
 *
 * Deliberately outside `lib/server/`: the client bundle imports this, and nothing under `lib/server/` may ever
 * reach the browser.
 */

/** Mirrors the API's `LiveFrame` (System.Text.Json camel-cases the members). */
export interface LiveFrame<TPayload = unknown> {
  topic: string
  seq: number
  payload: TPayload
}

/** What travels over the browser ↔ BFF socket. */
export type SocketMessage = { kind: 'frame'; frame: LiveFrame } | { kind: 'error'; message: string }

export function isLiveFrame(value: unknown): value is LiveFrame {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v['topic'] === 'string' && typeof v['seq'] === 'number' && 'payload' in v
}

/** Socket text → message. Junk is dropped, never thrown: a bad message must not kill the feed. */
export function parseSocketMessage(data: string): SocketMessage | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const m = parsed as Record<string, unknown>
  if (m['kind'] === 'frame' && isLiveFrame(m['frame'])) return { kind: 'frame', frame: m['frame'] }
  if (m['kind'] === 'error' && typeof m['message'] === 'string') {
    return { kind: 'error', message: m['message'] }
  }
  return null
}

/**
 * The view only moves forward: a frame applies when its seq is newer than what is shown. A snapshot and a push for
 * the same event may arrive in either order, and a reconnect may repeat one; both collapse here.
 */
export function applyFrame<TPayload>(
  current: LiveFrame<TPayload> | undefined,
  next: LiveFrame<TPayload>,
): LiveFrame<TPayload> {
  return current === undefined || next.seq > current.seq ? next : current
}

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'closed'

const STATUS_TEXT: Record<LiveStatus, string> = {
  connecting: 'connecting…',
  live: 'live',
  reconnecting: 'reconnecting…',
  closed: 'disconnected',
}

/** How a page names its live connection. */
export function liveStatusText(status: LiveStatus): string {
  return STATUS_TEXT[status]
}

/** Delays before each reconnect attempt; the last one repeats (presence-and-abandonment D7). */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000] as const

/** Closes that no retry can fix: the relay refused the topic (4400) or the session is over (4401). */
const FINAL_CLOSES: Record<number, string> = {
  4400: 'This live feed does not exist.',
  4401: 'Your session has ended. Reload to sign in again.',
}

/** Same origin as the page, always — the relay is the only thing that knows the API host. */
export function liveUrl(host: string, protocol: string, kind: string, id: string): string {
  const scheme = protocol === 'https:' ? 'wss' : 'ws'
  // `+` is literal in a path and the relay's queue rule expects it raw (`5+3`, not `5%2B3`).
  return `${scheme}://${host}/api/ws/live/${kind}/${encodeURIComponent(id).replaceAll('%2B', '+')}`
}

export interface LiveTopicOptions<T> {
  kind: string
  /** The id as the topic spells it (for guids: 32 hex, no dashes). */
  id: string
  /** What the page shows when subscribing (the loader's state and its seq): a frame applies only if newer. */
  initial: { seq: number; payload: T } | undefined
  isPayload: (value: unknown) => value is T
  /** Called once per applied frame, in order — for pages that keep a history, not just the latest. */
  onFrame?: (frame: LiveFrame<T>) => void
}

export interface LiveTopic<T> {
  /** The newest frame applied, or `initial` until one arrives. */
  frame: LiveFrame<T> | undefined
  status: LiveStatus
  error: string | null
}

/**
 * One relay socket for `kind:id`: frames are applied by seq (`applyFrame`), so a snapshot and a push for the
 * same event, or a repeat after a reconnect, collapse. The only client-side data owner a page needs.
 */
export function useLiveTopic<T>({
  kind,
  id,
  initial,
  isPayload,
  onFrame,
}: LiveTopicOptions<T>): LiveTopic<T> {
  const start: LiveFrame<T> | undefined = initial && { topic: `${kind}:${id}`, ...initial }
  const [frame, setFrame] = useState<LiveFrame<T> | undefined>(start)
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const shown = useRef<LiveFrame<T> | undefined>(start)
  const callbacks = useRef({ isPayload, onFrame })
  callbacks.current = { isPayload, onFrame }

  // `initial` is the baseline when (re)subscribing only: a page that re-runs its loader shows that state itself,
  // and moving the baseline here would make the socket's own push for the same change look stale.
  const baseline = useRef(start)
  baseline.current = start
  useEffect(() => {
    shown.current = baseline.current
    setFrame(baseline.current)
    setStatus('connecting')
    setError(null)
    const topic = `${kind}:${id}`
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let disposed = false

    // A dropped socket is reopened with backoff; its snapshot then brings the view up to date by seq.
    const onClose = (event: { code: number }) => {
      if (disposed) return
      const final = FINAL_CLOSES[event.code]
      if (final) {
        setStatus('closed')
        setError(final)
        return
      }
      setStatus('reconnecting')
      const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]
      attempt += 1
      retry = setTimeout(open, delay)
    }

    const onMessage = (event: { data: unknown }) => {
      const message = typeof event.data === 'string' ? parseSocketMessage(event.data) : null
      if (!message) return
      if (message.kind === 'error') {
        setError(message.message)
        return
      }
      const { frame: incoming } = message
      if (incoming.topic !== topic || !callbacks.current.isPayload(incoming.payload)) return
      const next: LiveFrame<T> = { ...incoming, payload: incoming.payload }
      if (applyFrame(shown.current, next) !== next) return
      shown.current = next
      setFrame(next)
      callbacks.current.onFrame?.(next)
    }

    function open() {
      socket = new WebSocket(liveUrl(window.location.host, window.location.protocol, kind, id))
      socket.onopen = () => {
        attempt = 0
        setStatus('live')
        setError(null)
      }
      socket.onclose = onClose
      socket.onmessage = onMessage
    }

    open()
    return () => {
      disposed = true
      if (retry !== null) clearTimeout(retry)
      socket?.close()
    }
  }, [kind, id])

  return { frame, status, error }
}
