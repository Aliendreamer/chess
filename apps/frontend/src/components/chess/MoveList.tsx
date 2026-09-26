import { Fragment } from 'react'
import { pairMoves } from '#/lib/games'

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
