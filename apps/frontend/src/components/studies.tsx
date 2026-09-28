import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { StudyListItem, StudyMove, TreePath } from '#/lib/studies'
import type { Analysis, Evaluation } from '#/lib/analysis'
import { moveNumber } from '#/lib/studies'
import { THINKS, lineMoves, scoreText } from '#/lib/analysis'
import { Button, ErrorText, Panel } from '#/components/ui'

/**
 * A study's moves (studies D7): the main line inline, each variation in parentheses right after the move it replaces,
 * numbered as the PGN is. Every move is a button; the current one is marked, and a move's score follows it once the
 * engine has evaluated the position it leads to (engine-analysis D5).
 */
export function MoveTree({
  tree,
  startFen,
  current,
  onSelect,
  scoreOf = () => null,
}: {
  tree: ReadonlyArray<StudyMove>
  startFen: string
  current: TreePath
  onSelect: (path: TreePath) => void
  scoreOf?: (fen: string) => string | null
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
        score={scoreOf(main.fen)}
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
              score={scoreOf(variation.fen)}
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
  score,
  onSelect,
}: {
  move: StudyMove
  path: TreePath
  number: string | null
  active: boolean
  score: string | null
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
      {score ? <span className="text-xs text-fg-muted">{score}</span> : null}
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

/**
 * The engine on the study board (engine-analysis D5): the think time, Evaluate (this position) and Analyse line (from
 * here to the end of the line), then this position's score, depth and best lines in SAN. Clicking a line plays it into
 * the tree as a variation when the study is editable.
 */
export function AnalysisPanel({
  analysis,
  fen,
  evaluation,
  line,
  onPlayLine,
}: {
  analysis: Analysis
  fen: string
  evaluation: Evaluation | null
  /** The positions from here to the end of the line. */
  line: ReadonlyArray<string>
  onPlayLine?: ((moves: Array<StudyMove>) => void) | undefined
}) {
  const { think, setThink, analyse, progress, busy, error } = analysis
  const waiting = busy || progress !== null
  return (
    <Panel
      title="Engine"
      {...(evaluation ? { meta: `depth ${evaluation.depth}` } : {})}
      className="gap-3"
      testId="analysis-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Think time">
          {THINKS.map((t) => (
            <Button
              key={t.value}
              size="sm"
              aria-pressed={think === t.value}
              variant={think === t.value ? 'primary' : 'secondary'}
              onClick={() => setThink(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <Button size="sm" disabled={busy} onClick={() => analyse([fen])}>
          Evaluate
        </Button>
        <Button size="sm" disabled={busy || line.length < 2} onClick={() => analyse(line)}>
          Analyse line
        </Button>
      </div>
      {progress ? (
        <p
          className="m-0 text-sm text-fg-secondary"
          data-testid="analysis-progress"
          aria-live="polite"
        >
          {progress.done} of {progress.total} analysed…
        </p>
      ) : null}
      {evaluation ? (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="analysis-lines">
          {evaluation.lines.map((best, i) => {
            const moves = lineMoves(fen, best.pv)
            const text = (
              <>
                <span className="w-14 shrink-0 font-mono text-fg-primary">{scoreText(best)}</span>
                <span className="truncate font-mono text-fg-body">
                  {moves.map((m) => m.san).join(' ')}
                </span>
              </>
            )
            return (
              <li key={i}>
                {onPlayLine && moves.length > 0 ? (
                  <button
                    type="button"
                    title="Play this line into the study"
                    onClick={() => onPlayLine(moves)}
                    className="flex w-full cursor-pointer gap-2 rounded-control px-1 text-left text-sm hover:bg-surface-hover"
                  >
                    {text}
                  </button>
                ) : (
                  <div className="flex gap-2 px-1 text-sm">{text}</div>
                )}
              </li>
            )
          })}
        </ol>
      ) : waiting ? null : (
        <p className="m-0 text-sm text-fg-muted">Not evaluated yet.</p>
      )}
      {error ? <ErrorText testId="analysis-error">{error}</ErrorText> : null}
    </Panel>
  )
}
