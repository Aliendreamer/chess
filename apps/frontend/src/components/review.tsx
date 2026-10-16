import { Link } from '@tanstack/react-router'
import { Button, ErrorText, Panel } from '@chess/ui'
import type { PreviewState, ReviewView } from '#/lib/review'
import type { MoveClass, ReviewCounts, ReviewedMove } from '@chess/core'
import { advantageText, bookLink, graphPoints, moveLabel, scoreLabel } from '#/lib/review'

/**
 * Game review (game-review): the evaluation graph and the review panel beside a finished game. Presentational;
 * the review's polling is in `lib/review.ts`.
 */

const W = 300
const H = 80

const DOT: Record<Exclude<MoveClass, 'none'>, string> = {
  inaccuracy: 'fill-fg-accent',
  mistake: 'fill-status-waiting',
  blunder: 'fill-status-loss',
}

const ARTICLE: Record<Exclude<MoveClass, 'none'>, string> = {
  inaccuracy: 'an inaccuracy',
  mistake: 'a mistake',
  blunder: 'a blunder',
}

/** White's chances over the game, White up; marked moves are dots; a click goes to that move. */
export function EvalGraph({
  moves,
  current,
  onSelect,
}: {
  moves: ReadonlyArray<ReviewedMove>
  current: number
  onSelect: (ply: number) => void
}) {
  const points = graphPoints(moves, W, H)
  const evaluated = moves.filter((m) => m.chances !== null).length
  const step = moves.length === 0 ? 0 : W / moves.length
  const line = points.map((p) => `${p.x},${p.y}`).join(' ')
  const area = `0,${H} ${line} ${points.at(-1)?.x ?? 0},${H}`
  return (
    <svg
      role="img"
      aria-label={`Evaluation graph: ${evaluated} of ${moves.length} moves evaluated`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-20 w-full rounded-control bg-surface-inset"
    >
      <polygon points={area} className="fill-fg-primary/70" />
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="stroke-line-default" strokeWidth={0.5} />
      {current > 0 ? (
        <line
          x1={current * step}
          y1={0}
          x2={current * step}
          y2={H}
          className="stroke-fg-accent"
          strokeWidth={1}
        />
      ) : null}
      {points.map((p) => {
        const cls = moves[p.ply - 1]?.class
        return cls && cls !== 'none' ? (
          <circle key={p.ply} cx={p.x} cy={p.y} r={2.5} className={DOT[cls]} />
        ) : null
      })}
      {moves.map((m) => (
        <rect
          key={m.ply}
          data-testid={`graph-ply-${m.ply}`}
          x={(m.ply - 0.5) * step}
          y={0}
          width={step}
          height={H}
          fill="transparent"
          className="cursor-pointer"
          onClick={() => onSelect(m.ply)}
        />
      ))}
    </svg>
  )
}

/**
 * The move on the board as the review sees it: the evaluation in numbers and words, its mark, and the engine's
 * better line — each of its moves a button that shows the line up to there on the board.
 */
function MoveVerdict({
  move,
  preview,
  onPreview,
}: {
  move: ReviewedMove | undefined
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
}) {
  if (!move) return <p className="m-0 text-sm text-fg-secondary">Start position.</p>
  const label = moveLabel(move.ply, move.san)
  const score = scoreLabel(move)
  const words = advantageText(move)
  const marked = move.class && move.class !== 'none' ? move.class : null
  const line = marked && move.bestSan ? move.line : []
  const showing = preview?.ply === move.ply ? preview.upTo : 0
  return (
    <div className="flex flex-col gap-2" data-testid="review-move">
      <p className="m-0 flex items-baseline gap-2 text-sm">
        <span className="font-mono text-base text-fg-primary" data-testid="review-score">
          {score}
        </span>
        {words ? <span className="text-fg-secondary">{words}</span> : null}
      </p>
      <p
        className={`m-0 text-sm ${marked === 'blunder' || marked === 'mistake' ? 'text-status-loss' : 'text-fg-primary'}`}
      >
        {marked ? `${label} is ${ARTICLE[marked]}.` : label}
      </p>
      {line.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Better line">
          <span className="text-sm text-fg-secondary">Better:</span>
          {line.map((san, i) => (
            <button
              key={`${i}-${san}`}
              type="button"
              aria-pressed={showing === i + 1}
              onClick={() => onPreview({ ply: move.ply, upTo: i + 1 })}
              className={`cursor-pointer rounded-control border px-1.5 py-0.5 font-mono text-sm ${showing === i + 1 ? 'border-line-accent bg-surface-accent-tint text-fg-primary' : 'border-line-default bg-surface-raised text-fg-primary hover:border-line-accent'} ${i === 0 ? 'font-semibold' : ''}`}
            >
              {i === 0 ? moveLabel(move.ply, san) : san}
            </button>
          ))}
          {showing > 0 ? (
            <button
              type="button"
              onClick={() => onPreview(null)}
              className="cursor-pointer text-sm text-fg-accent underline-offset-2 hover:underline"
            >
              Back to the game
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Counts({ white, black }: { white: ReviewCounts; black: ReviewCounts }) {
  const row = (name: string, c: ReviewCounts) => (
    <tr className="border-t border-line-divider">
      <th scope="row" className="py-1.5 text-left font-normal">
        {name}
      </th>
      <td className="py-1.5 text-right font-mono">{c.inaccuracies}</td>
      <td className="py-1.5 text-right font-mono">{c.mistakes}</td>
      <td className="py-1.5 text-right font-mono">{c.blunders}</td>
    </tr>
  )
  return (
    <table className="w-full border-collapse text-sm" aria-label="Marks per player">
      <thead>
        <tr className="text-left text-2xs uppercase tracking-wide text-fg-muted">
          <th className="py-1 font-medium">Player</th>
          <th className="py-1 text-right font-medium">?!</th>
          <th className="py-1 text-right font-medium">?</th>
          <th className="py-1 text-right font-medium">??</th>
        </tr>
      </thead>
      <tbody>
        {row('White', white)}
        {row('Black', black)}
      </tbody>
    </table>
  )
}

export interface ReviewPanelProps {
  review: ReviewView | null
  mine: 'white' | 'black' | null
  /** A player of the game may start (or re-ask) the review. */
  canStart: boolean
  busy: boolean
  error: string | null
  onStart: () => void
  /** The ply on the board (0 = the start). */
  current: number
  onSelect: (ply: number) => void
  /** The engine's better line on the board, when the user clicked one of its moves. */
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
}

/** The engine review beside a finished game (game-review D8). */
export function ReviewPanel({
  review,
  mine,
  canStart,
  busy,
  error,
  onStart,
  current,
  onSelect,
  preview,
  onPreview,
}: ReviewPanelProps) {
  const status = review?.status ?? 'none'
  const exit = review?.bookExit ?? null
  const trainer = exit ? bookLink(exit, mine) : null
  return (
    <Panel variant="outlined" title="Engine review" testId="review-panel" className="gap-3">
      {status === 'none' ? (
        canStart ? (
          <Button variant="outline" disabled={busy} onClick={onStart}>
            Review with engine
          </Button>
        ) : (
          <p className="m-0 text-sm text-fg-secondary">Not reviewed yet.</p>
        )
      ) : null}
      {status === 'running' && review ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="text-sm text-fg-secondary"
            data-testid="review-progress"
            aria-live="polite"
          >
            {`Reviewing: ${review.evaluated} of ${review.positions} positions`}
          </span>
          {canStart ? (
            <Button size="sm" disabled={busy} onClick={onStart}>
              Ask again
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {review && status !== 'none' ? (
        <>
          <EvalGraph moves={review.moves} current={current} onSelect={onSelect} />
          <MoveVerdict move={review.moves[current - 1]} preview={preview} onPreview={onPreview} />
        </>
      ) : null}
      {review && status === 'complete' ? (
        <>
          <Counts white={review.white} black={review.black} />
          {exit ? (
            <p className="m-0 text-sm text-fg-secondary" data-testid="book-exit">
              {`Left the book with ${moveLabel(exit.ply, exit.san)} (${exit.color === 'white' ? 'White' : 'Black'}) · ${exit.eco} ${exit.name}`}
              {trainer ? (
                <>
                  {' '}
                  <Link
                    to="/trainer/$family"
                    params={{ family: trainer.family }}
                    search={{ color: trainer.color }}
                    className="text-fg-accent"
                  >
                    Train this opening
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {mine ? (
            <p className="m-0 text-sm text-fg-secondary" data-testid="review-training">
              Your mistakes from this game join your training on their own.{' '}
              <Link to="/training" className="text-fg-accent">
                Open training
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
    </Panel>
  )
}
