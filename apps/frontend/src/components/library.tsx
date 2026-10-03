import { Link } from '@tanstack/react-router'
import type { ExplorerMove, LibraryGameItem, LibraryPosition } from '#/lib/library'
import { scoreShare } from '#/lib/players'
import { playMove } from '#/lib/studies'
import { Panel } from '#/components/ui'

/**
 * The game library (game-library): search results, and the games at the analysis board's position. Every game opens
 * on the analysis board (`?library={id}`, at a move with `&ply=`).
 */

const RESULT: Record<string, string> = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½–½', '*': '*' }

export function LibraryList({ games }: { games: ReadonlyArray<LibraryGameItem> }) {
  if (games.length === 0)
    return <p className="m-0 text-sm text-fg-secondary">No library game matches.</p>
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="library-games">
      {games.map((g) => (
        <li
          key={g.id}
          className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-line-divider py-2.5"
        >
          <span className="font-mono text-sm text-fg-secondary">{g.year ?? '—'}</span>
          <Link
            to="/analysis"
            search={{ library: g.id }}
            className="truncate text-fg-primary no-underline hover:text-fg-accent"
          >
            {`${g.white} – ${g.black}`}
          </Link>
          <span className="font-mono text-sm text-fg-primary">{RESULT[g.result] ?? g.result}</span>
          <span className="col-start-2 flex flex-wrap items-baseline gap-x-3 text-xs text-fg-secondary">
            {g.event ? <span>{g.event}</span> : null}
            {g.eco || g.opening ? (
              <span>{[g.eco, g.opening].filter(Boolean).join(' ')}</span>
            ) : null}
            {g.worldChampionship ? (
              <span className="text-fg-accent">World Championship</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * "In the library" on the analysis board: the moves played here in the library's games (library-explorer) — click one
 * to play it — then how the games at this position ended, and each one at this move.
 */
export function PositionPanel({
  position,
  fen,
  onPlay,
}: {
  position: LibraryPosition
  fen: string
  onPlay: (uci: string) => void
}) {
  return (
    <Panel variant="outlined" title="In the library" className="gap-2" testId="library-panel">
      {position.moves.length > 0 ? (
        <MovesTable moves={position.moves} fen={fen} onPlay={onPlay} />
      ) : null}
      {position.games === 0 ? (
        <p className="m-0 text-sm text-fg-secondary">No library game reached this position.</p>
      ) : (
        <>
          <p className="m-0 text-sm text-fg-body">
            {`${position.games} ${position.games === 1 ? 'game' : 'games'} · white ${position.whiteWins} · draws ${position.draws} · black ${position.blackWins}`}
          </p>
          <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0">
            {position.items.map((g) => (
              <li key={g.id} className="flex items-baseline justify-between gap-3 text-sm">
                <Link
                  to="/analysis"
                  search={{ library: g.id, ply: g.ply }}
                  className="truncate text-fg-primary no-underline hover:text-fg-accent"
                >
                  {`${g.white} – ${g.black}${g.year ? `, ${g.year}` : ''}`}
                </Link>
                <span className="font-mono text-fg-secondary">{RESULT[g.result] ?? g.result}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

function MovesTable({
  moves,
  fen,
  onPlay,
}: {
  moves: ReadonlyArray<ExplorerMove>
  fen: string
  onPlay: (uci: string) => void
}) {
  return (
    <table
      className="w-full border-collapse text-sm"
      aria-label="Moves played here"
      data-testid="explorer"
    >
      <thead>
        <tr className="text-left text-2xs uppercase tracking-wide text-fg-muted">
          <th className="py-1 font-medium">Move</th>
          <th className="py-1 text-right font-medium">Games</th>
          <th className="py-1 pl-3 font-medium">Results</th>
        </tr>
      </thead>
      <tbody>
        {moves.map((m) => {
          const san = playMove(fen, m.uci)?.san ?? m.uci
          const share = scoreShare({ wins: m.whiteWins, draws: m.draws, losses: m.blackWins })
          return (
            <tr key={m.uci} className="border-t border-line-divider align-top">
              <th scope="row" className="py-1.5 text-left font-normal">
                <button
                  type="button"
                  aria-label={`Play ${san}`}
                  onClick={() => onPlay(m.uci)}
                  className="cursor-pointer bg-transparent p-0 font-mono text-fg-primary hover:text-fg-accent"
                >
                  {san}
                </button>
                {m.opening ? (
                  <span className="block text-2xs text-fg-secondary">
                    {`${m.eco ?? ''} ${m.opening}`.trim()}
                  </span>
                ) : null}
              </th>
              <td className="py-1.5 text-right font-mono text-fg-secondary">{m.games}</td>
              <td className="py-1.5 pl-3">
                <div
                  role="img"
                  aria-label={`${share.wins}% white wins, ${share.draws}% draws, ${share.losses}% black wins`}
                  className="flex h-3 w-full overflow-hidden rounded-full border border-line-strong bg-surface-inset"
                >
                  <span className="bg-fg-primary" style={{ width: `${share.wins}%` }} />
                  <span className="bg-fg-muted" style={{ width: `${share.draws}%` }} />
                  <span className="bg-surface-page" style={{ width: `${share.losses}%` }} />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
