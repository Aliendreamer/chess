import { Fragment, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { MoveTreeEditor, StudyListItem, StudyMove, TreePath } from '#/lib/studies'
import type { Analysis, Evaluation } from '#/lib/analysis'
import { lineEnd, moveNumber, nextPath } from '#/lib/studies'
import { legalTargets } from '#/lib/moveInput'
import { uciSquares } from '#/lib/board'
import { THINKS, lineMoves, scoreText } from '#/lib/analysis'
import { Button, ErrorText, Panel } from '#/components/ui'
import { Board, FlipIcon, MoveNav, PromotionPicker } from '#/components/games'

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
        className={`cursor-pointer rounded-control px-1 ${active ? 'bg-surface-current text-fg-primary' : 'text-fg-body hover:bg-surface-hover'}`}
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
 * The engine on the study board (engine-analysis D5): the think time for the position on the board, which is evaluated
 * as it is shown ({@link useAutoEvaluate}), then its score, depth and best lines in SAN. Clicking a line plays it into
 * the tree as a variation when the study is editable.
 */
export function AnalysisPanel({
  analysis,
  fen,
  evaluation,
  onPlayLine,
}: {
  analysis: Analysis
  fen: string
  evaluation: Evaluation | null
  onPlayLine?: ((moves: Array<StudyMove>) => void) | undefined
}) {
  const { think, setThink, error } = analysis
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
      </div>
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
      ) : error ? null : (
        <p className="m-0 text-sm text-fg-muted" data-testid="analysis-status" aria-live="polite">
          The engine is thinking…
        </p>
      )}
      {error ? <ErrorText testId="analysis-error">{error}</ErrorText> : null}
    </Panel>
  )
}

/** How long a position must stay on the board before the engine is asked: stepping through a game asks only once. */
const SETTLE_MS = 300

/**
 * Asks the engine for the position on the board once it settles, and again when the think time changes. Positions
 * already known answer from the shared cache, so stepping back and forth costs nothing.
 */
export function useAutoEvaluate(analysis: Analysis, fen: string) {
  const ask = useRef(analysis.analyse)
  ask.current = analysis.analyse
  useEffect(() => {
    const timer = setTimeout(() => ask.current(fen), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [fen, analysis.think])
}

/**
 * A board with its move tree and the engine (analysis-board): the study page and the analysis page both draw this and
 * add their own header (title, starting point) and tools (save, share). `editable` lets moves be played; a read-only
 * shared study only navigates. `aside` is a third column (the library's games at this position). From `shell:` up the
 * page fits the screen and each column scrolls on its own (`wide fill`).
 */
export function AnalysisBoard({
  editor,
  analysis,
  editable,
  header,
  aside,
  children,
}: {
  editor: MoveTreeEditor
  analysis: Analysis
  editable: boolean
  header: ReactNode
  aside?: ReactNode
  children?: ReactNode
}) {
  const { fen, selected, promotion, tree, path } = editor
  useAutoEvaluate(analysis, fen)
  const scoreOf = (at: string) => {
    const best = analysis.evaluationOf(at)?.lines[0]
    return best ? scoreText(best) : null
  }
  const column = 'flex min-w-0 flex-col gap-4 shell:min-h-0 shell:overflow-y-auto shell:pr-1'
  // The board as large as the screen's height allows (its buttons under it); two columns from `shell:` (the library's
  // games under the engine), three from `wide:` with the moves and engine kept narrow.
  const grid = aside
    ? 'shell:grid-cols-[min(var(--board-max),calc(100dvh_-_9rem))_minmax(0,1fr)] shell:grid-rows-[minmax(0,3fr)_minmax(0,2fr)] wide:grid-cols-[min(var(--board-max),calc(100dvh_-_9rem))_minmax(18rem,28rem)_minmax(18rem,1fr)] wide:grid-rows-1'
    : 'shell:grid-cols-[min(var(--board-max),calc(100dvh_-_9rem))_minmax(0,1fr)]'
  return (
    <div
      data-layout="wide fill"
      className={`grid grid-cols-1 gap-6 shell:h-full shell:gap-8 ${grid}`}
    >
      <div className="flex max-w-(--board-max) flex-col gap-3 shell:row-span-2 wide:row-span-1">
        <Board
          fen={fen}
          orientation={editor.orientation}
          lastMove={uciSquares(editor.current?.uci)}
          selected={selected}
          targets={selected ? legalTargets(fen, selected) : []}
          {...(editable ? { onSquareClick: editor.onSquareClick, onDrop: editor.onDrop } : {})}
        />
        {promotion ? (
          <PromotionPicker
            color={fen.split(' ')[1] === 'b' ? 'black' : 'white'}
            onPick={editor.pickPromotion}
            onCancel={editor.cancelPromotion}
          />
        ) : null}
        <MoveNav
          onStart={() => editor.setPath([])}
          onBack={() => editor.setPath(path.slice(0, -1))}
          onForward={() => editor.setPath(nextPath(tree, path) ?? path)}
          onEnd={() => editor.setPath(lineEnd(tree, path))}
        >
          <Button aria-label="Flip board" onClick={editor.flip}>
            <FlipIcon />
          </Button>
        </MoveNav>
      </div>

      <div className={column}>
        {header}
        <MoveTree
          tree={tree}
          startFen={editor.startFen}
          current={path}
          onSelect={editor.setPath}
          scoreOf={scoreOf}
        />
        <AnalysisPanel
          analysis={analysis}
          fen={fen}
          evaluation={analysis.evaluationOf(fen)}
          onPlayLine={editable ? editor.playLine : undefined}
        />
        {children}
      </div>

      {aside ? <div className={column}>{aside}</div> : null}
    </div>
  )
}
