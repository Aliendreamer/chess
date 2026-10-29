import { use, useCallback, useEffect, useState } from 'react'
import { createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/react-router'
import {
  STANDARD_START,
  applyOptimistic,
  clickSquare,
  engineName,
  legalTargets,
  marksFor,
  needsPromotion,
  pieceAt,
  premoveClick,
  resolvePremove,
  uciSquares,
} from '@chess/core'
import {
  Board,
  Button,
  EngineLines,
  ErrorText,
  EvalBar,
  EvaluationTicks,
  MoveList,
  MoveNav,
  Panel,
  PreferencesContext,
  PromotionPicker,
  REVIEW_POLL_MS,
  ReviewPanel,
  previewLine,
  useAnalysis,
  useAutoEvaluate,
  useCommand,
  useReview,
} from '@chess/ui'
import type { SquarePair } from '@chess/core'
import type { EvaluationShown, PreviewState } from '@chess/ui'
import type { EngineStatus } from '#/lib/engine'
import { GameEndPanel, PlayerLine } from '#/components/play'
import {
  PERSON_NAME,
  askToResign,
  engineMove,
  engineToMove,
  lastPersonPly,
  loadGame,
  offerDraw,
  personMove,
  resign,
  takeBack,
  toMove,
} from '#/lib/data/play'
import { loadReview, reviewable, runReview, startReview } from '#/lib/data/review'
import { updatePreferences } from '#/lib/data/settings'

export const Route = createFileRoute('/games/$id')({
  loader: async ({ context: { app }, params }) => {
    const game = await loadGame(app.db, params.id)
    if (!game) throw notFound()
    return game
  },
  component: GamePage,
})

type Promotion = 'q' | 'r' | 'b' | 'n'

/**
 * A game against the computer (desktop-app D6): the person moves by drag or click, the engine answers on its turn
 * (also after a restart, for a game left in play), the move list walks back through the game, and a finished game
 * offers a new one, its PGN and the analysis board. The person's move shows at once while it is saved, and a move made
 * on the engine's turn is a premove, played as soon as the engine has answered (if it is still legal). A move made on
 * an earlier position (picked in the move list) plays on from there, the later moves gone; so does Play from here.
 */
function GamePage() {
  const { app } = Route.useRouteContext()
  const loaded = Route.useLoaderData()
  const prefs = use(PreferencesContext)
  const router = useRouter()
  const navigate = useNavigate()
  const [game, setGame] = useState(loaded)
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  // The person's move, shown before it is saved.
  const [pending, setPending] = useState<{ fen: string; uci: string } | null>(null)
  const [premove, setPremove] = useState<SquarePair | null>(null)
  const [thinking, setThinking] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [engine, setEngine] = useState<EngineStatus>(app.engines.play.state)
  const command = useCommand()
  const [preview, setPreview] = useState<PreviewState | null>(null)
  // The engine's answer to a declined offer (draw, or a request to resign), until the next move.
  const [declined, setDeclined] = useState<string | null>(null)

  // The engine review (game-review): started by itself once the game has ended, read while it runs.
  const ended = game.status === 'ended'
  const load = useCallback(() => loadReview(app.db, game.id), [app, game.id])
  const start = useCallback(() => startReview(app.db, app.evaluator, game.id), [app, game.id])
  const reviewing = useReview(null, load, start, REVIEW_POLL_MS, ended)
  const reviewed = reviewing.view && reviewing.view.status !== 'none' ? reviewing.view : null
  useEffect(() => {
    if (reviewable(game)) void runReview(app.db, app.evaluator, game.id).catch(() => undefined)
  }, [app, game])

  useEffect(() => setGame(loaded), [loaded])
  useEffect(() => app.engines.play.subscribe(setEngine), [app])

  // The engine's turn: asked whenever it is to move, also for a game left in play when the app closed.
  useEffect(() => {
    // Not (or no longer, after a take-back) the engine's turn: nothing to wait for.
    if (!engineToMove(game)) {
      setThinking(false)
      return
    }
    let live = true
    setThinking(true)
    setEngineError(null)
    engineMove(app.db, app.player, game.id)
      .then((next) => {
        if (live && next) setGame(next)
      })
      .catch((e: unknown) => {
        if (live) setEngineError(e instanceof Error ? e.message : 'The engine did not answer.')
      })
      .finally(() => {
        if (live) setThinking(false)
      })
    return () => {
      live = false
    }
  }, [app, game])

  const shownPly = viewPly ?? game.ply
  const fenAt = (ply: number) =>
    ply === 0 ? STANDARD_START : (game.moves[ply - 1]?.fenAfter ?? game.fen)
  // The engine's better line, when one of its moves is clicked in the review, is shown on the board.
  const previewMove = preview ? reviewed?.moves[preview.ply - 1] : undefined
  const lined =
    preview && previewMove
      ? previewLine(fenAt(preview.ply - 1), previewMove.line, preview.upTo)
      : null
  const live = viewPly === null || viewPly === game.ply
  const fen = lined?.fen ?? (pending && live ? pending.fen : fenAt(shownPly))

  // The evaluation while playing (the preferences' play switches, both off by default): the position shown, asked of
  // the second Stockfish at the quick think once it settles.
  const [shown, setShown] = useState<EvaluationShown>({ bar: prefs.playBar, line: prefs.playLines })
  const evaluating = shown.bar || shown.line
  const [request] = useState(
    () => (input: Parameters<typeof app.evaluator.request>[0]) => app.evaluator.request(input),
  )
  const analysis = useAnalysis(request, 'quick')
  useAutoEvaluate(analysis, fen, evaluating)
  const evaluation = evaluating ? analysis.evaluationOf(fen) : null
  function show(next: EvaluationShown) {
    setShown(next)
    void updatePreferences(app.db, { playBar: next.bar, playLines: next.line }).then(() =>
      router.invalidate(),
    )
  }
  const playing = game.status === 'playing'
  const side = game.personColor === 'white' ? 'w' : 'b'
  // The person may move in the position shown when it is theirs: the current one, or an earlier one to play on from.
  const myTurn = playing && !lined && !pending && !command.busy && fen.split(' ')[1] === side
  // On the engine's turn (or while the person's move is saved) a move is queued as a premove.
  const premoves = playing && live && !myTurn
  const engineLabel = engineName(game.level)

  // Back to the position looked at in the move list, or else to before the person's last move; a queued premove goes
  // with it. Any number of moves, the engine's too. Always to the person's turn: a position where the engine is to
  // move goes one further back, or the engine would only play its move again.
  const backTo =
    viewPly !== null && viewPly < game.ply
      ? viewPly > 0 && fenAt(viewPly).split(' ')[1] !== side
        ? viewPly - 1
        : viewPly
      : undefined

  async function play(uci: string, base = fen) {
    setSelected(null)
    setPromotion(null)
    setDeclined(null)
    const branch = live ? undefined : backTo
    const after = applyOptimistic(base, uci)
    if (after) setPending({ fen: after, uci })
    setViewPly(null)
    const next = await command.run(async () => {
      if (branch !== undefined) {
        const rewound = await takeBack(app.db, game.id, branch)
        if (!rewound.ok) return rewound
      }
      return personMove(app.db, game.id, uci)
    })
    if (next) {
      setGame(next)
      setViewPly(null)
    }
    setPending(null)
  }

  // The engine has answered: play the queued premove if it is still legal, else drop it.
  useEffect(() => {
    if (!premove || pending || !playing || toMove(game) !== game.personColor) return
    setPremove(null)
    const uci = resolvePremove(game.fen, premove)
    if (uci) void play(uci, game.fen)
  }, [game])

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
    void play(`${from}${to}`)
    return true
  }

  function onSquareClick(square: string) {
    if (!myTurn) {
      if (!premoves) return
      const queued = premoveClick(fen, side, selected, square)
      setSelected(queued.selected)
      setPremove(queued.premove)
      return
    }
    const result = clickSquare(fen, side, selected, square)
    setSelected(result.selected)
    if (!result.move) return
    if (needsPromotion(fen, result.move.from, result.move.to)) setPromotion(result.move)
    else void play(`${result.move.from}${result.move.to}`)
  }

  async function back() {
    setPremove(null)
    setSelected(null)
    setPromotion(null)
    setPreview(null)
    setDeclined(null)
    const next = await command.run(() => takeBack(app.db, game.id, backTo))
    if (next) {
      setGame(next)
      setViewPly(null)
    }
  }

  // A draw offer or a request to resign: the engine answers from the analysis engine's look at the position.
  async function offer(kind: 'draw' | 'resign') {
    setDeclined(null)
    const answer = await command.run(() =>
      (kind === 'draw' ? offerDraw : askToResign)(app.db, app.evaluator, game.id),
    )
    if (!answer) return
    setGame(answer.game)
    if (!answer.accepted)
      setDeclined(
        kind === 'draw'
          ? `${engineLabel} declines the draw.`
          : `${engineLabel} does not resign: it plays on.`,
      )
  }

  async function savePgn() {
    if (!game.pgn) return
    await app.saveText(`chess-${game.createdAt.slice(0, 10)}-${game.id.slice(0, 8)}.pgn`, game.pgn)
  }

  const top = game.personColor === 'white' ? 'black' : 'white'
  const nameOf = (color: 'white' | 'black') =>
    color === game.personColor ? PERSON_NAME : engineLabel
  const status =
    engine === 'restarting'
      ? 'The engine is restarting…'
      : thinking
        ? `${engineLabel} is thinking…`
        : game.status === 'playing' && myTurn
          ? live
            ? 'Your move.'
            : 'Your move from here: the later moves will be gone.'
          : null

  return (
    <div className="flex items-start justify-center gap-8" data-layout="wide">
      {/* The board fits the window's height (the names, gaps and the page's padding take ~10rem; 12rem leaves room
          for rounding), so the whole game is on screen without scrolling and a drag never scrolls the page; on a big
          screen it grows past the club's 600px. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 [--board-max:calc(100dvh-12rem)] max-w-(--board-max)">
        <PlayerLine
          name={nameOf(top)}
          color={top}
          toMove={game.status === 'playing' && toMove(game) === top}
        />
        <div className="flex gap-2">
          {shown.bar ? <EvalBar evaluation={evaluation} orientation={game.personColor} /> : null}
          <div className="min-w-0 flex-1">
            <Board
              fen={fen}
              orientation={game.personColor}
              lastMove={
                lined
                  ? lined.lastMove
                  : uciSquares(pending && live ? pending.uci : game.moves[shownPly - 1]?.uci)
              }
              selected={selected}
              targets={selected && myTurn ? legalTargets(fen, selected) : []}
              premove={premove}
              onRightClick={() => {
                setPremove(null)
                setSelected(null)
              }}
              {...(myTurn || premoves
                ? {
                    onSquareClick,
                    onDrop,
                    canDrag: (square: string) => pieceAt(fen, square)?.color === side,
                  }
                : {})}
            />
          </div>
        </div>
        {promotion ? (
          <PromotionPicker
            color={game.personColor}
            onPick={(piece: Promotion) => void play(`${promotion.from}${promotion.to}${piece}`)}
            onCancel={() => setPromotion(null)}
          />
        ) : null}
        <PlayerLine
          name={nameOf(game.personColor)}
          color={game.personColor}
          toMove={game.status === 'playing' && toMove(game) === game.personColor}
        />
      </div>
      {/* Beside the board and as tall as it: the moves scroll inside, the engine's switches and the buttons stay at
          the bottom. */}
      <aside className="flex w-80 shrink-0 flex-col gap-4 self-stretch 2xl:w-[360px]">
        <Panel variant="filled" className="min-h-0 flex-1 gap-3">
          <p
            className="m-0 min-h-5 text-sm text-fg-secondary"
            data-testid="game-status"
            role="status"
          >
            {status}
          </p>
          {declined ? (
            <p className="m-0 text-sm text-fg-primary" data-testid="offer-declined">
              {declined}
            </p>
          ) : null}
          {engineError ? <ErrorText>{engineError}</ErrorText> : null}
          {command.error ? <ErrorText>{command.error}</ErrorText> : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MoveList
              sans={game.moves.map((m) => m.san)}
              viewPly={viewPly}
              onSelect={(ply) => {
                setPreview(null)
                setViewPly(ply === game.ply ? null : ply)
              }}
              {...(reviewed ? { marks: marksFor(reviewed.moves) } : {})}
            />
          </div>
          <MoveNav
            onStart={() => setViewPly(0)}
            onBack={() => setViewPly(Math.max(0, shownPly - 1))}
            onForward={() => setViewPly(shownPly + 1 >= game.ply ? null : shownPly + 1)}
            onEnd={() => setViewPly(null)}
          />
          <EvaluationTicks
            shown={shown}
            onChange={show}
            note="These run a second Stockfish beside the one you play: it keeps a processor core busy, which can slow a weaker machine."
          />
          {shown.line ? (
            <EngineLines
              fen={fen}
              evaluation={evaluation}
              {...(myTurn ? { onPlay: (uci: string) => void play(uci) } : {})}
            />
          ) : null}
          {playing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  command.busy ||
                  pending !== null ||
                  (backTo === undefined && lastPersonPly(game) === 0)
                }
                onClick={() => void back()}
              >
                {backTo === undefined ? 'Take back' : 'Play from here'}
              </Button>
              <Button
                disabled={command.busy}
                onClick={() =>
                  void command
                    .run(() => resign(app.db, game.id))
                    .then((next) => next && setGame(next))
                }
              >
                Resign
              </Button>
              <Button disabled={command.busy} onClick={() => void offer('draw')}>
                Offer draw
              </Button>
              <Button disabled={command.busy} onClick={() => void offer('resign')}>
                Ask to resign
              </Button>
            </div>
          ) : null}
        </Panel>
        {playing ? null : (
          <GameEndPanel
            game={game}
            onNewGame={() => void navigate({ to: '/' })}
            onSavePgn={() => void savePgn()}
            onAnalyse={() => void navigate({ to: '/analysis', search: { game: game.id } })}
          />
        )}
        {ended ? (
          <ReviewPanel
            review={reviewing.view}
            mine={game.personColor}
            canStart={reviewable(game)}
            busy={reviewing.busy}
            error={reviewing.error}
            onStart={() => void reviewing.start()}
            current={shownPly}
            onSelect={(ply) => {
              setPreview(null)
              setViewPly(ply === game.ply ? null : ply)
            }}
            preview={preview}
            onPreview={setPreview}
          />
        ) : null}
      </aside>
    </div>
  )
}
