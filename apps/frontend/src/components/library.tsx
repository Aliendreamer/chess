import { Link } from '@tanstack/react-router'
import type { LibraryGameItem, LibraryPosition } from '#/lib/library'
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

/** "In the library" on the analysis board: how the games at this position ended, and each one at this move. */
export function PositionPanel({ position }: { position: LibraryPosition }) {
  return (
    <Panel variant="outlined" title="In the library" className="gap-2" testId="library-panel">
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
