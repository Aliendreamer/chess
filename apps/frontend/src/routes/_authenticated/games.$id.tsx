import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import type { GameCommand, GameSummary, GameView, MoveItem } from '#/lib/games'
import type { LiveFrame } from '#/lib/live'
import type { Me } from '#/lib/auth'
import type { SquarePair } from '#/lib/board'
import type { InviteView } from '#/lib/play'
import {
  getGameMoves,
  getGamePage,
  getGameSummary,
  getReview,
  postGameCommand,
  postPractiseGame,
  postRematch,
  postStartEngineGame,
  postStartReview,
} from '#/lib/server/api'
import {
  CORRESPONDENCE,
  PRESETS,
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
import { applyFrame, liveStatusText, liveTopic, useLiveTopic } from '#/lib/live'
import {
  applyOptimistic,
  clickSquare,
  legalTargets,
  needsPromotion,
  pieceAt,
} from '#/lib/moveInput'
import { material, premoveClick, replay, resolvePremove, uciSquares } from '#/lib/board'
import { pageTitle, rematchState, tabState, useTabSignals } from '#/lib/feedback'
import { isInviteView } from '#/lib/play'
import { REVIEW_POLL_MS, marksFor, useReview } from '#/lib/review'
import { ReviewPanel } from '#/components/review'
import {
  Board,
  CategoryMark,
  ClaimPanel,
  FlipIcon,
  GameControls,
  GameOverCard,
  GameResultPanel,
  MoveList,
  MoveNav,
  PlayerStrip,
  PromotionPicker,
  RematchOffer,
} from '#/components/games'
import { Button, ErrorText, buttonClass, useCommand } from '#/components/ui'

/**
 * A game (players and spectators). SSR renders the loader's state; the `game:{id}` frames then drive it. Moves
 * are shown at once with chess.js and always posted — the server's answer or next frame is the truth (D3).
 */
export const Route = createFileRoute('/_authenticated/games/$id')({
  loader: ({ params }) => getGamePage({ data: params.id }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: pageTitle(
          loaderData?.summary
            ? `${loaderData.summary.white} vs ${loaderData.summary.black}`
            : 'Game',
        ),
      },
    ],
  }),
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
  const navigate = useNavigate()

  // A finished game opens as a new study of mine (studies D5); the page stays if the server refuses.
  /** Opens the finished game on the analysis board (analysis-board); Save as study there keeps it. */
  function analyse() {
    void navigate({ to: '/analysis', search: { game: id } })
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

  const offered = current.claimableBy === me.id && current.status !== 'ended'
  useEffect(() => {
    if (!offered) setWaiting(false)
  }, [offered])

  const mine = myColor(current, me.id)
  // Flip (game-page-navigation): this page view only, on top of the viewer's own side.
  const [flipped, setFlipped] = useState(false)
  const ownSide = orientation(current, me.id)
  const side = flipped ? (ownSide === 'white' ? 'black' : 'white') : ownSide
  const playing = current.status !== 'ended'
  const myTurn =
    mine !== null && playing && current.sideToMove === mine && !pending && !command.busy
  const fen = pending?.fen ?? current.fen
  const lastUci = pending?.uci ?? current.lastUci
  const lastMove = uciSquares(lastUci)
  const targets = selected && myTurn ? legalTargets(fen, selected) : []
  const myLetter = mine === 'white' ? 'w' : 'b'
  // Premoves only where waiting is short (board-look): timed games against a person.
  const premoves =
    mine !== null && playing && hasClock(current.timeControl) && current.engineSide == null
  const [premove, setPremove] = useState<SquarePair | null>(null)

  // The opponent's move made it my turn: play the queued premove if it is still legal, else drop it.
  useEffect(() => {
    if (!premove) return
    if (!playing || current.sideToMove !== mine) return
    setPremove(null)
    const uci = resolvePremove(current.fen, premove)
    if (uci) move(uci.slice(0, 2), uci.slice(2, 4), uci[4] as 'q' | undefined, current.fen)
  }, [seq])

  async function send(action: GameCommand) {
    const view = await command.run(() => postGameCommand({ data: { id, command: action } }))
    if (view) setAnswered({ topic: liveTopic('game', topic), seq: view.seq, payload: view })
    else setPending(null) // refused: the board snaps back to the last server view
  }

  function move(from: string, to: string, promote?: 'q' | 'r' | 'b' | 'n', base = fen) {
    const uci = `${from}${to}${promote ?? ''}`
    const after = applyOptimistic(base, uci)
    if (after) setPending({ fen: after, uci })
    void send({ kind: 'move', uci })
  }

  function onSquareClick(square: string) {
    if (!mine) return
    if (!myTurn) {
      if (!premoves) return
      const queued = premoveClick(fen, myLetter, selected, square)
      setSelected(queued.selected)
      setPremove(queued.premove)
      return
    }
    const result = clickSquare(fen, myLetter, selected, square)
    setSelected(result.selected)
    if (!result.move) return
    if (needsPromotion(fen, result.move.from, result.move.to)) {
      setPromotion(result.move)
      return
    }
    move(result.move.from, result.move.to)
  }

  /** A drag: on my turn a legal move is played (a promotion asks first); otherwise it queues a premove. */
  function onDrop(from: string, to: string): boolean {
    setSelected(null)
    if (!myTurn) {
      if (premoves) setPremove({ from, to })
      return false
    }
    if (!legalTargets(fen, from).includes(to)) return false
    if (needsPromotion(fen, from, to)) {
      setPromotion({ from, to })
      return false
    }
    move(from, to)
    return true
  }

  const canDrag = (square: string) => pieceAt(fen, square)?.color === myLetter

  const white = summary?.white ?? `Player ${current.whiteId}`
  const black = summary?.black ?? `Player ${current.blackId}`
  useTabSignals(tabState(current, me.id, { white, black }))
  const goToGame = (gameId: string) => void navigate({ to: '/games/$id', params: { id: gameId } })

  // The card over the board, only when the game ends while the page is open (game-feedback).
  const [gameOver, setGameOver] = useState(false)
  const seenStatus = useRef(current.status)
  useEffect(() => {
    if (seenStatus.current !== 'ended' && current.status === 'ended') setGameOver(true)
    seenStatus.current = current.status
  }, [current.status])

  // The rematch is the invite with this game's id, watched by the players once the game is over. Against the
  // computer it is simply a new engine game with the colours swapped.
  const rematchable = mine !== null && current.status === 'ended' && current.engineSide == null
  const rematchLive = useLiveTopic({
    kind: 'invite',
    id: topic,
    initial: undefined,
    isPayload: isInviteView,
    enabled: rematchable,
  })
  const [myOffer, setMyOffer] = useState<InviteView | null>(null)
  const rematching = useCommand()
  const rematch = rematchState(rematchLive.frame?.payload ?? myOffer ?? undefined, me.id)
  const rematchGame = rematch.kind === 'started' ? rematch.gameId : null
  useEffect(() => {
    if (rematchGame) goToGame(rematchGame)
  }, [rematchGame])

  async function askRematch() {
    if (current.engineSide != null) {
      const level = current.engineLevel ?? ''
      const color = mine === 'white' ? 'black' : 'white'
      const started = await rematching.run(() => postStartEngineGame({ data: { level, color } }))
      if (started) goToGame(started.gameId)
      return
    }
    const invite = await rematching.run(() => postRematch({ data: id }))
    if (invite) setMyOffer(invite)
  }

  const endActions = mine ? (
    <>
      <RematchOffer
        state={current.engineSide != null ? { kind: 'none' } : rematch}
        opponent={mine === 'white' ? black : white}
        busy={rematching.busy}
        onRematch={() => void askRematch()}
      />
      {(PRESETS as ReadonlyArray<string>).includes(current.timeControl) ? (
        <Link
          to="/"
          search={{ seek: current.timeControl }}
          className={buttonClass('outline', 'md', true)}
        >
          New opponent
        </Link>
      ) : null}
      {rematching.error ? <ErrorText>{rematching.error}</ErrorText> : null}
    </>
  ) : null
  const opponentId = mine === 'white' ? current.blackId : current.whiteId
  const againstEngine = current.engineSide != null
  const untimed = current.timeControl === UNTIMED
  const clockless = !hasClock(current.timeControl)
  // Looking back (game-page-navigation): null follows the game; a number is the ply on the board. A new move never
  // moves the view; reaching the last ply follows the game again.
  const positions = useMemo(() => replay(sans), [sans])
  const [viewPly, setViewPly] = useState<number | null>(null)
  const viewing = viewPly !== null && viewPly < positions.length - 1 ? viewPly : null
  const shown = viewing !== null ? positions[viewing] : undefined
  const go = (ply: number) => setViewPly(ply >= sans.length ? null : Math.max(0, ply))
  const step = (by: number) => go((viewing ?? sans.length) + by)
  const keys = useRef({ step, go })
  keys.current = { step, go }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const nav = keys.current
      if (event.key === 'ArrowLeft') nav.step(-1)
      else if (event.key === 'ArrowRight') nav.step(1)
      else if (event.key === 'Home') nav.go(0)
      else if (event.key === 'End') nav.go(Number.MAX_SAFE_INTEGER)
      else if (event.key === 'f') setFlipped((f) => !f)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const balance = material(shown?.fen ?? fen)

  // The engine review (game-review): only once the game has ended; its players may start it.
  const loadReview = useCallback(() => getReview({ data: topic }), [topic])
  const startReview = useCallback(() => postStartReview({ data: topic }), [topic])
  const reviewing = useReview(null, loadReview, startReview, REVIEW_POLL_MS, !playing)
  const reviewed = reviewing.view && reviewing.view.status !== 'none' ? reviewing.view : null
  const practising = useCommand()
  const [added, setAdded] = useState<number | null>(null)
  async function practise() {
    const answer = await practising.run(() => postPractiseGame({ data: topic }))
    if (answer) setAdded(answer.added)
  }

  const top = side === 'white' ? 'black' : 'white'
  const strip = (color: 'white' | 'black') => {
    const toMove = playing && current.sideToMove.toLowerCase() === color
    const you = mine === color
    return (
      <PlayerStrip
        testId={`strip-${color}`}
        name={color === 'white' ? white : black}
        playerId={color === 'white' ? current.whiteId : current.blackId}
        detail={[color, you && toMove ? 'your move' : null].filter(Boolean).join(' · ')}
        {...(clockless ? {} : { ms: color === 'white' ? clocks.whiteMs : clocks.blackMs })}
        active={toMove && current.ply >= 2}
        material={balance[color]}
        opponentColor={color === 'white' ? 'b' : 'w'}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 shell:grid-cols-[minmax(0,var(--board-max))_minmax(0,380px)] shell:gap-8">
      <div className="flex max-w-(--board-max) flex-col gap-3">
        {strip(top)}
        <div data-my-turn={myTurn} className="relative">
          <Board
            fen={shown?.fen ?? fen}
            orientation={side}
            lastMove={shown ? shown.lastMove : lastMove}
            selected={shown ? null : selected}
            targets={shown ? [] : targets}
            premove={shown ? null : premove}
            {...(shown
              ? { onSquareClick: () => setViewPly(null) }
              : myTurn || premoves
                ? { onSquareClick, onDrop, canDrag }
                : {})}
            onRightClick={() => setPremove(null)}
          />
          {gameOver && current.result ? (
            <GameOverCard
              result={current.result}
              reason={current.reason}
              onClose={() => setGameOver(false)}
            >
              {endActions}
              <Button block variant="outline" onClick={analyse}>
                Analyse
              </Button>
            </GameOverCard>
          ) : null}
        </div>
        {strip(side)}
        <MoveNav
          onStart={() => go(0)}
          onBack={() => step(-1)}
          onForward={() => step(1)}
          onEnd={() => setViewPly(null)}
        >
          <Button aria-label="Flip board" onClick={() => setFlipped((f) => !f)}>
            <FlipIcon />
          </Button>
          {shown ? (
            <Button variant="outline" onClick={() => setViewPly(null)}>
              Back to the game
            </Button>
          ) : null}
        </MoveNav>
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

      <div className="flex min-w-0 flex-col gap-5 shell:max-w-[380px]">
        <div>
          <div className="flex items-center gap-2 text-xs text-fg-secondary">
            <CategoryMark timeControl={current.timeControl} />
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

        {current.status === 'ended' && current.result ? (
          <GameResultPanel
            result={current.result}
            reason={current.reason}
            pgnHref={`/pgn/${topic}`}
            onAnalyse={analyse}
          />
        ) : null}
        {current.status === 'ended' && !gameOver ? endActions : null}
        {current.status === 'ended' ? (
          <ReviewPanel
            review={reviewing.view}
            mine={mine}
            canStart={mine !== null}
            busy={reviewing.busy}
            error={reviewing.error}
            onStart={() => void reviewing.start()}
            current={viewing ?? sans.length}
            onSelect={go}
            practice={{ busy: practising.busy, added, error: practising.error }}
            onPractise={() => void practise()}
          />
        ) : null}

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
            {`${mine !== null && current.sideToMove === mine ? 'Your move' : `Waiting for ${current.sideToMove === 'white' ? white : black}`} · ${timeLeft(current.deadlineAt, Date.parse(current.clockAt))}`}
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

        {/* On a phone the controls come before the move list (responsive-layout). */}
        <div className="max-shell:order-last">
          <MoveList
            sans={sans}
            viewPly={viewing}
            onSelect={go}
            {...(reviewed ? { marks: marksFor(reviewed.moves) } : {})}
          />
        </div>

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
