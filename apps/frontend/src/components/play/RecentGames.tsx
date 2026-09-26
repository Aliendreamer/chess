import { Link } from '@tanstack/react-router'
import type { MyGameItem } from '#/lib/play'
import { reasonText, resultText } from '#/lib/games'
import { outcomeFor } from '#/lib/play'

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
