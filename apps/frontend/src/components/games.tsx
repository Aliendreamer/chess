import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import type { ClaimOutcome, Color, EndReason, GameCommand, GameView, PgnResult } from '#/lib/games'
import type { Piece } from '#/lib/moveInput'
import type { MyGameItem } from '#/lib/play'
import { Button, Panel } from '#/components/ui'
import { outcomeFor } from '#/lib/play'
import { formatClock, pairMoves, reasonText, resultText, timeLeft } from '#/lib/games'
import { placement, squaresFor } from '#/lib/moveInput'

const GLYPH: Record<Piece['type'], string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const NAME: Record<Piece['type'], string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
}
// VS15 asks for the text (not emoji) presentation of the glyph.
const TEXT = '︎'

export interface BoardProps {
  fen: string
  orientation: Color
  /** The last move's squares, tinted gold. */
  lastMove?: { from: string; to: string } | null
  selected?: string | null
  /** Legal destinations of the selected piece (dots). */
  targets?: ReadonlyArray<string>
  /** Without it the board is read-only (spectators, ended games, not your turn). */
  onSquareClick?: (square: string) => void
}

/**
 * The Club board: classic wood tones, a 1px ring, Unicode pieces sized by container units so it stays fluid up to
 * 600px. Presentational: which squares are selectable is the page's decision.
 */
export function Board({
  fen,
  orientation,
  lastMove,
  selected,
  targets = [],
  onSquareClick,
}: BoardProps) {
  const pieces = placement(fen)
  const squares = squaresFor(orientation)
  const bottomRank = orientation === 'white' ? '1' : '8'
  const leftFile = orientation === 'white' ? 'a' : 'h'
  return (
    <div
      role="grid"
      aria-label="Chess board"
      className="@container grid aspect-square w-full max-w-(--board-max) grid-cols-8 overflow-hidden rounded-board ring-1 ring-ink-550"
    >
      {squares.map((square) => {
        const file = square.charCodeAt(0) - 97
        const rank = Number(square[1])
        const light = (file + rank) % 2 === 1
        const piece = pieces[square]
        const tinted = lastMove && (lastMove.from === square || lastMove.to === square)
        const background = tinted
          ? light
            ? 'bg-board-last-light'
            : 'bg-board-last-dark'
          : light
            ? 'bg-board-light'
            : 'bg-board-dark'
        const coord = light ? 'text-board-dark' : 'text-board-light'
        const label = piece
          ? `${square} ${piece.color === 'w' ? 'white' : 'black'} ${NAME[piece.type]}`
          : square
        return (
          <button
            key={square}
            type="button"
            role="gridcell"
            data-square={square}
            aria-label={label}
            aria-selected={selected === square}
            disabled={!onSquareClick}
            onClick={onSquareClick ? () => onSquareClick(square) : undefined}
            className={`relative grid aspect-square place-items-center border-0 p-0 ${background} ${onSquareClick ? 'cursor-pointer' : 'cursor-default'} ${selected === square ? 'ring-2 ring-brass-400 ring-inset' : ''}`}
          >
            {piece ? (
              <span
                aria-hidden
                className={`text-[9cqi] leading-none ${piece.color === 'w' ? 'text-piece-white [-webkit-text-stroke:1.2px_var(--color-piece-white-stroke)]' : 'text-piece-black'}`}
              >
                {GLYPH[piece.type] + TEXT}
              </span>
            ) : null}
            {targets.includes(square) ? (
              <span
                aria-hidden
                className={`absolute rounded-full bg-ink-900/35 ${piece ? 'inset-[6%] bg-transparent ring-4 ring-ink-900/35' : 'size-[28%]'}`}
              />
            ) : null}
            {square[0] === leftFile ? (
              <span
                aria-hidden
                className={`absolute top-[3px] left-1 text-[1.5cqi] font-semibold ${coord}`}
              >
                {square[1]}
              </span>
            ) : null}
            {square[1] === bottomRank ? (
              <span
                aria-hidden
                className={`absolute right-1 bottom-0.5 text-[1.5cqi] font-semibold ${coord}`}
              >
                {square[0]}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export interface PromotionPickerProps {
  color: Color
  onPick: (piece: 'q' | 'r' | 'b' | 'n') => void
  onCancel: () => void
}

/** The four promotion choices, queen first. */
export function PromotionPicker({ color, onPick, onCancel }: PromotionPickerProps) {
  const tone =
    color === 'white'
      ? 'text-piece-white [-webkit-text-stroke:1px_var(--color-piece-white-stroke)]'
      : 'text-piece-black'
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
          className="grid size-12 cursor-pointer place-items-center rounded-control bg-board-light text-[34px] leading-none hover:bg-board-last-light"
        >
          <span aria-hidden className={tone}>
            {GLYPH[type] + TEXT}
          </span>
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
  testId?: string
}

export function PlayerStrip({ name, detail, ms, active = false, testId }: PlayerStripProps) {
  return (
    <div className="flex items-center justify-between gap-3" data-testid={testId}>
      <div className="flex flex-col">
        <span className="font-medium text-fg-primary">{name}</span>
        <span className="text-xs text-fg-secondary">{detail}</span>
      </div>
      {ms !== undefined ? <Clock ms={ms} active={active} /> : null}
    </div>
  )
}

/** SAN in numbered rows; the latest move is tinted. */
export function MoveList({ sans }: { sans: ReadonlyArray<string> }) {
  const rows = pairMoves(sans)
  const current = sans.length - 1
  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">No moves yet.</p>
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
          <li className={`px-2.5 py-[7px] ${current === i * 2 ? 'bg-brass-800' : ''}`}>{white}</li>
          <li className={`px-2.5 py-[7px] ${current === i * 2 + 1 ? 'bg-brass-800' : ''}`}>
            {black ?? ''}
          </li>
        </Fragment>
      ))}
    </ol>
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
