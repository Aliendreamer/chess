import { useEffect, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { GameCommand, GameSummary, GameView, MoveItem } from '#/lib/games'
import type { LiveFrame } from '#/lib/live'
import type { Me } from '#/lib/auth'
import {
  getGameMoves,
  getGamePage,
  getGameSummary,
  postGameCommand,
  postStudyFromGame,
} from '#/lib/server/api'
import {
  CORRESPONDENCE,
  UNTIMED,
  category,
  engineToMove,
  hasClock,
  isGameView,
  mergeMoves,
  myColor,
  orientation,
  timeLeft,
  topicId,
  useLocalClocks,
} from '#/lib/games'
import { applyFrame, liveStatusText, useLiveTopic } from '#/lib/live'
import { applyOptimistic, clickSquare, legalTargets, needsPromotion } from '#/lib/moveInput'
import {
  Board,
  ClaimPanel,
  GameControls,
  GameResultPanel,
  MoveList,
  PlayerStrip,
  PromotionPicker,
} from '#/components/games'
import { ErrorText, useCommand } from '#/components/ui'

/**
 * A game (players and spectators). SSR renders the loader's state; the `game:{id}` frames then drive it. Moves
 * are shown at once with chess.js and always posted — the server's answer or next frame is the truth (D3).
 */
export const Route = createFileRoute('/_authenticated/games/$id')({
  loader: ({ params }) => getGamePage({ data: params.id }),
  component: GamePage,
})

function GamePage() {
  const { id } = Route.useParams()
  const { me } = Route.useRouteContext()
  const { view, summary, moves } = Route.useLoaderData()
  return <Game key={id} id={id} me={me} view={view} summary={summary} moves={moves} />
}

interface GameProps {
  id: string
  me: Me
  view: GameView
  summary: GameSummary | null
  moves: Array<MoveItem>
}

type Pending = { fen: string; uci: string }

function Game({ id, me, view: loaded, summary: loadedSummary, moves }: GameProps) {
  const topic = topicId(id)
  const live = useLiveTopic({
    kind: 'game',
    id: topic,
    initial: { seq: loaded.seq, payload: loaded },
    isPayload: isGameView,
  })
  // A command's own answer may arrive before its frame; the newer of the two is the view.
  const [answered, setAnswered] = useState<LiveFrame<GameView> | undefined>(undefined)
  const current =
    (answered && live.frame ? applyFrame(live.frame, answered) : (live.frame ?? answered))
      ?.payload ?? loaded

  const [sans, setSans] = useState(() => moves.map((m) => m.san))
  const [pending, setPending] = useState<Pending | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const command = useCommand()
  const analysing = useCommand()
  const navigate = useNavigate()

  // A finished game opens as a new study of mine (studies D5); the page stays if the server refuses.
  async function analyse() {
    const study = await analysing.run(() => postStudyFromGame({ data: id }))
    if (study) void navigate({ to: '/studies/$id', params: { id: study.id } })
  }
  // "Keep waiting" hides the offer until it goes away (they came back); if they leave again, it shows again.
  const [waiting, setWaiting] = useState(false)

  // Every new server view: drop the optimistic move and bring the move list along (D4). Keyed on seq, which
  // identifies the view; the list is read through a ref so the effect never runs a fetch inside a state updater.
  const sansRef = useRef(sans)
  sansRef.current = sans
  const seq = current.seq
  useEffect(() => {
    setPending(null)
    const merge = mergeMoves(sansRef.current, current)
    if (merge.kind === 'append') {
      setSans(merge.sans)
    } else if (merge.kind === 'refetch') {
      void getGameMoves({ data: id }).then((fresh) => {
        // The replica may be one move behind the actor: the frame's own SAN completes it.
        const then = mergeMoves(
          fresh.map((m) => m.san),
          current,
        )
        setSans(then.kind === 'append' ? then.sans : fresh.map((m) => m.san))
      })
    }
  }, [seq, id])

  // A game this new may not be on the replica yet: ask again a few times for the players' names (D4, D23).
  const [summary, setSummary] = useState(loadedSummary)
  useEffect(() => {
    if (summary) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      void getGameSummary({ data: id }).then((found) => {
        if (found) setSummary(found)
      })
      if (tries >= 5) clearInterval(timer)
    }, 1500)
    return () => clearInterval(timer)
  }, [id, summary])

  const clocks = useLocalClocks(current)

  const offered = current.claimableBy === me.id && current.status !== 'Ended'
  useEffect(() => {
    if (!offered) setWaiting(false)
  }, [offered])

  const mine = myColor(current, me.id)
  const side = orientation(current, me.id)
  const playing = current.status !== 'Ended'
  const myTurn =
    mine !== null &&
    playing &&
    current.sideToMove.toLowerCase() === mine &&
    !pending &&
    !command.busy
  const fen = pending?.fen ?? current.fen
  const lastUci = pending?.uci ?? current.lastUci
  const lastMove = lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null
  const targets = selected ? legalTargets(fen, selected) : []

  async function send(action: GameCommand) {
    const view = await command.run(() => postGameCommand({ data: { id, command: action } }))
    if (view) setAnswered({ topic: `game:${topic}`, seq: view.seq, payload: view })
    else setPending(null) // refused: the board snaps back to the last server view
  }

  function move(from: string, to: string, promote?: 'q' | 'r' | 'b' | 'n') {
    const uci = `${from}${to}${promote ?? ''}`
    const after = applyOptimistic(fen, uci)
    if (after) setPending({ fen: after, uci })
    void send({ kind: 'move', uci })
  }

  function onSquareClick(square: string) {
    if (!mine) return
    const result = clickSquare(fen, mine === 'white' ? 'w' : 'b', selected, square)
    setSelected(result.selected)
    if (!result.move) return
    if (needsPromotion(fen, result.move.from, result.move.to)) {
      setPromotion(result.move)
      return
    }
    move(result.move.from, result.move.to)
  }

  const white = summary?.white ?? `Player ${current.whiteId}`
  const black = summary?.black ?? `Player ${current.blackId}`
  const opponentId = mine === 'white' ? current.blackId : current.whiteId
  const againstEngine = current.engineSide != null
  const untimed = current.timeControl === UNTIMED
  const clockless = !hasClock(current.timeControl)
  const top = side === 'white' ? 'black' : 'white'
  const strip = (color: 'white' | 'black') => {
    const toMove = playing && current.sideToMove.toLowerCase() === color
    const you = mine === color
    return (
      <PlayerStrip
        testId={`strip-${color}`}
        name={color === 'white' ? white : black}
        detail={[color, you && toMove ? 'your move' : null].filter(Boolean).join(' · ')}
        {...(clockless ? {} : { ms: color === 'white' ? clocks.whiteMs : clocks.blackMs })}
        active={toMove && current.ply >= 2}
      />
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-8">
      <div className="flex max-w-(--board-max) flex-col gap-3">
        {strip(top)}
        <Board
          fen={fen}
          orientation={side}
          lastMove={lastMove}
          selected={selected}
          targets={targets}
          {...(myTurn ? { onSquareClick } : {})}
        />
        {strip(side)}
        {promotion && mine ? (
          <PromotionPicker
            color={mine}
            onPick={(piece) => {
              setPromotion(null)
              move(promotion.from, promotion.to, piece)
            }}
            onCancel={() => setPromotion(null)}
          />
        ) : null}
      </div>

      <div className="flex max-w-[380px] flex-col gap-5">
        <div>
          <div className="text-xs text-fg-secondary">
            {untimed
              ? 'Untimed · '
              : current.timeControl === CORRESPONDENCE
                ? 'Correspondence · 7 days per move · '
                : `${category(current.timeControl)} ${current.timeControl} · `}
            <span className="font-mono" aria-live="polite" data-testid="game-relay">
              {liveStatusText(live.status)}
            </span>
          </div>
          <h1 className="m-0 mt-0.5 font-display text-display-md font-normal">
            {white} <span className="text-fg-muted">vs</span> {black}
          </h1>
        </div>

        {current.status === 'Ended' && current.result ? (
          <GameResultPanel
            result={current.result}
            reason={current.reason}
            pgnHref={`/pgn/${topic}`}
            onAnalyse={() => void analyse()}
            analysing={analysing.busy}
          />
        ) : null}
        {analysing.error ? <ErrorText>{analysing.error}</ErrorText> : null}

        {live.status === 'reconnecting' ? (
          <p
            role="status"
            className="m-0 rounded-card border border-line-accent bg-surface-accent-soft px-3 py-2 text-sm"
          >
            Connection lost — reconnecting…
          </p>
        ) : null}
        {live.status === 'closed' && live.error ? (
          <ErrorText testId="game-live-error">{live.error}</ErrorText>
        ) : null}

        {offered && !waiting ? (
          <ClaimPanel
            disabled={command.busy}
            onClaim={(outcome) => void send({ kind: 'claim', outcome })}
            onWait={() => setWaiting(true)}
          />
        ) : null}

        {playing && current.deadlineAt ? (
          <p className="m-0 text-sm text-fg-secondary" data-testid="deadline">
            {`${mine !== null && current.sideToMove.toLowerCase() === mine ? 'Your move' : `Waiting for ${current.sideToMove === 'White' ? white : black}`} · ${timeLeft(current.deadlineAt, Date.parse(current.clockAt))}`}
          </p>
        ) : null}

        {engineToMove(current) ? (
          <p
            className="m-0 text-sm text-fg-secondary"
            aria-live="polite"
            data-testid="engine-thinking"
          >
            {`${current.engineSide === 'white' ? white : black} is thinking…`}
          </p>
        ) : null}

        <MoveList sans={sans} />

        {command.error ? <ErrorText testId="game-error">{command.error}</ErrorText> : null}

        {mine && playing ? (
          <GameControls
            view={current}
            meId={me.id}
            opponentId={opponentId}
            disabled={command.busy}
            onCommand={(action) => void send(action)}
            drawAllowed={!againstEngine}
          />
        ) : null}
        {!mine ? <p className="m-0 text-sm text-fg-muted">You are watching this game.</p> : null}
      </div>
    </div>
  )
}
