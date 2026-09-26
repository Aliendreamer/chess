import { useEffect, useRef, useState } from 'react'
import type { LiveFrame } from '#/lib/live'
import type { PingState } from '#/lib/pings'
import { applyFrame, parseSocketMessage } from '#/lib/live'
import { isPingState } from '#/lib/pings'

export interface PingFeedProps {
  id: string
  /** The loader's server-rendered state: shown until the first live frame, so there is no spinner. */
  initial: PingState
}

type Status = 'connecting' | 'live' | 'closed'

/** Same origin as the page, always — the relay is the only thing that knows the API host. */
export function relayUrl(host: string, protocol: string, id: string): string {
  const scheme = protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${host}/api/ws/live/ping/${encodeURIComponent(id)}`
}

const STATUS_LABEL: Record<Status, string> = {
  connecting: 'connecting…',
  live: 'live',
  closed: 'disconnected',
}

/** The only client-side data owner in the app: it holds the relay socket for this ping. */
export function PingFeed({ id, initial }: PingFeedProps) {
  const [frames, setFrames] = useState<Array<PingState>>([])
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<string | null>(null)
  // The newest frame applied so far: the snapshot and pushes race, and only a newer seq may move the view.
  const shown = useRef<LiveFrame<PingState> | undefined>(undefined)
  // The server-rendered state counts as shown, so a snapshot that merely repeats it isn't listed again.
  const rendered = useRef(initial)
  useEffect(() => {
    rendered.current = initial
  }, [initial])

  useEffect(() => {
    setFrames([])
    setError(null)
    setStatus('connecting')
    const topic = `ping:${id}`
    shown.current = { topic, seq: rendered.current.lastSeq, payload: rendered.current }
    const socket = new WebSocket(relayUrl(window.location.host, window.location.protocol, id))
    socket.onopen = () => setStatus('live')
    socket.onclose = () => setStatus('closed')
    socket.onmessage = (event: { data: unknown }) => {
      const message = typeof event.data === 'string' ? parseSocketMessage(event.data) : null
      if (!message) return
      if (message.kind === 'error') {
        setError(message.message)
        return
      }
      const { frame } = message
      if (frame.topic !== topic || !isPingState(frame.payload)) return
      const next = { ...frame, payload: frame.payload }
      if (applyFrame(shown.current, next) !== next) return
      shown.current = next
      setFrames((prev) => [...prev, next.payload])
    }
    return () => socket.close()
  }, [id])

  const latest = frames.at(-1) ?? initial

  return (
    <section className="rounded-card border border-line-default bg-surface-card p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-2xs tracking-eyebrow text-fg-muted uppercase">Live feed</h2>
        <span
          className="font-mono text-2xs text-fg-muted"
          data-testid="ping-status"
          aria-live="polite"
          aria-label={`relay ${STATUS_LABEL[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </header>

      {/* One interpolation, not `count {n}`: React separates those with a comment marker in the SSR
          HTML, and the e2e asserts on the raw server bytes before any JS runs. */}
      <p className="font-display text-display-sm tabular-nums" data-testid="ping-count">
        {`count ${latest.count}`}
      </p>
      <p className="mt-1 text-sm text-fg-secondary">{latest.lastText ?? 'no text yet'}</p>

      {error ? (
        <p className="mt-3 text-sm text-status-loss" role="status">
          Relay error: {error}
        </p>
      ) : null}

      <ul className="mt-4 space-y-1 text-sm" data-testid="ping-feed">
        {frames.map((state) => (
          <li key={state.lastSeq} className="flex gap-3 font-mono text-xs">
            <span className="text-fg-muted">#{state.lastSeq}</span>
            <span>{`count ${state.count}`}</span>
            <span className="truncate">{state.lastText}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
