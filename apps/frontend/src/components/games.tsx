import {
  Button,
  CategoryMark,
  Panel,
  PieceImage,
  PreferencesContext,
  pieceSrc,
  squareStyles,
} from '@chess/ui'
import { Fragment, use, useEffect, useId, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Chessboard, defaultArrowOptions } from 'react-chessboard'
import {
  ArrowUpDown,
  Cpu,
  Flag,
  Flame,
  Handshake,
  Hourglass,
  Microscope,
  Repeat,
  Timer,
  Zap,
} from 'lucide-react'
import { animationMs as animationMsOf, categoryOf, pairMoves, squaresFor } from '@chess/core'
import type { ChessboardOptions, PieceRenderObject } from 'react-chessboard'
import type { ReactNode } from 'react'
import type { Category, Piece, SideMaterial, SquarePair } from '@chess/core'
import type { RematchState } from '#/lib/feedback'
import type { ClaimOutcome, Color, EndReason, GameCommand, GameView, PgnResult } from '#/lib/games'
import type { MyGameItem } from '#/lib/play'
import { outcomeFor } from '#/lib/play'
import { formatClock, reasonLabel, reasonText, resultText } from '#/lib/games'

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
  /** Links the name to the player's profile (player-profiles). */
  playerId?: number
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
  playerId,
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
        <span className="font-medium text-fg-primary">
          {playerId === undefined ? name : <PlayerLink id={playerId} name={name} />}
        </span>
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

const OUTCOME_TONE = {
  win: 'text-status-win',
  loss: 'text-status-loss',
  draw: 'text-status-draw',
} as const

// Static class strings, so Tailwind sees them.
// On a phone a row takes two lines: result, opponent and time control, then how it ended (responsive-layout).
const COLUMNS =
  'grid-cols-[40px_minmax(0,1fr)_auto] gap-x-4 gap-y-1 shell:grid-cols-[40px_minmax(0,1fr)_80px_minmax(0,160px)] shell:gap-4'
const COLUMNS_WITH_PGN =
  'grid-cols-[40px_minmax(0,1fr)_auto] gap-x-4 gap-y-1 shell:grid-cols-[40px_minmax(0,1fr)_80px_minmax(0,160px)_40px] shell:gap-4'
const COLUMNS_WITH_ANALYSE =
  'grid-cols-[40px_minmax(0,1fr)_auto] gap-x-4 gap-y-1 shell:grid-cols-[40px_minmax(0,1fr)_80px_minmax(0,160px)_64px] shell:gap-4'

export interface RecentGamesProps {
  games: ReadonlyArray<MyGameItem>
  /** A PGN download link on finished games (the history page). */
  pgn?: boolean
  /** An Analyse link on finished games, to the analysis board (a member's profile, player-profiles). */
  analyse?: boolean
  /** What an empty list says (home points at Quick pairing). */
  empty?: string
}

