import { useEffect, useState } from 'react'
import type { PingState } from '#/lib/pings'
import { parseFrame } from '#/lib/pings'

export interface PingFeedProps {
  id: string
  /** The loader's server-rendered state: shown until the first live frame, so there is no spinner. */
  initial: PingState
}

type Status = 'connecting' | 'live' | 'closed'

/** Same origin as the page, always — the relay is the only thing that knows the API host. */
export function relayUrl(host: string, protocol: string, id: string): string {
  const scheme = protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${host}/api/ws/pings/${encodeURIComponent(id)}`
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

  useEffect(() => {
    setFrames([])
    setError(null)
    setStatus('connecting')
    const socket = new WebSocket(relayUrl(window.location.host, window.location.protocol, id))
    socket.onopen = () => setStatus('live')
    socket.onclose = () => setStatus('closed')
    socket.onmessage = (event: { data: unknown }) => {
      const frame = typeof event.data === 'string' ? parseFrame(event.data) : null
      if (!frame) return
      if (frame.kind === 'state') setFrames((prev) => [...prev, frame.state])
      else setError(frame.message)
    }
    return () => socket.close()
  }, [id])

  const latest = frames.at(-1) ?? initial

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Live feed</h2>
        <span
          className="text-xs text-zinc-500"
          data-testid="ping-status"
          aria-live="polite"
          aria-label={`relay ${STATUS_LABEL[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </header>

      <p className="text-2xl font-semibold tabular-nums" data-testid="ping-count">
        count {latest.count}
      </p>
      <p className="mt-1 text-sm text-zinc-500">{latest.lastText ?? 'no text yet'}</p>

      {error ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400" role="status">
          Relay error: {error}
        </p>
      ) : null}

      <ul className="mt-4 space-y-1 text-sm" data-testid="ping-feed">
        {frames.map((state) => (
          <li key={state.lastSeq} className="flex gap-3 font-mono text-xs">
            <span className="text-zinc-500">#{state.lastSeq}</span>
            <span>count {state.count}</span>
            <span className="truncate">{state.lastText}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
