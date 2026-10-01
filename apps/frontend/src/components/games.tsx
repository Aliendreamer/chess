import { Fragment, useEffect, useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import type { ChessboardOptions, PieceRenderObject } from 'react-chessboard'
import type { ReactNode } from 'react'
import type { SideMaterial, SquarePair } from '#/lib/board'
import type { ClaimOutcome, Color, EndReason, GameCommand, GameView, PgnResult } from '#/lib/games'
import type { Piece } from '#/lib/moveInput'
import type { MyGameItem } from '#/lib/play'
import { Button, Panel } from '#/components/ui'
import { outcomeFor } from '#/lib/play'
import { formatClock, pairMoves, reasonText, resultText, timeLeft } from '#/lib/games'
import { squaresFor } from '#/lib/moveInput'
import { pieceSrc, squareStyles } from '#/lib/board'

const NAME: Record<Piece['type'], string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}

/** A Cburnett piece (board-look). Decorative: the square or button around it carries the name. */
export function PieceImage({ piece, className }: { piece: Piece; className?: string }) {
  return (
    <img
      src={pieceSrc(piece.color, piece.type)}
      alt=""
      draggable={false}
      className={className ?? 'size-full'}
    />
  )
}

const PIECE_RENDERERS: PieceRenderObject = Object.fromEntries(
  (['w', 'b'] as const).flatMap((color) =>
    (['k', 'q', 'r', 'b', 'n', 'p'] as const).map((type) => [
      `${color}${type.toUpperCase()}`,
      () => <PieceImage piece={{ color, type }} />,
    ]),
  ),
)

// Lichess's green, and red, blue and yellow for shift-, ctrl- and alt-drags.
const ARROW_OPTIONS = {
  ...defaultArrowOptions,
  colors: {
    default: 'rgba(21, 120, 27, 0.8)',
    shift: 'rgba(160, 30, 20, 0.8)',
    ctrl: 'rgba(20, 60, 160, 0.8)',
    alt: 'rgba(230, 160, 0, 0.8)',
    meta: 'rgba(20, 60, 160, 0.8)',
  },
}

export interface BoardProps {
  fen: string
  orientation: Color
  lastMove?: SquarePair | null
  selected?: string | null
  /** Legal destinations of the selected piece (dots, rings on captures). */
  targets?: ReadonlyArray<string>
  /** A queued premove, tinted until it is played or dropped. */
  premove?: SquarePair | null
  /** Without it the board is read-only (spectators, ended games, earlier positions). */
  onSquareClick?: (square: string) => void
  /** A piece dropped on another square; false puts it back. Without it nothing can be dragged. */
  onDrop?: (from: string, to: string) => boolean
  /** Whether the piece on `square` may be picked up (default: any piece, when `onDrop` is set). */
  canDrag?: (square: string) => boolean
  /** A right-click: circles the square, and lets the page drop a premove. */
  onRightClick?: () => void
  /** Piece slide time; 0 under prefers-reduced-motion whatever is passed. */
  animationMs?: number
}

/** The board's frame: one size for the placeholder and the live board, so nothing moves when it appears. */
const FRAME = 'aspect-square w-full max-w-(--board-max) overflow-hidden rounded-board'

/**
 * The board (board-look): react-chessboard with Cburnett pieces, the active board theme and lichess highlights.
 * Drawn in the browser only; the server renders the empty board in its place. Presentational: what may be clicked,
 * dragged or premoved is the page's decision, and the server still decides every move.
 */
