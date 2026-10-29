import { STANDARD_START, groupFamilies, legalTargets, uciSquares } from '@chess/core'
import { AppLink, Button, Panel, href } from './ui.tsx'
import { Board, PromotionPicker } from './board.tsx'
import { lineState, lineText, movesText, sanAt, studyLineLabel } from './trainer-model.ts'
import type { ReactNode } from 'react'
import type {
  Drill,
  FamilyProgress,
  RunResult,
  StudyLine,
  StudyTraining,
  TrainedFamily,
  TrainerColor,
  TrainerLine,
} from './trainer-model.ts'

/**
 * The opening trainer (opening-trainer): families with their progress, the drill's feedback, a family's lines, and the
 * families on the member's own profile; and the member's own studies as lines (study-repertoire-trainer).
 * Presentational; the drill itself is `useDrill` in `lib/trainer.ts`.
 */

const COLOR_LABEL: Record<TrainerColor, string> = { white: 'White', black: 'Black' }

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function dueText(at: string): string {
  return DAY.format(new Date(at))
}

/** "23 of 41 learned" with a bar. */
export function LearnedBar({ learned, lines }: { learned: number; lines: number }) {
  const label = `${learned} of ${lines} learned`
  const share = lines === 0 ? 0 : Math.round((learned / lines) * 100)
  return (
    <span className="flex items-center gap-3">
      <span
        role="img"
        aria-label={label}
        className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-inset"
      >
        <span className="bg-status-win" style={{ width: `${share}%` }} />
      </span>
      <span className="font-mono text-xs text-fg-secondary">{label}</span>
    </span>
  )
}

/** In a list: "36 lines" until something is learned, then "3/36 learned" in the accent colour. */
export function LearnedCount({ learned, lines }: { learned: number; lines: number }) {
  return learned > 0 ? (
    <span className="shrink-0 font-mono text-xs text-fg-accent">{`${learned}/${lines} learned`}</span>
  ) : (
    <span className="shrink-0 text-xs text-fg-muted">{plural(lines, 'line', 'lines')}</span>
  )
}

const CHIP =
  'rounded-pill border px-3 py-1.5 text-sm no-underline pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center'

/**
 * The colour to train, as links (works before hydration); `family` keeps the family, `study` the study, `q` the search,
 * `studies` the "My studies" list.
 */
export function ColorSwitch({
  color,
  family,
  study,
  q,
  studies = false,
}: {
  color: TrainerColor
  family?: string
  study?: string
  q?: string
  studies?: boolean
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="Train as">
      {(['white', 'black'] as const).map((c) => {
        const className = `${CHIP} ${c === color ? 'border-line-accent bg-surface-accent-tint text-fg-primary' : 'border-line-default text-fg-body hover:bg-surface-hover'}`
        const current = c === color ? ({ 'aria-current': 'page' } as const) : {}
        const label = `As ${COLOR_LABEL[c]}`
        if (family)
          return (
            <AppLink
              to={href(`/trainer/${encodeURIComponent(family)}`, { color: c })}
              key={c}
              className={className}
              {...current}
            >
              {label}
            </AppLink>
          )
        if (study)
          return (
            <AppLink
              to={href(`/trainer/study/${encodeURIComponent(study)}`, { color: c })}
              key={c}
              className={className}
              {...current}
            >
              {label}
            </AppLink>
          )
        return (
          <AppLink
            to={href('/trainer', {
              color: c,
              ...(q ? { q } : {}),
              ...(studies ? { source: 'studies' as const } : {}),
            })}
            key={c}
            className={className}
            {...current}
          >
            {label}
          </AppLink>
        )
      })}
    </div>
  )
}

/**
 * The families as columns by kind (gambits, defences, openings, games), side by side, each scrolling on its own so the
 * page fits the screen; a kind the search left empty is not shown.
 */
