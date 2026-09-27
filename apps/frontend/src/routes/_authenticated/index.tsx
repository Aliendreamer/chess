import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import type { InviteView, QueueStatus } from '#/lib/play'
import type { EngineLevel } from '#/lib/games'
import type { ColourChoice } from '#/components/ui'
import {
  getEngineLevels,
  getMyGames,
  postCreateInvite,
  postJoinQueue,
  postLeaveQueue,
  postStartEngineGame,
} from '#/lib/server/api'
import { CORRESPONDENCE, PRESETS, category } from '#/lib/games'
import { isQueueView, pairingGame } from '#/lib/play'
import { liveStatusText, useLiveTopic } from '#/lib/live'
import {
  Button,
  Chip,
  ColourPicker,
  ErrorText,
  OptionTile,
  Panel,
  SectionHeading,
  buttonClass,
  useCommand,
} from '#/components/ui'
import { RecentGames, YourTurnList } from '#/components/games'

/** Home: quick pairing on a preset, an invite link for a friend, and your recent games. */
export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    const [games, yourTurn, levels] = await Promise.all([
      getMyGames({ data: { limit: 8 } }),
      getMyGames({ data: { limit: 20, turn: 'mine' } }),
      getEngineLevels(),
    ])
    return { games, yourTurn, levels }
  },
  component: HomePage,
})

const HEARTBEAT_MS = 25_000

function HomePage() {
  const { me } = Route.useRouteContext()
  const { games, yourTurn, levels } = Route.useLoaderData()
  const navigate = useNavigate()
  const [seek, setSeek] = useState<QueueStatus | null>(null)
  const joining = useCommand()
  const current = games.items.find((g) => g.status === 'playing')

  const goToGame = (gameId: string) => void navigate({ to: '/games/$id', params: { id: gameId } })

  async function join(timeControl: string) {
    const status = await joining.run(() =>
      postJoinQueue({ data: { timeControl, heartbeat: false } }),
    )
    if (status?.status === 'matched' && status.gameId) goToGame(status.gameId)
    else if (status) setSeek(status)
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
              disabled={joining.busy}
              onClick={() => void join(tc)}
            />
          ))}
        </div>
        {joining.error ? <ErrorText>{joining.error}</ErrorText> : null}
      </section>

      <section className="flex flex-col gap-3.5">
        <SectionHeading>Play the computer</SectionHeading>
        <EngineForm levels={levels} onStarted={goToGame} />
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
          {yourTurn.items.length > 0 ? (
            <>
              <SectionHeading meta={`${yourTurn.items.length}`}>Your turn</SectionHeading>
              <YourTurnList games={yourTurn.items} nowMs={Date.now()} />
            </>
          ) : null}
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
    <Panel variant="accent" title="Your seek" meta={liveStatusText(live.status)}>
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

function InviteForm({ onCreated }: { onCreated: (invite: InviteView) => void }) {
  const [timeControl, setTimeControl] = useState<string>('10+5')
  const [color, setColor] = useState<ColourChoice>('random')
  const creating = useCommand()

  async function create() {
    const invite = await creating.run(() => postCreateInvite({ data: { timeControl, color } }))
    if (invite) onCreated(invite)
  }

  return (
    <Panel variant="filled" className="gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Time control">
        {[...PRESETS, CORRESPONDENCE].map((tc) => (
          <Chip
            key={tc}
            shape="square"
            mono
            selected={tc === timeControl}
            onClick={() => setTimeControl(tc)}
          >
            {tc === CORRESPONDENCE ? '7 days' : tc}
          </Chip>
        ))}
      </div>
      <ColourPicker value={color} onChange={setColor} />
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-fg-secondary">The link is open for 24 hours.</span>
        <Button variant="primary" disabled={creating.busy} onClick={() => void create()}>
          Create invite link
        </Button>
      </div>
      {creating.error ? <ErrorText>{creating.error}</ErrorText> : null}
    </Panel>
  )
}

/** A level and your colour, then an untimed game against Stockfish (engine-play D7). */
function EngineForm({
  levels,
  onStarted,
}: {
  levels: ReadonlyArray<EngineLevel>
  onStarted: (gameId: string) => void
}) {
  const [level, setLevel] = useState(levels[1]?.level ?? levels[0]?.level ?? 'max')
  const [color, setColor] = useState<ColourChoice>('white')
  const starting = useCommand()

  async function start() {
    const game = await starting.run(() => postStartEngineGame({ data: { level, color } }))
    if (game) onStarted(game.gameId)
  }

  return (
    <Panel variant="filled" className="gap-4" testId="engine-form">
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5"
        role="group"
        aria-label="Level"
      >
        {levels.map((l) => (
          <OptionTile
            key={l.level}
            figure={l.label}
            label={`Level ${l.label}`}
            align="center"
            selected={l.level === level}
            onClick={() => setLevel(l.level)}
          />
        ))}
      </div>
      <ColourPicker value={color} onChange={setColor} />
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-fg-secondary">
          Untimed. The computer answers each move in 5–10 seconds.
        </span>
        <Button variant="primary" disabled={starting.busy} onClick={() => void start()}>
          Play the computer
        </Button>
      </div>
      {starting.error ? <ErrorText>{starting.error}</ErrorText> : null}
    </Panel>
  )
}