export function Board({
  fen,
  orientation,
  lastMove,
  selected,
  targets = [],
  premove,
  onSquareClick,
  onDrop,
  canDrag,
  onRightClick,
  animationMs = 200,
}: BoardProps) {
  const id = `board${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const mounted = useMounted()
  const reducedMotion = useReducedMotion()
  const [circles, setCircles] = useState<ReadonlyArray<string>>([])
  // Drawn shapes belong to one position.
  useEffect(() => setCircles([]), [fen])

  if (!mounted) return <BoardPlaceholder orientation={orientation} />

  const options: ChessboardOptions = {
    id,
    position: fen,
    boardOrientation: orientation,
    pieces: PIECE_RENDERERS,
    lightSquareStyle: { backgroundColor: 'var(--board-light)' },
    darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
    lightSquareNotationStyle: { color: 'var(--board-dark)' },
    darkSquareNotationStyle: { color: 'var(--board-light)' },
    alphaNotationStyle: {
      fontSize: 'max(9px, 1.6cqi)',
      fontWeight: 600,
      position: 'absolute',
      bottom: 1,
      right: 4,
    },
    numericNotationStyle: {
      fontSize: 'max(9px, 1.6cqi)',
      fontWeight: 600,
      position: 'absolute',
      top: 2,
      left: 3,
    },
    squareStyles: squareStyles(fen, { lastMove, selected, targets, premove, circles }),
    animationDurationInMs: reducedMotion ? 0 : animationMs,
    showAnimations: !reducedMotion && animationMs > 0,
    allowDragging: onDrop !== undefined,
    allowDragOffBoard: false,
    allowDrawingArrows: true,
    arrowOptions: ARROW_OPTIONS,
    clearArrowsOnPositionChange: true,
    ...(canDrag ? { canDragPiece: ({ square }) => square !== null && canDrag(square) } : {}),
    ...(onSquareClick ? { onSquareClick: ({ square }) => onSquareClick(square) } : {}),
    ...(onDrop
      ? {
          onPieceDrop: ({ sourceSquare, targetSquare }) =>
            targetSquare !== null &&
            targetSquare !== sourceSquare &&
            onDrop(sourceSquare, targetSquare),
        }
      : {}),
    onSquareRightClick: ({ square }) => {
      setCircles((now) =>
        now.includes(square) ? now.filter((c) => c !== square) : [...now, square],
      )
      onRightClick?.()
    },
  }
  return (
    <div role="group" aria-label="Chess board" className={`@container ${FRAME}`}>
      <Chessboard options={options} />
    </div>
  )
}

/** The server-rendered stand-in: the empty board in the theme's colours, every square named by `data-square`. */
export function BoardPlaceholder({ orientation }: { orientation: Color }) {
  return (
    <div aria-label="Chess board" className={`grid grid-cols-8 ${FRAME}`}>
      {squaresFor(orientation).map((square) => {
        const light = (square.charCodeAt(0) - 97 + Number(square[1])) % 2 === 1
        return (
          <div
            key={square}
            data-square={square}
            className={`aspect-square ${light ? 'bg-board-light' : 'bg-board-dark'}`}
          />
        )
      })}
    </div>
  )
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    // jsdom has no matchMedia; every browser does.
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export interface PromotionPickerProps {
  color: Color
  onPick: (piece: 'q' | 'r' | 'b' | 'n') => void
  onCancel: () => void
}

/** The four promotion choices, queen first. */
export function PromotionPicker({ color, onPick, onCancel }: PromotionPickerProps) {
  return (
    <div
      role="dialog"
      aria-label="Promote to"
      className="flex items-center gap-2 rounded-card border border-line-accent bg-surface-accent-soft p-2"
    >
      {(['q', 'r', 'b', 'n'] as const).map((type) => (
        <button
          key={type}
          type="button"
          aria-label={NAME[type]}
          onClick={() => onPick(type)}
          className="grid size-12 cursor-pointer place-items-center rounded-control bg-board-light p-1 hover:bg-board-dark"
        >
          <PieceImage piece={{ color: color === 'white' ? 'w' : 'b', type }} />
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="ml-1 cursor-pointer text-sm text-fg-secondary"
      >
        Cancel
      </button>
    </div>
  )
}

export function Clock({ ms, active = false }: { ms: number; active?: boolean }) {
  return (
    <span
      className={`rounded-control px-3.5 py-1.5 font-mono text-clock tabular-nums ${active ? 'bg-brass-400 text-fg-on-accent' : 'bg-surface-raised text-fg-secondary'}`}
    >
      {formatClock(ms)}
    </span>
  )
}

export interface PlayerStripProps {
  name: string
  /** A short caption: "white · your move". */
  detail: string
  ms?: number
  /** The side to move: its clock is the brass one. */
  active?: boolean
  /** This side's material surplus (game-page-navigation), drawn in the opponent's colour. */
  material?: SideMaterial
  opponentColor?: Piece['color']
  testId?: string
}

export function PlayerStrip({
  name,
  detail,
  ms,
  active = false,
  material,
  opponentColor = 'b',
  testId,
}: PlayerStripProps) {
  return (
    <div className="flex items-center justify-between gap-3" data-testid={testId}>
      <div className="flex min-w-0 flex-col">
        <span className="font-medium text-fg-primary">{name}</span>
        <span className="flex items-center gap-2 text-xs text-fg-secondary">
          {detail}
          {material && material.pieces.length + material.plus > 0 ? (
            <span className="flex items-center" aria-label="Material">
              {material.pieces.map((type, i) => (
                <PieceImage
                  key={i}
                  piece={{ color: opponentColor, type }}
                  className="-mr-1.5 size-4 first:ml-0"
                />
              ))}
              {material.plus > 0 ? (
                <span className="ml-2.5 font-mono" data-testid="material-plus">
                  +{material.plus}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </div>
      {ms !== undefined ? <Clock ms={ms} active={active} /> : null}
    </div>
  )
}

export interface MoveListProps {
  sans: ReadonlyArray<string>
  /** The ply on the board when looking back (1 = after White's first move); null or absent follows the game. */
  viewPly?: number | null
  /** Makes each move a button that shows the position after it. */
  onSelect?: (ply: number) => void
}

/** SAN in numbered rows; the move on the board is tinted. */
export function MoveList({ sans, viewPly = null, onSelect }: MoveListProps) {
  const rows = pairMoves(sans)
  const current = (viewPly ?? sans.length) - 1
  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">No moves yet.</p>
  }
  const cell = (san: string | undefined, index: number) => {
    const tint = current === index ? 'bg-brass-800' : ''
    if (san === undefined) return <li className="px-2.5 py-[7px]" />
    if (!onSelect) return <li className={`px-2.5 py-[7px] ${tint}`}>{san}</li>
    return (
      <li className="flex">
        <button
          type="button"
          aria-current={current === index}
          onClick={() => onSelect(index + 1)}
          className={`w-full cursor-pointer border-0 bg-transparent px-2.5 py-[7px] text-left font-mono text-sm text-fg-primary hover:bg-surface-hover ${tint}`}
        >
          {san}
        </button>
      </li>
    )
  }
  return (
    <ol
      aria-label="Moves"
      data-testid="move-list"
      className="m-0 grid max-h-80 list-none grid-cols-[36px_1fr_1fr] overflow-y-auto rounded-card border border-line-default p-0 font-mono text-sm text-fg-primary"
    >
      {rows.map(([white, black], i) => (
        <Fragment key={i}>
          <li className="bg-surface-card px-2.5 py-[7px] text-fg-muted">{i + 1}.</li>
          {cell(white, i * 2)}
          {cell(black, i * 2 + 1)}
        </Fragment>
      ))}
    </ol>
  )
}

export interface MoveNavProps {
  onStart: () => void
  onBack: () => void
  onForward: () => void
  onEnd: () => void
  /** Extra controls at the end of the bar (the game page's flip button). */
  children?: ReactNode
}

/** Start / back / forward / end through a game or a study line. */
export function MoveNav({ onStart, onBack, onForward, onEnd, children }: MoveNavProps) {
  return (
    <div className="flex gap-2" role="group" aria-label="Navigation">
      <Button aria-label="Start" onClick={onStart}>
        |◀
      </Button>
      <Button aria-label="Back" onClick={onBack}>
        ◀
      </Button>
      <Button aria-label="Forward" onClick={onForward}>
        ▶
      </Button>
      <Button aria-label="End" onClick={onEnd}>
        ▶|
      </Button>
      {children}
    </div>
  )
}

const OUTCOME_TONE = {
  win: 'text-status-win',
  loss: 'text-status-loss',
  draw: 'text-status-draw',
} as const

// Static class strings, so Tailwind sees them.
const COLUMNS = 'grid-cols-[40px_minmax(0,1fr)_80px_minmax(0,160px)]'
const COLUMNS_WITH_PGN = 'grid-cols-[40px_minmax(0,1fr)_80px_minmax(0,160px)_40px]'

export interface RecentGamesProps {
  games: ReadonlyArray<MyGameItem>
  /** A PGN download link on finished games (the history page). */
  pgn?: boolean
}

/** "My games" rows: result from my side, the opponent by name, the time control and how it ended. */
export function RecentGames({ games, pgn = false }: RecentGamesProps) {
  if (games.length === 0) {
    return <p className="m-0 text-sm text-fg-muted">No games yet.</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="recent-games">
      {games.map((game) => {
        const outcome = outcomeFor(game.result, game.color)
        const finished = game.status !== 'playing'
        return (
          <li
            key={game.gameId}
            className={`grid ${pgn ? COLUMNS_WITH_PGN : COLUMNS} items-baseline gap-4 border-b border-line-divider py-2.5`}
          >
            <span
              className={`font-mono font-medium ${outcome ? OUTCOME_TONE[outcome] : 'text-fg-muted'}`}
            >
              {!finished ? '…' : game.result ? resultText(game.result) : '—'}
            </span>
            <Link
              to="/games/$id"
              params={{ id: game.gameId }}
              className="truncate text-fg-primary no-underline hover:text-fg-accent"
            >
              vs {game.opponent}
            </Link>
            <span className="font-mono text-fg-secondary">{game.timeControl}</span>
            <span className="truncate text-sm text-fg-secondary">
              {!finished ? 'in play' : game.reason ? reasonText(game.reason) : ''}
            </span>
            {pgn ? (
              finished ? (
                <a href={`/pgn/${game.gameId}`} download className="font-mono text-sm no-underline">
                  PGN
                </a>
              ) : (
                <span />
              )
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** How a finished game ended, with its PGN. */
export function GameResultPanel({
  result,
  reason,
  pgnHref,
  onAnalyse,
  analysing = false,
}: {
  result: PgnResult
  reason: EndReason | null
  pgnHref: string
  /** Opens the game as a new study (studies D5). */
  onAnalyse?: () => void
  analysing?: boolean
}) {
  return (
    <Panel variant="accent" title="Result">
      <p className="m-0 font-display text-display-sm" data-testid="game-result">
        {resultText(result)}
      </p>
      <a href={pgnHref} download className="text-sm" data-testid="game-pgn">
        Download PGN
      </a>
      {reason ? <p className="m-0 text-sm text-fg-secondary">{reasonText(reason)}</p> : null}
      {onAnalyse ? (
        <Button variant="outline" disabled={analysing} onClick={onAnalyse}>
          Analyse
        </Button>
      ) : null}
    </Panel>
  )
}

/** The abandonment offer (presence-and-abandonment): claim the win, call it a draw, or keep waiting. */
export function ClaimPanel({
  disabled,
  onClaim,
  onWait,
}: {
  disabled: boolean
  onClaim: (outcome: ClaimOutcome) => void
  onWait: () => void
}) {
  return (
    <Panel variant="accent" title="Your opponent left" className="gap-3" testId="claim-panel">
      <p className="m-0 text-sm text-fg-body">
        They have been away for a minute. You can end the game now, or keep waiting for them.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={disabled} onClick={() => onClaim('win')}>
          Claim win
        </Button>
        <Button disabled={disabled} onClick={() => onClaim('draw')}>
          Call it a draw
        </Button>
        <Button disabled={disabled} onClick={onWait}>
          Keep waiting
        </Button>
      </div>
    </Panel>
  )
}

export interface GameControlsProps {
  view: GameView
  meId: number
  opponentId: number
  disabled: boolean
  onCommand: (command: GameCommand) => void
  /** False against the computer, which takes no draw offers (engine-play D5): only resign is offered. */
  drawAllowed?: boolean
}

/** What a player may ask for right now; the server still decides whether it is allowed. */
export function GameControls({
  view,
  meId,
  opponentId,
  disabled,
  onCommand,
  drawAllowed = true,
}: GameControlsProps) {
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
      {drawAllowed ? (
        <Button
          block
          disabled={disabled || view.drawOfferedBy === meId}
          onClick={() => onCommand({ kind: 'draw-offer' })}
        >
          {view.drawOfferedBy === meId ? 'Draw offered' : 'Offer draw'}
        </Button>
      ) : null}
      <Button block disabled={disabled} onClick={() => onCommand({ kind: 'resign' })}>
        Resign
      </Button>
    </div>
  )
}

/**
 * The games waiting for my move (correspondence-games D5): the opponent, the time control and, for a correspondence
 * game, how long is left. `nowMs` is passed in so the list is pure and the page decides when time moves.
 */
export function YourTurnList({
  games,
  nowMs,
}: {
  games: ReadonlyArray<MyGameItem>
  nowMs: number
}) {
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="your-turn">
      {games.map((game) => (
        <li
          key={game.gameId}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4 border-b border-line-divider py-2.5"
        >
          <Link
            to="/games/$id"
            params={{ id: game.gameId }}
            className="truncate text-fg-primary no-underline hover:text-fg-accent"
          >
            vs {game.opponent}
          </Link>
          <span className="font-mono text-fg-secondary">{game.timeControl}</span>
          <span className="text-sm text-fg-accent">
            {game.deadlineAt ? timeLeft(game.deadlineAt, nowMs) : 'your move'}
          </span>
        </li>
      ))}
    </ul>
  )
}