export function FamilyColumns({
  families,
  color,
}: {
  families: ReadonlyArray<FamilyProgress>
  color: TrainerColor
}) {
  if (families.length === 0)
    return <p className="m-0 text-sm text-fg-secondary">No opening matches.</p>
  return (
    <div
      className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-6 shell:min-h-0 shell:flex-1"
      data-testid="trainer-families"
    >
      {groupFamilies(families)
        .filter((g) => g.families.length > 0)
        .map((g) => (
          <section
            key={g.kind}
            className="flex min-h-0 min-w-0 flex-col gap-2"
            aria-label={g.label}
          >
            <h2 className="m-0 flex items-baseline justify-between gap-2 font-display text-lg font-normal">
              {g.label}
              <span className="font-sans text-xs text-fg-muted">{g.families.length}</span>
            </h2>
            <ul className="m-0 flex list-none flex-col p-0 shell:min-h-0 shell:overflow-y-auto shell:pr-1">
              {g.families.map((f) => (
                <li
                  key={f.name}
                  className="flex items-baseline justify-between gap-3 border-b border-line-divider py-2"
                >
                  <AppLink
                    to={href(`/trainer/${encodeURIComponent(f.name)}`, { color })}
                    className="min-w-0 truncate text-sm text-fg-primary no-underline hover:text-fg-accent"
                  >
                    {f.name}
                  </AppLink>
                  <LearnedCount learned={f.learned} lines={f.lines} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}

/**
 * What the drill wants now: the member's move, the board's, the right move after a wrong one, or this line's move
 * after one of the study's other lines (not a mistake).
 */
export function DrillStatus({
  line,
  ply,
  yourMove,
  wrong,
  otherLine = null,
  hint = null,
  startFen = STANDARD_START,
}: {
  line: { moves: ReadonlyArray<string> }
  ply: number
  yourMove: boolean
  wrong: Drill['wrong']
  otherLine?: Drill['otherLine']
  hint?: Drill['hint']
  startFen?: string
}) {
  const san = (uci?: string) => sanAt(line.moves, ply, uci, startFen)
  const text = wrong
    ? `${san(wrong.played)} is not the line. Play ${san()}.`
    : otherLine
      ? `${san(otherLine.played)} is your other line here. This one goes ${san()}.`
      : hint
        ? `Hint: ${san()}.`
        : yourMove
          ? 'Your move.'
          : 'The board plays…'
  return (
    <p
      className={`m-0 text-sm ${wrong ? 'text-status-loss' : 'text-fg-secondary'}`}
      data-testid="drill-status"
      aria-live="polite"
    >
      {text}
    </p>
  )
}

/** What a finished run did to the line. */
export function RunOutcome({ result, mistakes }: { result: RunResult; mistakes: number }) {
  const text =
    mistakes > 0
      ? `${plural(mistakes, 'mistake', 'mistakes')}. This line comes back first.`
      : `Clean. ${result.learned ? 'Learned — due' : 'Due'} again ${dueText(result.dueAt)}.`
  return (
    <p className="m-0 text-sm text-fg-primary" data-testid="run-outcome" aria-live="polite">
      {text}
    </p>
  )
}

export function LinesTable({ lines }: { lines: ReadonlyArray<TrainerLine> }) {
  return (
    <table className="w-full border-collapse text-sm" aria-label="Lines">
      <thead>
        <tr className="text-left text-2xs uppercase tracking-wide text-fg-muted">
          <th className="py-1.5 font-medium">Line</th>
          <th className="py-1.5 font-medium">ECO</th>
          <th className="py-1.5 font-medium">State</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const state = lineState(l)
          return (
            <tr key={l.key} className="border-t border-line-divider">
              <th scope="row" className="py-2 pr-3 text-left font-normal">
                {l.name}
              </th>
              <td className="py-2 pr-3 font-mono text-fg-secondary">{l.eco}</td>
              <td
                className={`py-2 ${state === 'learned' ? 'text-status-win' : state === 'learning' ? 'text-fg-accent' : 'text-fg-muted'}`}
              >
                {state}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** The member's own profile: the families they have trained. */
export function TrainedFamilies({ families }: { families: ReadonlyArray<TrainedFamily> }) {
  if (families.length === 0)
    return (
      <p className="m-0 text-sm text-fg-secondary">
        No openings trained yet.{' '}
        <AppLink to={href('/trainer', { color: 'white' })} className="text-fg-accent">
          Open the trainer
        </AppLink>
      </p>
    )
  return (
    <ul className="m-0 flex list-none flex-col p-0" data-testid="trained-families">
      {families.map((f) => (
        <li
          key={`${f.name}|${f.color}`}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-divider py-2"
        >
          <AppLink
            to={href(`/trainer/${encodeURIComponent(f.name)}`, { color: f.color })}
            className="text-fg-primary no-underline hover:text-fg-accent"
          >
            {`${f.name} · as ${COLOR_LABEL[f.color]}`}
          </AppLink>
          <LearnedBar learned={f.learned} lines={f.lines} />
        </li>
      ))}
    </ul>
  )
}

/** The named openings or the member's own studies, as links (works before hydration). */
export function TrainerSourceSwitch({
  source,
  color,
}: {
  source: 'named' | 'studies'
  color: TrainerColor
}) {
  const chip = (selected: boolean) =>
    `${CHIP} ${selected ? 'border-line-accent bg-surface-accent-tint text-fg-primary' : 'border-line-default text-fg-body hover:bg-surface-hover'}`
  return (
    <div className="flex gap-2" role="group" aria-label="Train">
      <AppLink
        to={href('/trainer', { color })}
        className={chip(source === 'named')}
        {...(source === 'named' ? { 'aria-current': 'page' as const } : {})}
      >
        Named openings
      </AppLink>
      <AppLink
        to={href('/trainer', { color, source: 'studies' })}
        className={chip(source === 'studies')}
        {...(source === 'studies' ? { 'aria-current': 'page' as const } : {})}
      >
        My studies
      </AppLink>
    </div>
  )
}

/** The member's own studies with their lines for the side, each opening its drill. */
export function TrainerStudyList({
  studies,
  color,
}: {
  studies: ReadonlyArray<StudyTraining>
  color: TrainerColor
}) {
  if (studies.length === 0)
    return (
      <p className="m-0 text-sm text-fg-secondary">
        No studies yet: every line of a study you make can be drilled here.{' '}
        <AppLink to={'/studies'} className="text-fg-accent">
          Make a study
        </AppLink>
      </p>
    )
  return (
    <ul
      className="m-0 flex list-none flex-col p-0 shell:min-h-0 shell:flex-1 shell:overflow-y-auto shell:pr-1"
      data-testid="trainer-studies"
    >
      {studies.map((s) => (
        <li
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-divider py-2.5"
        >
          <AppLink
            to={href(`/trainer/study/${encodeURIComponent(s.id)}`, { color })}
            className="min-w-0 text-fg-primary no-underline hover:text-fg-accent"
          >
            {s.title}
          </AppLink>
          <LearnedCount learned={s.learned} lines={s.lines} />
        </li>
      ))}
    </ul>
  )
}

/** Shown open up to this many lines; a bigger study's list is folded. */
const LINES_OPEN = 50

/** A study's lines, named from where they leave the main line, with their state. */
export function StudyLinesTable({
  lines,
  startFen,
}: {
  lines: ReadonlyArray<StudyLine>
  startFen: string
}) {
  const main = lines[0]?.moves ?? []
  const table = (
    <table className="w-full border-collapse text-sm" aria-label="Lines">
      <thead>
        <tr className="text-left text-2xs uppercase tracking-wide text-fg-muted">
          <th className="py-1.5 font-medium">Line</th>
          <th className="py-1.5 font-medium">State</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const state = lineState(l)
          return (
            <tr key={l.key} className="border-t border-line-divider">
              <th scope="row" className="py-2 pr-3 text-left font-mono font-normal">
                {studyLineLabel(main, l.moves, startFen)}
              </th>
              <td
                className={`py-2 ${state === 'learned' ? 'text-status-win' : state === 'learning' ? 'text-fg-accent' : 'text-fg-muted'}`}
              >
                {state}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
  return lines.length > LINES_OPEN ? (
    <details>
      <summary className="cursor-pointer text-sm text-fg-accent">{`${lines.length} lines`}</summary>
      {table}
    </details>
  ) : (
    table
  )
}

/**
 * A drill on the board and its panel, for a named line or a study's (study-repertoire-trainer D8: any start). The
 * route runs `useDrill` and passes the result; the panel adds the run's outcome as `children`.
 */
export function DrillLayout({
  drill,
  color,
  title,
  moves,
  startFen = STANDARD_START,
  children,
}: {
  drill: Drill
  color: TrainerColor
  title: string
  moves: ReadonlyArray<string>
  startFen?: string
  children?: ReactNode
}) {
  const hintArrow = uciSquares(drill.hint)
  return (
    <div className="grid grid-cols-1 items-start gap-6 shell:grid-cols-[minmax(0,var(--board-max))_minmax(0,360px)] shell:gap-8">
      <div className="flex max-w-(--board-max) flex-col gap-3" data-testid="drill-board">
        <Board
          fen={drill.fen}
          orientation={color}
          lastMove={uciSquares(moves[drill.ply - 1])}
          arrows={hintArrow ? [hintArrow] : []}
          selected={drill.selected}
          targets={drill.selected ? legalTargets(drill.fen, drill.selected) : []}
          {...(drill.yourMove ? { onSquareClick: drill.onSquareClick, onDrop: drill.onDrop } : {})}
        />
        {drill.promotion ? (
          <PromotionPicker
            color={color}
            onPick={drill.pickPromotion}
            onCancel={drill.cancelPromotion}
          />
        ) : null}
      </div>
      <Panel variant="filled" className="gap-3" testId="drill">
        <p className="m-0 font-display text-display-xs" data-testid="drill-line">
          {title}
        </p>
        <p className="m-0 min-h-5 font-mono text-sm text-fg-body" data-testid="drill-moves">
          {lineText(moves, drill.ply, startFen)}
        </p>
        {drill.lineShown && !drill.done ? (
          <p className="m-0 font-mono text-sm text-fg-secondary" data-testid="drill-coming">
            Still to come: {movesText(moves, drill.ply, moves.length, startFen)}
          </p>
        ) : null}
        {drill.done ? null : (
          <DrillStatus
            line={{ moves }}
            ply={drill.ply}
            yourMove={drill.yourMove}
            wrong={drill.wrong}
            otherLine={drill.otherLine}
            hint={drill.hint}
            startFen={startFen}
          />
        )}
        {drill.done ? null : (
          <div className="flex flex-wrap gap-2">
            {drill.lineShown ? (
              <Button size="sm" onClick={drill.hideLine} data-testid="drill-hide-line">
                Hide the line
              </Button>
            ) : (
              <Button size="sm" onClick={drill.showLine} data-testid="drill-show-line">
                Show the line
              </Button>
            )}
            <Button
              size="sm"
              onClick={drill.askHint}
              disabled={!drill.yourMove || drill.hint !== null}
              data-testid="drill-hint"
            >
              Hint
            </Button>
          </div>
        )}
        {children}
      </Panel>
    </div>
  )
}
