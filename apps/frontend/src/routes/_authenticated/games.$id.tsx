import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { GameSummary, GameView, MoveItem } from '#/lib/games'
import type { GameCommand } from '#/lib/server/game-loaders'
import type { LiveFrame } from '#/lib/live'
import type { Me } from '#/lib/server/api-loaders'
import { getGameMoves, getGamePage, postGameCommand } from '#/lib/server/api'
import {
  category,
  isGameView,
  liveClocks,
  mergeMoves,
  myColor,
  orientation,
  reasonText,
  resultText,
  topicId,
} from '#/lib/games'
import { applyFrame } from '#/lib/live'
import { applyOptimistic, clickSquare, legalTargets, needsPromotion } from '#/lib/moveInput'
import { useLiveTopic } from '#/lib/useLiveTopic'
import { Board, PromotionPicker } from '#/components/chess/Board'
import { PlayerStrip } from '#/components/chess/Clock'
import { MoveList } from '#/components/chess/MoveList'
import { Button } from '#/components/core/Button'
import { Panel } from '#/components/core/Panel'

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

function Game({ id, me, view: loaded, summary, moves }: GameProps) {
  const topic = topicId(id)
  const initial = useMemo<LiveFrame<GameView>>(
    () => ({ topic: `game:${topic}`, seq: loaded.seq, payload: loaded }),
    [topic, loaded],
  )
  const live = useLiveTopic({ kind: 'game', id: topic, initial, isPayload: isGameView })
  // A command's own answer may arrive before its frame; the newer of the two is the view.
  const [answered, setAnswered] = useState<LiveFrame<GameView> | undefined>(undefined)
  const current = (
    answered && live.frame ? applyFrame(live.frame, answered) : (live.frame ?? answered ?? initial)
  ).payload

  const [sans, setSans] = useState(() => moves.map((m) => m.san))
  const [pending, setPending] = useState<Pending | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const clocks = useLocalClocks(current)

  const mine = myColor(current, me.id)
  const side = orientation(current, me.id)
  const playing = current.status !== 'Ended'
  const myTurn =
    mine !== null && playing && current.sideToMove.toLowerCase() === mine && !pending && !busy
  const fen = pending?.fen ?? current.fen
  const lastUci = pending?.uci ?? current.lastUci
  const lastMove = lastUci ? { from: lastUci.slice(0, 2), to: lastUci.slice(2, 4) } : null
  const targets = selected ? legalTargets(fen, selected) : []

  async function send(command: GameCommand) {
    setBusy(true)
    setError(null)
    try {
      const outcome = await postGameCommand({ data: { id, command } })
      if (outcome.ok) {
        setAnswered({ topic: `game:${topic}`, seq: outcome.view.seq, payload: outcome.view })
      } else {
        setPending(null) // the board snaps back to the last server view
        setError(outcome.error)
      }
    } finally {
      setBusy(false)
    }
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
  const top = side === 'white' ? 'black' : 'white'
  const strip = (color: 'white' | 'black') => {
    const toMove = playing && current.sideToMove.toLowerCase() === color
    const you = mine === color
    return (
      <PlayerStrip
        testId={`strip-${color}`}
        name={color === 'white' ? white : black}
        detail={[color, you && toMove ? 'your move' : null].filter(Boolean).join(' · ')}
        ms={color === 'white' ? clocks.whiteMs : clocks.blackMs}
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
            {`${category(current.timeControl)} ${current.timeControl} · `}
            <span className="font-mono" aria-live="polite" data-testid="game-relay">
              {live.status === 'live'
                ? 'live'
                : live.status === 'connecting'
                  ? 'connecting…'
                  : 'disconnected — reload to reconnect'}
            </span>
          </div>
          <h1 className="m-0 mt-0.5 font-display text-display-md font-normal">
            {white} <span className="text-fg-muted">vs</span> {black}
          </h1>
        </div>

        {current.status === 'Ended' && current.result ? (
          <Panel variant="accent" title="Result">
            <p className="m-0 font-display text-display-sm" data-testid="game-result">
              {resultText(current.result)}
            </p>
            {current.reason ? (
              <p className="m-0 text-sm text-fg-secondary">{reasonText(current.reason)}</p>
            ) : null}
          </Panel>
        ) : null}

        <MoveList sans={sans} />

        {error ? (
          <p role="status" className="m-0 text-sm text-status-loss" data-testid="game-error">
            {error}
          </p>
        ) : null}

        {mine && playing ? (
          <Controls
            view={current}
            meId={me.id}
            opponentId={opponentId}
            disabled={busy}
            onCommand={(command) => void send(command)}
          />
        ) : null}
        {!mine ? <p className="m-0 text-sm text-fg-muted">You are watching this game.</p> : null}
      </div>
    </div>
  )
}

interface ControlsProps {
  view: GameView
  meId: number
  opponentId: number
  disabled: boolean
  onCommand: (command: GameCommand) => void
}

/** What a player may ask for right now; the server still decides whether it is allowed. */
function Controls({ view, meId, opponentId, disabled, onCommand }: ControlsProps) {
  if (view.ply < 2) {
    return (
      <Button block disabled={disabled} onClick={() => onCommand({ kind: 'abort' })}>
        Abort
      </Button>
    )
  }
  if (view.drawOfferedBy === opponentId) {
    return (
      <div className="flex flex-col gap-2">
        <p className="m-0 text-sm text-fg-body">Your opponent offers a draw.</p>
        <div className="flex gap-2">
          <Button
            block
            variant="outline"
            disabled={disabled}
            onClick={() => onCommand({ kind: 'draw-accept' })}
          >
            Accept draw
          </Button>
          <Button block disabled={disabled} onClick={() => onCommand({ kind: 'draw-decline' })}>
            Decline
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <Button
        block
        disabled={disabled || view.drawOfferedBy === meId}
        onClick={() => onCommand({ kind: 'draw-offer' })}
      >
        {view.drawOfferedBy === meId ? 'Draw offered' : 'Offer draw'}
      </Button>
      <Button block disabled={disabled} onClick={() => onCommand({ kind: 'resign' })}>
        Resign
      </Button>
    </div>
  )
}

/** The clocks, counted down locally since the view arrived (D5); re-based on every new view. */
function useLocalClocks(view: GameView): { whiteMs: number; blackMs: number } {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    setElapsed(0)
    if (view.status !== 'Playing' || view.ply < 2) return
    const arrived = performance.now()
    const timer = setInterval(() => setElapsed(performance.now() - arrived), 100)
    return () => clearInterval(timer)
  }, [view.seq, view.status, view.ply])
  return liveClocks(view, elapsed)
}
