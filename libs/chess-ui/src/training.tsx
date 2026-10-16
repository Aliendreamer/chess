import { legalTargets, lineSans } from '@chess/core'
import { AppLink, Button, Chip, ErrorText, Panel, href, useAdoptTyped } from './ui.tsx'
import { Board, PromotionPicker } from './board.tsx'
import {
  SET_SIZE,
  firstMoveLabel,
  misses,
  promptText,
  sanOf,
  scoreText,
  sourceText,
  verdictText,
} from './training-model.ts'
import type { ReactNode } from 'react'
import type { SquarePair } from '@chess/core'
import type { PreviewState } from './review-model.ts'
import type {
  AnswerBoard,
  Mark,
  TrainingAnswer,
  TrainingFilters,
  TrainingItem,
  TrainingPhase,
  TrainingSettings,
  TrainingSummary,
  TrainingVerdict,
} from './training-model.ts'

/**
 * Training sessions (training D5): the start panel, the board and its panel while answering, the summary after a set,
 * and the counts on the member's own profile. Presentational; the session is `lib/training.ts#sessionReducer`.
 */

const FIELD =
  'w-full rounded-control border border-line-default bg-surface-inset px-3 py-2 text-fg-primary placeholder:text-fg-muted'

const PHASES: ReadonlyArray<{ value: TrainingPhase; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'middlegame', label: 'Middlegame' },
  { value: 'endgame', label: 'Endgame' },
]

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The pool for the chosen mode, in words. */
export function poolText(mode: TrainingSettings['mode'], summary: TrainingSummary): string {
  if (mode === 'games') {
    const g = summary.games
    return `${plural(g.positions, 'position')} from your games · ${g.learned} learned · ${g.due} due`
  }
  const l = summary.library
  return `${plural(l.pool, 'master position')} · ${l.seen} seen · ${l.learned} learned · ${l.due} due`
}

function emptyText(settings: TrainingSettings): string {
  return settings.mode === 'games'
    ? 'No mistakes to train yet. Finished games are reviewed by the engine on their own, and your mistakes and blunders join here.'
    : 'No master position matches these filters.'
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-fg-secondary">
      {label}
      {children}
    </label>
  )
}

function yearOf(value: string): number | undefined {
  const n = Number(value)
  return value.trim() && Number.isInteger(n) ? n : undefined
}

