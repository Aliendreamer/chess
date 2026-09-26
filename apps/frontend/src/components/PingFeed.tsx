import { useMemo, useState } from 'react'
import type { PingState } from '#/lib/pings'
import type { LiveStatus } from '#/lib/useLiveTopic'
import { isPingState } from '#/lib/pings'
import { liveUrl, useLiveTopic } from '#/lib/useLiveTopic'

export interface PingFeedProps {
  id: string
  /** The loader's server-rendered state: shown until the first live frame, so there is no spinner. */
  initial: PingState
}

/** Same origin as the page, always — the relay is the only thing that knows the API host. */
export function relayUrl(host: string, protocol: string, id: string): string {
  return liveUrl(host, protocol, 'ping', id)
}

const STATUS_LABEL: Record<LiveStatus, string> = {
  connecting: 'connecting…',
  live: 'live',
  closed: 'disconnected',
}

/** The ping's live feed: the relay socket (`useLiveTopic`) plus the list of states it has pushed. */
export function PingFeed({ id, initial }: PingFeedProps) {
  const [frames, setFrames] = useState<Array<PingState>>([])
  // The server-rendered state counts as shown, so a snapshot that merely repeats it isn't listed again.
  const shown = useMemo(
    () => ({ topic: `ping:${id}`, seq: initial.lastSeq, payload: initial }),
    [id, initial],
  )
  const { status, error } = useLiveTopic({
    kind: 'ping',
    id,
    initial: shown,
    isPayload: isPingState,
    onFrame: (frame) => setFrames((prev) => [...prev, frame.payload]),
  })

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
