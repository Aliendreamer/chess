import { useEffect, useState } from 'react'
import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router'
import {
  STANDARD_START,
  clickSquare,
  engineName,
  legalTargets,
  needsPromotion,
  pieceAt,
  uciSquares,
} from '@chess/core'
import {
  Board,
  Button,
  ErrorText,
  MoveList,
  MoveNav,
  Panel,
  PromotionPicker,
  useCommand,
} from '@chess/ui'
import type { EngineStatus } from '#/lib/engine'
import { GameEndPanel, PlayerLine } from '#/components/play'
import {
  PERSON_NAME,
  engineMove,
  engineToMove,
  loadGame,
  personMove,
  resign,
  toMove,
} from '#/lib/data/play'

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
 * offers a new one, its PGN and the analysis board.
 */
function GamePage() {
  const { app } = Route.useRouteContext()
  const loaded = Route.useLoaderData()
  const navigate = useNavigate()
  const [game, setGame] = useState(loaded)
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [engine, setEngine] = useState<EngineStatus>(app.engines.play.state)
  const command = useCommand()

  useEffect(() => setGame(loaded), [loaded])
  useEffect(() => app.engines.play.subscribe(setEngine), [app])

  // The engine's turn: asked whenever it is to move, also for a game left in play when the app closed.
  useEffect(() => {
    if (!engineToMove(game)) return
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
  const fen = shownPly === 0 ? STANDARD_START : (game.moves[shownPly - 1]?.fenAfter ?? game.fen)
  const live = viewPly === null || viewPly === game.ply
  const myTurn = game.status === 'playing' && toMove(game) === game.personColor && live
  const side = game.personColor === 'white' ? 'w' : 'b'
  const engineLabel = engineName(game.level)

  async function play(uci: string) {
    setSelected(null)
    setPromotion(null)
    const next = await command.run(() => personMove(app.db, game.id, uci))
    if (next) {
      setGame(next)
      setViewPly(null)
    }
  }

  function onDrop(from: string, to: string): boolean {
    if (!myTurn || !legalTargets(fen, from).includes(to)) return false
    if (needsPromotion(fen, from, to)) {
      setPromotion({ from, to })
      return false
    }
    void play(`${from}${to}`)
    return true
  }

  function onSquareClick(square: string) {
    if (!myTurn) return
    const result = clickSquare(fen, side, selected, square)
    setSelected(result.selected)
    if (!result.move) return
    if (needsPromotion(fen, result.move.from, result.move.to)) setPromotion(result.move)
    else void play(`${result.move.from}${result.move.to}`)
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
          ? 'Your move.'
          : null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-8" data-layout="wide">
      <div className="flex flex-col gap-3">
        <PlayerLine
          name={nameOf(top)}
          color={top}
          toMove={game.status === 'playing' && toMove(game) === top}
        />
        <Board
          fen={fen}
          orientation={game.personColor}
          lastMove={uciSquares(game.moves[shownPly - 1]?.uci)}
          selected={selected}
          targets={selected && myTurn ? legalTargets(fen, selected) : []}
          {...(myTurn
            ? {
                onSquareClick,
                onDrop,
                canDrag: (square: string) => pieceAt(fen, square)?.color === side,
              }
            : {})}
        />
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
      <aside className="flex flex-col gap-4">
        {status ? (
          <p className="m-0 text-sm text-fg-secondary" data-testid="game-status" role="status">
            {status}
          </p>
        ) : null}
        {engineError ? <ErrorText>{engineError}</ErrorText> : null}
        {command.error ? <ErrorText>{command.error}</ErrorText> : null}
        <MoveList
          sans={game.moves.map((m) => m.san)}
          viewPly={viewPly}
          onSelect={(ply) => setViewPly(ply === game.ply ? null : ply)}
        />
        <MoveNav
          onStart={() => setViewPly(0)}
          onBack={() => setViewPly(Math.max(0, shownPly - 1))}
          onForward={() => setViewPly(shownPly + 1 >= game.ply ? null : shownPly + 1)}
          onEnd={() => setViewPly(null)}
        />
        {game.status === 'playing' ? (
          <Panel variant="quiet" className="flex-row gap-2">
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
          </Panel>
        ) : (
          <GameEndPanel
            game={game}
            onNewGame={() => void navigate({ to: '/' })}
            onSavePgn={() => void savePgn()}
            onAnalyse={() => void navigate({ to: '/analysis', search: { game: game.id } as never })}
          />
        )}
      </aside>
    </div>
  )
}