/** Opening, phase, player and years for master games. */
function MasterFilters({
  filters,
  onChange,
}: {
  filters: TrainingFilters
  onChange: (filters: TrainingFilters) => void
}) {
  const set = (patch: Partial<TrainingFilters>) => onChange({ ...filters, ...patch })
  const openingRef = useAdoptTyped<HTMLInputElement>((opening) => set({ opening }))
  const playerRef = useAdoptTyped<HTMLInputElement>((player) => set({ player }))
  const phase = filters.phase ?? 'any'
  return (
    <div className="flex flex-col gap-3" data-testid="training-filters">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Opening">
          <input
            ref={openingRef}
            className={FIELD}
            placeholder="B90 or Najdorf"
            value={filters.opening ?? ''}
            onChange={(e) => set({ opening: e.target.value })}
          />
        </Field>
        <Field label="Player">
          <input
            ref={playerRef}
            className={FIELD}
            placeholder="Carlsen"
            value={filters.player ?? ''}
            onChange={(e) => set({ player: e.target.value })}
          />
        </Field>
        <Field label="From year">
          <input
            className={FIELD}
            inputMode="numeric"
            placeholder="1900"
            value={filters.from ?? ''}
            onChange={(e) => set({ from: yearOf(e.target.value) })}
          />
        </Field>
        <Field label="To year">
          <input
            className={FIELD}
            inputMode="numeric"
            placeholder="2026"
            value={filters.to ?? ''}
            onChange={(e) => set({ to: yearOf(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Phase">
        {PHASES.map((p) => (
          <Chip key={p.value} selected={phase === p.value} onClick={() => set({ phase: p.value })}>
            {p.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export interface TrainingStartProps {
  settings: TrainingSettings
  summary: TrainingSummary
  /** The last start found nothing. */
  empty: boolean
  busy: boolean
  error: string | null
  onChange: (settings: TrainingSettings) => void
  onStart: () => void
}

/** Mode, filters (master games), length, the pool's size and Start. */
export function TrainingStart({
  settings,
  summary,
  empty,
  busy,
  error,
  onChange,
  onStart,
}: TrainingStartProps) {
  const set = (patch: Partial<TrainingSettings>) => onChange({ ...settings, ...patch })
  return (
    <Panel variant="filled" className="max-w-2xl gap-4" testId="training-start">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Mode">
        <Chip selected={settings.mode === 'games'} onClick={() => set({ mode: 'games' })}>
          My games
        </Chip>
        <Chip selected={settings.mode === 'library'} onClick={() => set({ mode: 'library' })}>
          Master games
        </Chip>
      </div>
      {settings.mode === 'library' ? (
        <MasterFilters filters={settings.filters} onChange={(filters) => set({ filters })} />
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Length">
        <Chip selected={settings.length === SET_SIZE} onClick={() => set({ length: SET_SIZE })}>
          10 positions
        </Chip>
        <Chip selected={settings.length === 'endless'} onClick={() => set({ length: 'endless' })}>
          Endless
        </Chip>
      </div>
      <p className="m-0 text-sm text-fg-secondary" data-testid="training-pool">
        {poolText(settings.mode, summary)}
      </p>
      {empty ? (
        <p className="m-0 text-sm text-fg-primary" data-testid="training-empty" role="status">
          {emptyText(settings)}
        </p>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <div>
        <Button variant="primary" disabled={busy} onClick={onStart}>
          Start
        </Button>
      </div>
    </Panel>
  )
}

/** The board of a position: answerable until the move is sent, then showing the move and the engine's best. */
export function TrainingBoard({
  fen,
  orientation,
  board,
  enabled,
  lastMove = null,
  arrows = [],
}: {
  fen: string
  orientation: 'white' | 'black'
  board: AnswerBoard
  enabled: boolean
  lastMove?: SquarePair | null
  arrows?: ReadonlyArray<SquarePair>
}) {
  return (
    <div
      className="flex max-w-(--board-max) flex-col gap-3"
      data-testid="training-board"
      data-fen={fen}
    >
      <Board
        fen={fen}
        orientation={orientation}
        lastMove={lastMove}
        arrows={arrows}
        selected={board.selected}
        targets={board.selected ? legalTargets(fen, board.selected) : []}
        {...(enabled ? { onSquareClick: board.onSquareClick, onDrop: board.onDrop } : {})}
      />
      {board.promotion ? (
        <PromotionPicker
          color={orientation}
          onPick={board.pickPromotion}
          onCancel={board.cancelPromotion}
        />
      ) : null}
    </div>
  )
}

/** ✓ ✗ · for a set of 10. */
export function ProgressStrip({ marks }: { marks: ReadonlyArray<Mark> }) {
  const right = marks.filter((m) => m === '✓').length
  const wrong = marks.filter((m) => m === '✗').length
  return (
    <p
      className="m-0 flex gap-1 font-mono text-base"
      role="img"
      aria-label={`${right} right, ${wrong} wrong, ${marks.length - right - wrong} to go`}
      data-testid="training-progress"
    >
      {marks.map((m, i) => (
        <span
          key={i}
          aria-hidden
          className={
            m === '✓' ? 'text-status-win' : m === '✗' ? 'text-status-loss' : 'text-fg-muted'
          }
        >
          {m}
        </span>
      ))}
    </p>
  )
}

function SourceLine({ verdict }: { verdict: TrainingVerdict }) {
  const s = verdict.source
  return (
    <p className="m-0 text-xs text-fg-muted" data-testid="training-source">
      {sourceText(s)}
      {' · '}
      {s.kind === 'library' ? (
        <AppLink
          to={href('/analysis', { library: s.libraryGameId, ply: s.ply })}
          className="text-fg-accent"
        >
          the game
        </AppLink>
      ) : (
        <AppLink to={`/games/${encodeURIComponent(s.gameId)}`} className="text-fg-accent">
          the game
        </AppLink>
      )}
    </p>
  )
}

/**
 * The verdict on an answer: right or wrong in words (the master's move named), the engine's line — each move a
 * button that plays the line up to it on the board — and where the position comes from.
 */
export function TrainingVerdictView({
  item,
  answer,
  verdict,
  preview,
  onPreview,
}: {
  item: TrainingItem
  /** The member's move. */
  answer: string
  verdict: TrainingVerdict
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
}) {
  const line = lineSans(item.fen, verdict.bestLine)
  const showing = preview?.upTo ?? 0
  return (
    <div className="flex flex-col gap-2" data-testid="training-verdict" aria-live="polite">
      <p className="m-0 text-sm text-fg-secondary">{`You played ${firstMoveLabel(item.fen, sanOf(item.fen, answer))}.`}</p>
      <p
        className={`m-0 text-sm font-medium ${verdict.correct ? 'text-status-win' : 'text-status-loss'}`}
        data-testid="training-verdict-text"
      >
        {verdictText(item, verdict)}
      </p>
      {line.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Engine line">
          <span className="text-sm text-fg-secondary">Engine:</span>
          {line.map((san, i) => (
            <button
              key={`${i}-${san}`}
              type="button"
              aria-pressed={showing === i + 1}
              onClick={() => onPreview({ ply: 0, upTo: i + 1 })}
              className={`cursor-pointer rounded-control border px-1.5 py-0.5 font-mono text-sm pointer-coarse:min-h-11 ${showing === i + 1 ? 'border-line-accent bg-surface-accent-tint text-fg-primary' : 'border-line-default bg-surface-raised text-fg-primary hover:border-line-accent'} ${i === 0 ? 'font-semibold' : ''}`}
            >
              {i === 0 ? firstMoveLabel(item.fen, san) : san}
            </button>
          ))}
          {showing > 0 ? (
            <button
              type="button"
              onClick={() => onPreview(null)}
              className="cursor-pointer text-sm text-fg-accent underline-offset-2 hover:underline"
            >
              Back to the position
            </button>
          ) : null}
        </div>
      ) : null}
      <SourceLine verdict={verdict} />
      {verdict.learned ? <p className="m-0 text-xs text-fg-secondary">Learned.</p> : null}
    </div>
  )
}

export interface TrainingPanelProps {
  item: TrainingItem
  /** A set's strip, or null for an endless session (the running score is shown instead). */
  marks: ReadonlyArray<Mark> | null
  answers: ReadonlyArray<TrainingAnswer>
  pool: number | null
  played: string | null
  verdict: TrainingVerdict | null
  busy: boolean
  error: string | null
  preview: PreviewState | null
  onPreview: (preview: PreviewState | null) => void
  onNext: () => void
  onFinish: () => void
}

/** Beside the board: the question, the progress, then the verdict and Next (Enter). */
export function TrainingPanel({
  item,
  marks,
  answers,
  pool,
  played,
  verdict,
  busy,
  error,
  preview,
  onPreview,
  onNext,
  onFinish,
}: TrainingPanelProps) {
  return (
    <Panel variant="filled" className="gap-3" testId="training">
      <p className="m-0 font-display text-display-xs" data-testid="training-prompt">
        {promptText(item)}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {marks ? (
          <ProgressStrip marks={marks} />
        ) : (
          <p className="m-0 font-mono text-base" data-testid="training-score">
            {scoreText(answers)}
          </p>
        )}
        <span className="text-xs text-fg-muted">
          {[
            item.box === null ? 'New position' : `Box ${item.box}`,
            pool === null ? null : `${pool} in the pool`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {verdict && played ? (
        <>
          <TrainingVerdictView
            item={item}
            answer={played}
            verdict={verdict}
            preview={preview}
            onPreview={onPreview}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={onNext} aria-keyshortcuts="Enter">
              Next
            </Button>
            {marks ? null : (
              <Button disabled={busy} onClick={onFinish}>
                Finish
              </Button>
            )}
          </div>
        </>
      ) : (
        <p className="m-0 text-sm text-fg-secondary">
          {played ? 'Checking your move…' : 'Play your move on the board.'}
        </p>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Panel>
  )
}

/** After a set (or Finish): the score, the misses to look at again, another set or other settings. */
export function TrainingSummaryView({
  answers,
  length,
  revisit,
  onRevisit,
  onAgain,
  onSettings,
}: {
  answers: ReadonlyArray<TrainingAnswer>
  length: TrainingSettings['length']
  revisit: number | null
  onRevisit: (index: number) => void
  onAgain: () => void
  onSettings: () => void
}) {
  const missed = misses(answers)
  return (
    <Panel variant="filled" className="gap-3" testId="training-summary">
      <p className="m-0 font-display text-display-sm" data-testid="training-final-score">
        {scoreText(answers)}
      </p>
      {missed.length === 0 ? (
        <p className="m-0 text-sm text-fg-secondary">No misses.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Misses">
          {missed.map((i) => {
            const a = answers[i]!
            return (
              <li key={a.item.id}>
                <button
                  type="button"
                  aria-pressed={revisit === i}
                  onClick={() => onRevisit(i)}
                  className={`w-full cursor-pointer rounded-control border px-3 py-2 text-left text-sm pointer-coarse:min-h-11 ${revisit === i ? 'border-line-accent bg-surface-accent-tint text-fg-primary' : 'border-line-default text-fg-body hover:bg-surface-hover'}`}
                >
                  {sourceText(a.verdict.source)}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onAgain}>
          {length === SET_SIZE ? 'Another 10' : 'Again'}
        </Button>
        <Button onClick={onSettings}>Change settings</Button>
      </div>
    </Panel>
  )
}

/** The member's training on their own profile, linking to the page. */
export function TrainingCounts({ summary }: { summary: TrainingSummary }) {
  const g = summary.games
  const l = summary.library
  return (
    <div className="flex flex-col gap-1 text-sm text-fg-primary">
      <p className="m-0" data-testid="training-counts-games">
        {`My games: ${plural(g.positions, 'mistake')} · ${g.learned} learned · ${g.due} due`}
      </p>
      <p className="m-0" data-testid="training-counts-library">
        {`Master games: ${l.seen} seen · ${l.learned} learned · ${l.due} due`}
      </p>
      <AppLink to={'/training'} className="text-fg-accent">
        Train
      </AppLink>
    </div>
  )
}