/** "My games" rows: result from my side, the opponent by name, the time control and how it ended. */
export function RecentGames({
  games,
  pgn = false,
  analyse = false,
  empty = 'No games yet.',
}: RecentGamesProps) {
  if (games.length === 0) {
    return <p className="m-0 text-sm text-fg-secondary">{empty}</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="recent-games">
      {games.map((game) => {
        const outcome = outcomeFor(game.result, game.color)
        const finished = game.status !== 'playing'
        return (
          <li
            key={game.gameId}
            className={`grid ${pgn ? COLUMNS_WITH_PGN : analyse ? COLUMNS_WITH_ANALYSE : COLUMNS} items-baseline border-b border-line-divider py-2.5`}
          >
            <span
              className={`font-mono font-medium ${outcome ? OUTCOME_TONE[outcome] : 'text-fg-muted'}`}
            >
              {!finished ? '…' : game.result ? resultText(game.result) : '—'}
            </span>
            <span className="truncate text-fg-primary">
              {'vs '}
              <PlayerLink id={game.opponentId} name={game.opponent} />
            </span>
            <span className="flex items-center gap-2 font-mono text-fg-secondary">
              <CategoryMark timeControl={game.timeControl} />
              {game.timeControl}
            </span>
            <Link
              to="/games/$id"
              params={{ id: game.gameId }}
              aria-label={`Open the game vs ${game.opponent}`}
              className="truncate text-sm text-fg-secondary no-underline hover:text-fg-accent hover:underline max-shell:col-start-2"
            >
              {!finished ? 'in play' : game.reason ? reasonText(game.reason) : 'open'}
            </Link>
            {pgn ? (
              finished ? (
                <a href={`/pgn/${game.gameId}`} download className="font-mono text-sm no-underline">
                  PGN
                </a>
              ) : (
                <span />
              )
            ) : null}
            {analyse && !pgn ? (
              finished ? (
                <Link
                  to="/analysis"
                  search={{ game: game.gameId }}
                  aria-label={`Analyse the game vs ${game.opponent}`}
                  className="text-sm no-underline hover:underline"
                >
                  Analyse
                </Link>
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
    <Panel variant="accent" title="Result" testId="result-panel">
      <p className="m-0 font-display text-display-sm" data-testid="game-result">
        {resultText(result)}
      </p>
      <a href={pgnHref} download className="text-sm" data-testid="game-pgn">
        Download PGN
      </a>
      {reason ? <p className="m-0 text-sm text-fg-secondary">{reasonLabel(reason)}</p> : null}
      {onAnalyse ? (
        <Button variant="outline" disabled={analysing} onClick={onAnalyse}>
          <Microscope aria-hidden size={15} />
          Analyse
        </Button>
      ) : null}
    </Panel>
  )
}

/**
 * The card over the board when a game ends while it is watched (game-feedback): the result, how it ended, and the
 * page's actions (rematch, new opponent, analyse). It can be closed; the result panel beside the board stays.
 */
export function GameOverCard({
  result,
  reason,
  onClose,
  children,
}: {
  result: PgnResult
  reason: EndReason | null
  onClose: () => void
  children?: ReactNode
}) {
  const how = reason ? reasonLabel(reason) : ''
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-surface-page/55 p-4">
      <div
        role="dialog"
        aria-label="Game over"
        data-testid="game-over"
        className="motion-safe:animate-[pop_180ms_ease-out] flex w-full max-w-72 flex-col items-center gap-3 rounded-card border border-line-accent bg-surface-card p-5 text-center shadow-2xl"
      >
        <p className="m-0 font-display text-display-md">{resultText(result)}</p>
        {how ? <p className="m-0 text-sm text-fg-secondary">{how}</p> : null}
        <div className="flex w-full flex-col gap-2">{children}</div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer border-0 bg-transparent text-xs text-fg-muted hover:text-fg-body"
        >
          Close
        </button>
      </div>
    </div>
  )
}

export interface RematchOfferProps {
  state: RematchState
  opponent: string
  busy: boolean
  /** Offers the rematch, or accepts the opponent's. */
  onRematch: () => void
}

/** Where the rematch stands, with what I can do about it (game-feedback). */
export function RematchOffer({ state, opponent, busy, onRematch }: RematchOfferProps) {
  const [declined, setDeclined] = useState(false)
  if (state.kind === 'none') {
    return (
      <Button block variant="primary" disabled={busy} onClick={onRematch}>
        <Repeat aria-hidden size={15} />
        Rematch
      </Button>
    )
  }
  if (state.kind === 'offered') {
    return (
      <p className="m-0 text-sm text-fg-secondary" data-testid="rematch">
        {`Rematch offered · waiting for ${opponent}`}
      </p>
    )
  }
  if (state.kind === 'asked' && !declined) {
    return (
      <div className="flex flex-col gap-2" data-testid="rematch">
        <p className="m-0 text-sm text-fg-primary">{`${opponent} wants a rematch`}</p>
        <div className="flex gap-2">
          <Button
            block
            variant="primary"
            disabled={busy}
            onClick={onRematch}
            aria-label="Accept rematch"
          >
            Accept
          </Button>
          <Button block onClick={() => setDeclined(true)}>
            Decline
          </Button>
        </div>
      </div>
    )
  }
  if (state.kind === 'started') {
    return (
      <p className="m-0 text-sm text-fg-secondary" data-testid="rematch">
        Starting the rematch…
      </p>
    )
  }
  return null
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
      <div
        data-testid="draw-offer"
        className="flex flex-col gap-2 rounded-card p-2 motion-safe:animate-[offer_1.6s_ease-in-out_infinite]"
      >
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
          <Handshake aria-hidden size={15} />
          {view.drawOfferedBy === meId ? 'Draw offered' : 'Offer draw'}
        </Button>
      ) : null}
      <Button block disabled={disabled} onClick={() => onCommand({ kind: 'resign' })}>
        <Flag aria-hidden size={15} />
        Resign
      </Button>
    </div>
  )
}

/** A player's name as a link to their profile; the unknown player (id 0) stays plain text. */
export function PlayerLink({
  id,
  name,
  className,
}: {
  id: number
  name: string
  className?: string
}) {
  if (id === 0) return <span className={className}>{name}</span>
  return (
    <Link
      to="/players/$id"
      params={{ id: String(id) }}
      className={className ?? 'text-fg-primary no-underline hover:text-fg-accent hover:underline'}
    >
      {name}
    </Link>
  )
}
