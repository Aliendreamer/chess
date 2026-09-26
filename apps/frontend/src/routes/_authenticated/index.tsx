import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import type { InviteView, QueueStatus } from '#/lib/play'
import { getMyGames, postCreateInvite, postJoinQueue, postLeaveQueue } from '#/lib/server/api'
import { PRESETS, category } from '#/lib/games'
import { isQueueView, pairingGame } from '#/lib/play'
import { useLiveTopic } from '#/lib/useLiveTopic'
import { Button, buttonClass } from '#/components/core/Button'
import { Chip } from '#/components/core/Chip'
import { OptionTile } from '#/components/core/OptionTile'
import { Panel, SectionHeading } from '#/components/core/Panel'
import { RecentGames } from '#/components/play/RecentGames'

/** Home: quick pairing on a preset, an invite link for a friend, and your recent games. */
export const Route = createFileRoute('/_authenticated/')({
  loader: () => getMyGames({ data: { limit: 8 } }),
  component: HomePage,
})

const HEARTBEAT_MS = 25_000

function HomePage() {
  const { me } = Route.useRouteContext()
  const games = Route.useLoaderData()
  const navigate = useNavigate()
  const [seek, setSeek] = useState<QueueStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const current = games.items.find((g) => g.status === 'playing')

  const goToGame = (gameId: string) => void navigate({ to: '/games/$id', params: { id: gameId } })

  async function join(timeControl: string) {
    setJoining(true)
    setError(null)
    try {
      const outcome = await postJoinQueue({ data: { timeControl, heartbeat: false } })
      if (!outcome.ok) {
        setError(outcome.error)
      } else if (outcome.view.status === 'matched' && outcome.view.gameId) {
        goToGame(outcome.view.gameId)
      } else {
        setSeek(outcome.view)
      }
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading size="xl">{`Hello, ${me.username}.`}</SectionHeading>
        {current ? (
          <Link
            to="/games/$id"
            params={{ id: current.gameId }}
            className={buttonClass('outline')}
          >{`Resume game vs ${current.opponent} →`}</Link>
        ) : null}
      </header>

      <section className="flex flex-col gap-3.5">
        <SectionHeading>Quick pairing</SectionHeading>
        {seek ? (
          <Seek
            key={seek.timeControl}
            seek={seek}
            meId={me.id}
            onMatched={goToGame}
            onCancel={() => setSeek(null)}
          />
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
          {PRESETS.map((tc) => (
            <OptionTile
              key={tc}
              figure={tc}
              caption={category(tc)}
              label={`Play ${tc} (${category(tc)})`}
              selected={seek?.timeControl === tc}
              disabled={joining}
              onClick={() => void join(tc)}
            />
          ))}
        </div>
        {error ? (
          <p role="status" className="m-0 text-sm text-status-loss">
            {error}
          </p>
        ) : null}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-6">
        <section className="flex flex-col gap-3.5">
          <SectionHeading>Play a friend</SectionHeading>
          <InviteForm
            onCreated={(invite) =>
              void navigate({ to: '/invites/$id', params: { id: invite.inviteId } })
            }
          />
        </section>
        <section className="flex flex-col gap-3.5">
          <SectionHeading>Recent games</SectionHeading>
          <RecentGames games={games.items} />
        </section>
      </div>
    </div>
  )
}

interface SeekProps {
  seek: QueueStatus
  meId: number
  onMatched: (gameId: string) => void
  onCancel: () => void
}

/**
 * Waiting in one queue (D6): the `queue:{tc}` frame names the pairing at once; a heartbeat every 25 s keeps the
 * place (and catches a pairing the socket missed). Leaving the page or Cancel leaves the queue. Frames up to the
 * join's seq are ignored for pairings: they may still show this player's previous game.
 */
function Seek({ seek, meId, onMatched, onCancel }: SeekProps) {
  const tc = seek.timeControl
  const joinSeq = seek.seq ?? 0
  const done = useRef(false)
  const [waiting, setWaiting] = useState(seek.waiting ?? 1)

  const matched = (gameId: string) => {
    if (done.current) return
    done.current = true
    onMatched(gameId)
  }

  const heartbeat = async () => {
    const outcome = await postJoinQueue({ data: { timeControl: tc, heartbeat: true } })
    if (outcome.ok && outcome.view.status === 'matched' && outcome.view.gameId) {
      matched(outcome.view.gameId)
    } else if (outcome.ok && outcome.view.waiting !== null) {
      setWaiting(outcome.view.waiting)
    }
  }

  const live = useLiveTopic({
    kind: 'queue',
    id: tc,
    initial: undefined,
    isPayload: isQueueView,
    onFrame: (frame) => {
      setWaiting(frame.payload.waitingCount)
      const gameId = pairingGame(frame.payload, meId, joinSeq)
      if (gameId) matched(gameId)
    },
  })

  // Leave the queue when this seek goes away (Cancel, navigating off). The leave waits a tick and is skipped if the
  // component is back: React may unmount and remount an effect (StrictMode in dev), which is not leaving.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const timer = setInterval(() => void heartbeat(), HEARTBEAT_MS)
    return () => {
      mounted.current = false
      clearInterval(timer)
      setTimeout(() => {
        if (!mounted.current && !done.current) void postLeaveQueue({ data: tc })
      }, 0)
    }
  }, [tc]) // heartbeat and matched only read refs and stable props

  return (
    <Panel variant="accent" title="Your seek" meta={live.status === 'live' ? 'live' : live.status}>
      <div className="flex items-center justify-between gap-4" data-testid="seek">
        <div className="flex flex-col">
          <span className="font-display text-display-lg leading-none">{tc}</span>
          <span className="text-sm text-fg-secondary">{`${category(tc)} · ${waiting} waiting`}</span>
        </div>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </Panel>
  )
}

const COLOURS: ReadonlyArray<{ value: InviteView['color']; glyph: string; label: string }> = [
  { value: 'white', glyph: '♔', label: 'White' },
  { value: 'random', glyph: '⚄', label: 'Random' },
  { value: 'black', glyph: '♚', label: 'Black' },
]

function InviteForm({ onCreated }: { onCreated: (invite: InviteView) => void }) {
  const [timeControl, setTimeControl] = useState<string>('10+5')
  const [color, setColor] = useState<InviteView['color']>('random')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const outcome = await postCreateInvite({ data: { timeControl, color } })
      if (outcome.ok) onCreated(outcome.view)
      else setError(outcome.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel variant="filled" className="gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Time control">
        {PRESETS.map((tc) => (
          <Chip
            key={tc}
            shape="square"
            mono
            selected={tc === timeControl}
            onClick={() => setTimeControl(tc)}
          >
            {tc}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Your colour">
        {COLOURS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={color === c.value}
            onClick={() => setColor(c.value)}
            className={`flex cursor-pointer items-center gap-3 rounded-card border px-4 py-3 text-fg-primary ${color === c.value ? 'border-line-accent bg-surface-accent-tint' : 'border-line-default bg-surface-raised hover:border-line-accent'}`}
          >
            <span aria-hidden className="text-[28px] leading-none">
              {`${c.glyph}︎`}
            </span>
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-fg-secondary">The link is open for 24 hours.</span>
        <Button variant="primary" disabled={busy} onClick={() => void create()}>
          Create invite link
        </Button>
      </div>
      {error ? (
        <p role="status" className="m-0 text-sm text-status-loss">
          {error}
        </p>
      ) : null}
    </Panel>
  )
}
