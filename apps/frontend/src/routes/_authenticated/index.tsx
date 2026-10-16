import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { category } from '@chess/core'
import {
  Button,
  CategoryIcon,
  ColourPicker,
  ErrorText,
  EventsNow,
  NewsList,
  OptionTile,
  Panel,
  SectionHeading,
  buttonClass,
  categoryBar,
  useCommand,
} from '@chess/ui'
import type { QueueStatus } from '#/lib/play'
import type { EngineLevel } from '#/lib/games'
import type { ColourChoice } from '@chess/core'
import {
  getEngineLevels,
  getEvents,
  getLobby,
  getMyGames,
  getNews,
  postJoinQueue,
  postLeaveQueue,
  postStartEngineGame,
} from '#/lib/server/api'
import { PRESETS } from '#/lib/games'
import { isQueueView, pairingGame, useLobby, waitingIn } from '#/lib/play'
import { liveStatusText, useLiveTopic } from '#/lib/live'
import { RecentGames } from '#/components/games'
import { pageTitle } from '#/lib/feedback'

/** Home: quick pairing on a preset, a game against the computer, and your recent games. */
/** `?seek=3+2` joins that queue on arrival: the game-over card's "New opponent" (game-feedback). */
function validateSearch(search: Record<string, unknown>): { seek?: string } {
  const seek = search['seek']
  return typeof seek === 'string' && (PRESETS as ReadonlyArray<string>).includes(seek)
    ? { seek }
    : {}
}

export const Route = createFileRoute('/_authenticated/')({
  validateSearch,
  loader: async () => {
    const [games, levels, lobby, news, events] = await Promise.all([
      getMyGames({ data: { limit: 12 } }),
      getEngineLevels(),
      // The lobby, the news and the events are niceties: home still works when they cannot be read.
      getLobby().catch(() => null),
      getNews({ data: { limit: 6 } }).catch(() => null),
      getEvents().catch(() => []),
    ])
    return { games, levels, lobby, news, events }
  },
  head: () => ({ meta: [{ title: pageTitle('Home') }] }),
  component: HomePage,
})

const HEARTBEAT_MS = 25_000
/** How long "Opponent found" shows before the game opens (game-feedback). */
const FOUND_MS = 600

function HomePage() {
  const { me } = Route.useRouteContext()
  const { games, levels, lobby: lobbyAtLoad, news, events } = Route.useLoaderData()
  const lobby = useLobby(lobbyAtLoad, loadLobby)
  const navigate = useNavigate()
  const [seek, setSeek] = useState<QueueStatus | null>(null)
  const joining = useCommand()
  const current = games.items.find((g) => g.status === 'playing')

  const goToGame = (gameId: string) => void navigate({ to: '/games/$id', params: { id: gameId } })

  async function join(timeControl: string) {
    const status = await joining.run(() =>
      postJoinQueue({ data: { timeControl, heartbeat: false } }),
    )
    if (status) setSeek(status) // a pairing at once still shows "Opponent found" first
  }

  const { seek: seekOnArrival } = Route.useSearch()
  useEffect(() => {
    if (!seekOnArrival) return
    void navigate({ to: '/', search: {}, replace: true })
    void join(seekOnArrival)
  }, [])

  return (
    // A dashboard on a wide screen (home-layout): play | your games | the club and the news, side by side
    // without scrolling; two columns, then one, as the room shrinks. Container queries, so the rail is accounted for.
    <div className="@container flex flex-col gap-6" data-layout="wide">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <SectionHeading size="xl">{`Hello, ${me.username}.`}</SectionHeading>
        </div>
        {current ? (
          <Link
            to="/games/$id"
            params={{ id: current.gameId }}
            className={buttonClass('outline')}
          >{`Resume game vs ${current.opponent} →`}</Link>
        ) : null}
      </header>

      <div className="grid items-start gap-x-8 gap-y-8 @4xl:grid-cols-2 @7xl:grid-cols-[1.2fr_1fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 @7xl:grid-cols-6">
              {PRESETS.map((tc) => (
                <OptionTile
                  key={tc}
                  compact
                  figure={tc}
                  caption={
                    <span className="flex items-center gap-1.5">
                      <CategoryIcon timeControl={tc} />
                      {category(tc)}
                      <Waiting count={waitingIn(lobby, tc)} />
                    </span>
                  }
                  label={`Play ${tc} (${category(tc)})`}
                  bar={categoryBar(tc)}
                  selected={seek?.timeControl === tc}
                  disabled={joining.busy}
                  onClick={() => void join(tc)}
                />
              ))}
            </div>
            {joining.error ? <ErrorText>{joining.error}</ErrorText> : null}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading>Play the computer</SectionHeading>
            <EngineForm levels={levels} onStarted={goToGame} />
          </section>
          <EventsNow events={events} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <SectionHeading meta={<Link to="/games">View all</Link>}>Recent games</SectionHeading>
            <RecentGames
              games={games.items}
              empty="No games yet: pick a time control under Quick pairing, or play the computer."
            />
          </section>
        </div>

        {/* Two columns: this one spans both below them, its parts side by side; three: the third column. */}
        <div className="grid min-w-0 items-start gap-x-8 gap-y-6 @4xl:col-span-2 @4xl:grid-cols-2 @7xl:col-span-1 @7xl:grid-cols-1">
          <section className="flex flex-col gap-3" aria-label="News">
            <SectionHeading meta={<Link to="/news">All news</Link>}>News</SectionHeading>
            <NewsList items={news?.items ?? []} nowMs={Date.now()} />
          </section>
        </div>
      </div>
    </div>
  )
}

/** Polled by `useLobby`; defined once so the hook's effect does not restart on every render. */
const loadLobby = () => getLobby()

/** "· 2 waiting" on a quick-pairing tile, only when someone is. */
function Waiting({ count }: { count: number | null }) {
  return count ? <span className="text-fg-accent">{`· ${count} waiting`}</span> : null
}

interface SeekProps {
  /** The join's answer; `matched` already names the game. */
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
  const [found, setFound] = useState(false)

  // "Opponent found" for a moment, then the game (at once when the user prefers reduced motion).
  const matched = (gameId: string) => {
    if (done.current) return
    done.current = true
    setFound(true)
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setTimeout(() => onMatched(gameId), reduced ? 0 : FOUND_MS)
  }
  useEffect(() => {
    if (seek.status === 'matched' && seek.gameId) matched(seek.gameId)
  }, [])

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
          {found ? (
            <span
              className="text-sm font-medium text-fg-accent motion-safe:animate-pulse"
              data-testid="seek-found"
            >
              Opponent found
            </span>
          ) : (
            <span className="text-sm text-fg-secondary">{`${category(tc)} · ${waiting} waiting`}</span>
          )}
        </div>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
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
        className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 @4xl:grid-cols-5"
        role="group"
        aria-label="Level"
      >
        {levels.map((l) => (
          <OptionTile
            key={l.level}
            compact
            figure={l.label}
            figureSize="sm"
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
