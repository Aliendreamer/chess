import { Link } from '@tanstack/react-router'
import type { MoveClass, ReviewCounts, ReviewView, ReviewedMove } from '#/lib/review'
import { bookLink, graphPoints, lineSans, moveLabel, scoreLabel } from '#/lib/review'
import { Button, ErrorText, Panel } from '#/components/ui'

/**
 * Game review (game-review): the evaluation graph, the review panel beside a finished game, and the practice
 * feedback. Presentational; the review's polling and the practice board are in `lib/review.ts`.
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

/** The move on the board as the review sees it: its mark and the better move, or its score. */
function MoveVerdict({ move }: { move: ReviewedMove | undefined }) {
  if (!move) return <p className="m-0 text-sm text-fg-secondary">Start position.</p>
  const label = moveLabel(move.ply, move.san)
  const score = scoreLabel(move)
  const marked = move.class && move.class !== 'none' ? move.class : null
  const text =
    marked && move.bestSan
      ? `${label} is ${ARTICLE[marked]}. Better: ${moveLabel(move.ply, move.bestSan)} (${move.line.join(' ')}) · ${score}`
      : `${label} · ${score}`
  return (
    <p
      className={`m-0 text-sm ${marked === 'blunder' || marked === 'mistake' ? 'text-status-loss' : 'text-fg-primary'}`}
      data-testid="review-move"
    >
      {text}
    </p>
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
  practice: { busy: boolean; added: number | null; error: string | null }
  onPractise: () => void
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
  practice,
  onPractise,
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
          <MoveVerdict move={review.moves[current - 1]} />
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
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={practice.busy} onClick={onPractise}>
                Practise my mistakes
              </Button>
              {practice.added !== null ? (
                <>
                  <span className="text-sm text-fg-secondary" data-testid="practice-added">
                    {`${practice.added} ${practice.added === 1 ? 'position' : 'positions'} added to your practice.`}
                  </span>
                  <Link to="/practice" className="text-sm text-fg-accent">
                    Open practice
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}
          {practice.error ? <ErrorText>{practice.error}</ErrorText> : null}
        </>
      ) : null}
    </Panel>
  )
}

/** After a practice answer: right, or the engine's move and line. */
export function PracticeFeedback({
  fen,
  answer,
  bestLine,
}: {
  fen: string
  answer: { uci: string | null; correct: boolean }
  bestLine: ReadonlyArray<string>
}) {
  const line = lineSans(fen, bestLine)
  const played = answer.uci ? lineSans(fen, [answer.uci])[0] : undefined
  const text = answer.correct
    ? `Right: ${played ?? line[0] ?? ''}.`
    : `Not this time. The engine plays ${line[0] ?? '?'} (${line.join(' ')}).`
  return (
    <p
      className={`m-0 text-sm ${answer.correct ? 'text-status-win' : 'text-status-loss'}`}
      data-testid="practice-feedback"
      aria-live="polite"
    >
      {text}
    </p>
  )
}
