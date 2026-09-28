import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { StudyListItem, StudyMove, TreePath } from '#/lib/studies'
import { moveNumber } from '#/lib/studies'

/**
 * A study's moves (studies D7): the main line inline, each variation in parentheses right after the move it replaces,
 * numbered as the PGN is. Every move is a button; the current one is marked.
 */
export function MoveTree({
  tree,
  startFen,
  current,
  onSelect,
}: {
  tree: ReadonlyArray<StudyMove>
  startFen: string
  current: TreePath
  onSelect: (path: TreePath) => void
}) {
  const key = current.join('.')
  const renderLine = (
    moves: ReadonlyArray<StudyMove>,
    at: TreePath,
    fenBefore: string,
    startsLine: boolean,
  ): Array<ReactNode> => {
    const [main, ...variations] = moves
    if (!main) return []
    const mainPath = [...at, 0]
    return [
      <MoveButton
        key={mainPath.join('.')}
        move={main}
        path={mainPath}
        number={moveNumber(fenBefore, startsLine)}
        active={key === mainPath.join('.')}
        onSelect={onSelect}
      />,
      ...variations.map((variation, i) => {
        const path = [...at, i + 1]
        return (
          <span key={`v${path.join('.')}`} className="text-fg-secondary">
            {'('}
            <MoveButton
              move={variation}
              path={path}
              number={moveNumber(fenBefore, true)}
              active={key === path.join('.')}
              onSelect={onSelect}
            />
            {renderLine(variation.children, path, variation.fen, false)}
            {')'}
          </span>
        )
      }),
      ...renderLine(main.children, mainPath, main.fen, variations.length > 0),
    ]
  }

  if (tree.length === 0)
    return <p className="m-0 text-sm text-fg-muted">No moves yet: play one on the board.</p>
  return (
    <div
      aria-label="Moves"
      data-testid="move-tree"
      className="flex max-h-96 flex-wrap items-baseline gap-x-1.5 gap-y-1 overflow-y-auto rounded-card border border-line-default p-3 font-mono text-sm"
    >
      {renderLine(tree, [], startFen, true)}
    </div>
  )
}

function MoveButton({
  move,
  path,
  number,
  active,
  onSelect,
}: {
  move: StudyMove
  path: TreePath
  number: string | null
  active: boolean
  onSelect: (path: TreePath) => void
}) {
  return (
    <Fragment>
      {number ? <span className="text-fg-muted">{number}</span> : null}
      <button
        type="button"
        aria-current={active ? 'step' : undefined}
        onClick={() => onSelect(path)}
        className={`cursor-pointer rounded-control px-1 ${active ? 'bg-brass-800 text-fg-primary' : 'text-fg-body hover:bg-surface-hover'}`}
      >
        {move.san}
      </button>
    </Fragment>
  )
}

/** My studies, newest first: the title, the players when known, and whether the link is shared. */
export function StudyList({ studies }: { studies: ReadonlyArray<StudyListItem> }) {
  if (studies.length === 0) return <p className="m-0 text-sm text-fg-muted">No studies yet.</p>
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="study-list">
      {studies.map((study) => (
        <li
          key={study.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-line-divider py-2.5"
        >
          <Link
            to="/studies/$id"
            params={{ id: study.id }}
            className="truncate text-fg-primary no-underline hover:text-fg-accent"
          >
            {study.title}
          </Link>
          <span className="text-sm text-fg-secondary">
            {[
              study.white && study.black ? `${study.white} – ${study.black}` : null,
              study.shared ? 'shared' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}
